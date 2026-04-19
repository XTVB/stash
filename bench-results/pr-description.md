# [Feature] Speed up file-based auto-tag (preload + parallelize)

# Scope

File-based auto-tag is O(files × entities) in the worst case, and on large libraries the per-file SQL prefilter, per-file regex recompile, and serial processing compound to make the job effectively unusable (multi-hour runs at stashdb-comparable scale — see bench). This PR keeps the matching semantics identical and attacks the constant factors.

## Commits

Two commits, kept separate on purpose:

1. **Speed up file-based auto-tag** — the whole perf change: preload, prefix index, parallelism, keyset pagination, bulk alias loading, per-path precompute, regexp cache (as `lru.Cache` to match `pkg/sqlite/regex.go`'s house style).
2. **Use sync.Map instead of LRU for the per-job regexp cache** — swaps only the cache data structure. The auto-tag cache is job-scoped (so LRU's eviction buys nothing) and is hit by every worker on every candidate, so the hashicorp LRU's per-Get mutex becomes a contention point under the parallel worker pool — measurable regression at the large preset. `sync.Map`'s read-optimised path avoids that. Kept as its own commit so it can be reverted cleanly if you'd prefer to keep style consistency with `pkg/sqlite/regex.go` and accept the slowdown.

## Idea

Auto-tag's hot loop is: for every file, ask the DB for performers/studios/tags whose name prefix looks like it could match a path word, then regex-check each candidate against the path. When you're tagging 100k files against 100k performers, that's 100k prefilter queries plus an enormous amount of repeated regex compilation and `strings.ToLower` over the same strings.

Flip it: the candidate set doesn't change across files in one job, so **preload it once**, index it for fast per-path lookup, and let workers process files in parallel.

## Design choices

- **2-rune prefix index.** The preload builds `map[2-rune-prefix] → []candidate` over names and (for studios/tags) aliases. Per-file lookup then unions the candidate slices for each path word's 2-rune prefix. Mirrors the SQL `name LIKE 'xx%'` prefilter and feeds the same downstream regex matcher — so correctness is determined by the regex, not the prefix.
- **Always-check list for single-letter-word names.** A name like "X Man" wouldn't be reached by any 2-rune path-word key, so those entries stay in a separate slice that's always unioned in. Mirrors the existing `singleFirstCharacterRegex` fallback.
- **Preload is opt-in by code path, not config.** The file-based auto-tag job preloads; everything else (built-in scraper, single-scene tagging) still takes the old per-call SQL-prefilter path via the same `PathTo{Performers,Studio,Tags}` entry points. There's no new configuration surface and no behavior change for non-bulk callers.
- **Bulk alias loading via an optional interface.** Added `AllAliasLoader` alongside `AliasLoader`. Callers type-assert; stores that don't implement it fall back to per-id `GetAliases`. Avoids an N+1 during preload without forcing every implementation to add a new method.
- **Parallelism reuses `job.TaskQueue`.** Worker count comes from the existing `ParallelTasksWithAutoDetection` setting rather than a new knob.
- **Keyset pagination in the scene/image/gallery query loop.** `WHERE id > lastID ORDER BY id` replaces LIMIT/OFFSET so batch N doesn't pay an O(offset) scan past earlier rows. Without this, throughput degrades as the job progresses.
- **Short-lived write transactions.** One write txn per applied match instead of one long-held txn wrapping each tagger phase. Keeps contention low under the worker pool.
- **Compiled-regexp cache + per-path precompute.** Same candidate names repeat across thousands of files, so compile once per `(name, useUnicode)` key. `strings.ToLower(path)` and `allASCII(path)` move out of the per-candidate inner loop into a `pathMatcher` built once per file.
- **Tagger gains `*AtPath` methods.** They own the cache and the TxnManager, so `task_autotag.go` stays thin. Tests were updated to exercise the new entry point; the old free functions are removed (the package is `internal/`, so this has no external-API impact).

## Trade-off

The preloaded index holds every non-ignored performer/studio/tag + aliases + compiled regexps in memory for the duration of the job. On a stashdb-comparable library (~100k performers / 13k studios / 3k tags) this is ~573 MiB heap / ~724 MiB peak RSS — job-scoped, released after the run. The baseline uses almost no extra RAM but takes ~4 hours at that scale; this code finishes in ~2 minutes. See bench below.

# Testing

Correctness is guarded at three layers:

1. **`pkg/match/path_semantic_test.go` (new, ~425 lines).** Drives `PathToPerformers`, `PathToStudio`, and `PathToTags` through the existing generated testify mocks in `pkg/models/mocks` (same infrastructure the `internal/autotag/*_test.go` suite uses via `mocks.NewDatabase()`) against representative inputs (plain name, separator variants, case-insensitivity, unicode, ignore_auto_tag, no-substring-match, multiple-match rightmost-wins, alias matching). Each case runs **twice** — once with `cache=nil` (the old SQL-prefilter path) and once with a preloaded cache — asserting identical output. This is the regression guard: if the preloaded path ever diverges from the SQL-prefilter path, the matching suite fails.
2. **`pkg/match/cache_test.go` (new).** Unit tests for `firstTwoRunesLower` (incl. unicode and single-rune edge cases), the regexp cache (hit/miss by `(name, useUnicode)` key, nil-cache fallback), and the preload + candidate-lookup path (prefix union across path words, always-check inclusion, ignore_auto_tag honored). Also uses the generated `pkg/models/mocks`.
3. **`internal/autotag/{scene,image,gallery}_test.go`.** Existing mock-based tagger tests were updated to drive the new `Tagger.*AtPath` methods with the same fixtures and assertions. Same regression coverage, new entry point.

# Benchmarks

Comparison between **baseline** — file-based auto-tag as it stood before the perf work — and **new** — preload + parallelize + bulk aliases.

Both runs use the same seeded synthetic DB content designed to match realistic use so that the DB is **identical** across baseline and new at each preset size. File types split 60/30/10 scenes/images/galleries. Match distribution: ~30% multi-match, ~50% single-match, ~20% no-match.

Hardware: MacBook (ARM, Darwin 25.2.0), Go 1.26.

| column | meaning |
|--------|---------|
| **time** | wall-clock for the file-based auto-tag run (excludes DB setup) |
| **heap in use** | `runtime.MemStats.HeapInuse` at end of run (post-GC of setup garbage) |
| **peak rss** | `getrusage(RUSAGE_SELF).ru_maxrss` at end of run — process-lifetime peak |
| **total alloc** | cumulative allocations during the run (not retained memory) |
| **gc** | GC cycles during the run |

---

## tiny — 100 performers · 20 studios · 50 tags · 1 000 files

| run | time | heap in use | peak rss | total alloc | gc |
|-----|------|-------------|----------|-------------|----|
| baseline | 309ms | 4.3 MiB | 38.0 MiB | 101.4 MiB | 77 |
| **new** | **107ms** | 5.1 MiB | 39.5 MiB | 36.5 MiB | 22 |
| ratio | **2.9× faster** | +0.8 MiB | +1.5 MiB | −64% | −71% |

Small absolute numbers, no regression at low scale — new is still meaningfully faster even when the preload overhead has little to amortize against.

## small — 1 000 performers · 200 studios · 300 tags · 10 000 files

| run | time | heap in use | peak rss | total alloc | gc |
|-----|------|-------------|----------|-------------|----|
| baseline | 9.045s | 5.8 MiB | 46.3 MiB | 5.0 GiB | 2 339 |
| **new** | **1.238s** | 14.7 MiB | 60.5 MiB | 461.7 MiB | 79 |
| ratio | **7.3× faster** | +8.9 MiB | +14.2 MiB | −91% | −97% |

Allocation churn drops sharply (5.0 GiB → 461 MiB) — the prefix index and regex cache eliminate most of the per-file regex compilation & name string-lowering that the baseline pays on every file.

## medium — 10 000 performers · 1 300 studios · 1 000 tags · 50 000 files

| run | time | heap in use | peak rss | total alloc | gc |
|-----|------|-------------|----------|-------------|----|
| baseline | 4m 7.016s | 11.5 MiB | 57.8 MiB | 187.3 GiB | 34 357 |
| **new** | **9.208s** | 62.5 MiB | 129.2 MiB | 4.2 GiB | 135 |
| ratio | **26.8× faster** | +51.0 MiB | +71.4 MiB | −98% | −99.6% |

Baseline burns 187 GiB of transient allocations across 34 k GC cycles — symptom of the per-file `QueryForAutoTag` + regex-recompile + path-lowercase treadmill. The preload fixes all three.

## large — 100 000 performers · 13 000 studios · 3 000 tags · 100 000 files

| run | time | heap in use | peak rss | total alloc | gc |
|-----|------|-------------|----------|-------------|----|
| baseline | **aborted after 29:30** *(see note)* | — | — | — | — |
| **new** | **2m 10.997s** | 573.5 MiB | 724.4 MiB | 46.6 GiB | 170 |
| ratio | **≥13× faster** (lower bound) | — | — | — | — |

**Note on baseline**: we let baseline-large run for 29:30 CPU time and checked DB state — it had processed 13 395 / 60 000 scenes (22.3%) and hadn't started images (30k) or galleries (10k). Extrapolating the observed ~7 scenes/sec rate, baseline-large would need **~3.5 more hours** to complete (~4 hours total). We aborted to save compute. The **≥13× faster** ratio uses only the ~30 min observed on baseline, not the extrapolated full run; with the full run the multiplier is ~60×.

Memory footprint at this scale: **573 MiB heap in use / 724 MiB peak RSS**. The preloaded in-memory candidate set (100 k performers × pointer + prefix index + regex cache + all aliases) is the price for the throughput gain. For reference: stashdb's ~100 k performers / 13 k studios / 3 k tags fits comfortably in this envelope on any modern machine; the baseline is effectively unusable at this scale (4-hour auto-tag run) even though it uses little memory.

---

## Summary

| preset | baseline | new | speedup |
|--------|----------|-----|---------|
| tiny   | 309ms    | 107ms   | 2.9× |
| small  | 9.045s   | 1.238s  | 7.3× |
| medium | 4m 7s    | 9.2s    | 26.8× |
| large  | ≥~4h (aborted at 22%) | 2m 11s | ≥13× (~60× extrapolated) |

Speedup grows with scale. At the small end the preload + parallelism overhead is already paid back. At stashdb-comparable scale (large) the baseline is unusable for interactive auto-tagging; the new code finishes in 2 minutes.

### Memory trade-off

Heap in use scales with entity count because the preloaded index holds all performers/studios/tags + their aliases + compiled regexps in memory:

| preset | heap in use (baseline → new) | peak rss (baseline → new) |
|--------|------------------------------|---------------------------|
| tiny   |  4.3 MiB →   5.1 MiB |  38.0 MiB →  39.5 MiB |
| small  |  5.8 MiB →  14.7 MiB |  46.3 MiB →  60.5 MiB |
| medium | 11.5 MiB →  62.5 MiB |  57.8 MiB → 129.2 MiB |
| large  |      —  → 573.5 MiB |      —  → 724.4 MiB |

The cache is job-scoped: it's held for the duration of one auto-tag run and released afterwards, so this doesn't inflate the stash process's steady-state RSS. A user with a 100 k-performer library paying 725 MiB peak RSS during a 2-minute auto-tag job (versus 4 hours with negligible extra RAM) is an unambiguous win.
