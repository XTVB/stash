import { useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";

// Module-level scroll position storage — persists across mounts within the SPA session.
// Keyed by location.pathname.
const scrollPositions = new Map<string, number>();

// Use in list pages (via useFilteredItemList) to save/restore scroll position
export function useScrollRestoration(loading: boolean) {
  const history = useHistory();
  const location = useLocation();
  const key = location.pathname;

  // Read history.action during render. The history library sets this BEFORE
  // calling listeners, so it's already "POP" when React Router's listener
  // triggers the re-render. useRef captures only on first mount.
  const shouldRestore = useRef(history.action === "POP");
  const hasRestored = useRef(false);

  // Save scroll position on scroll (debounced) and flush pending saves on cleanup.
  useEffect(() => {
    // On fresh navigation (not back/forward), clear any stale saved position
    if (!shouldRestore.current) {
      scrollPositions.set(key, 0);
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let pendingPosition: number | null = null;

    const handleScroll = () => {
      pendingPosition = window.scrollY;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        scrollPositions.set(key, pendingPosition!);
        pendingPosition = null;
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
      if (pendingPosition !== null) {
        scrollPositions.set(key, pendingPosition);
      }
    };
  }, [key]);

  // Restore scroll position when loading completes on back navigation.
  // Uses a retry loop because the DOM may not be ready immediately
  // (e.g. sidebarStateLoading renders the list as null for a frame or two).
  useEffect(() => {
    if (loading || hasRestored.current || !shouldRestore.current) return;
    hasRestored.current = true;

    const pos = scrollPositions.get(key);
    if (pos === undefined || pos <= 0) return;

    let rafId: number;
    let retries = 0;

    const tryRestore = () => {
      window.scrollTo(0, pos);
      if (Math.abs(window.scrollY - pos) > 1 && retries < 20) {
        retries++;
        rafId = requestAnimationFrame(tryRestore);
      }
    };

    rafId = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(rafId);
  }, [loading, key]);
}
