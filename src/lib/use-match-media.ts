/**
 * Reactive `matchMedia` hook. Returns the current `.matches` value
 * for the given media query and re-renders when it flips.
 *
 * SSR-safe — the initial render returns `false`; the first effect
 * tick updates with the real value once `window` exists.
 *
 * Usage:
 *   const isCompact = useMatchMedia("(max-width: 640px)");
 *   const isTouch   = useMatchMedia("(hover: none)");
 */

import { useEffect, useState } from "react";

export function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent): void => setMatches(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);
  return matches;
}
