'use client';

import { useCallback } from 'react';
import { useStore } from '@/store/useStore';

type Pattern = 'light' | 'success' | 'warning' | 'notify';

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 12,
  success: [14, 40, 26],
  warning: [10, 30, 10],
  notify: [22, 60, 22, 60, 30],
};

/**
 * Vibration feedback for the moments that matter: a set saved, a PR, rest over.
 * iOS Safari ignores navigator.vibrate, so this is a best-effort nicety and
 * never the only signal — every event also has a visible state change.
 */
export function useHaptics() {
  const enabled = useStore((s) => s.settings.hapticsEnabled);

  return useCallback(
    (pattern: Pattern = 'light') => {
      if (!enabled) return;
      try {
        navigator.vibrate?.(PATTERNS[pattern]);
      } catch {
        /* Unsupported: ignore. */
      }
    },
    [enabled],
  );
}
