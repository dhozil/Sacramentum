"use client";

import * as React from "react";

/**
 * A clock that re-renders on an interval. Uses useSyncExternalStore so reading
 * the current time is treated as an external subscription rather than an impure
 * call during render.
 */
export function useNow(intervalMs = 15000): number {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const id = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(id);
    },
    [intervalMs],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
}
