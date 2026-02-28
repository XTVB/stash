# Stash Fork

Fork of [stashapp/stash](https://github.com/stashapp/stash) — a self-hosted media organizer. Go backend with SQLite, React/TypeScript frontend in `ui/v2.5/`.

## Fork-Specific Changes

- **Favorites**: `favorite` boolean on scenes, images, and galleries (schema, filters, cards, dedicated page)
- **Stale thumbnail fix**: Cache-busting for thumbnails after file content changes

## Fork Schema Strategy

Fork schema changes live in `pkg/sqlite/fork_schema.go`, **not** in migration files. This avoids version-number collisions with upstream migrations on every rebase.

- `appSchemaVersion` in `pkg/sqlite/database.go` always matches upstream's latest
- `ensureForkSchema()` runs idempotently on every startup via `initialise()`
- Fork columns are declared in the `forkColumns` slice — add new ones there
- Upstream migrations run unmodified; fork columns are applied afterward

### Syncing Upstream

```bash
git fetch upstream
git rebase upstream/develop
# Resolve merge conflicts in source files
# Update appSchemaVersion in pkg/sqlite/database.go to match upstream's latest
make generate-backend
make generate-ui  # uses npm, but pnpm is the actual package manager
go build ./...
```

No migration file renumbering or version collision auditing needed.

## Build

- **Backend codegen**: `make generate-backend`
- **UI codegen**: `make generate-ui` (requires `pnpm install` in `ui/v2.5/`)
- **Full build**: `make build`

## Key Paths

- `graphql/schema/` — GraphQL schema definitions
- `internal/api/` — Resolvers and API (includes generated code)
- `pkg/sqlite/` — Database layer, migrations, fork schema
- `pkg/models/` — Go model types
- `ui/v2.5/` — React frontend
