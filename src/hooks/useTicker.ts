'use client';

import { useEffect, useState } from 'react';

/**
 * Re-renders on an interval, for the workout clock and the rest countdown.
 * Time is always read from `Date.now()` rather than counted, so a backgrounded
 * tab (phone in a pocket between sets) still shows the right number.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, intervalMs]);

  return now;
}
