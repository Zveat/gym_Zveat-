'use client';

import { useEffect } from 'react';
import { formatWeight } from '@/engine/format';
import { useHaptics } from '@/hooks/useHaptics';
import { useStore } from '@/store/useStore';

/**
 * A new personal record is the one moment worth an animation. It shows for a
 * couple of seconds over whatever is on screen and never blocks the next set.
 */
export function PRCelebrationOverlay() {
  const celebration = useStore((s) => s.celebration);
  const dismiss = useStore((s) => s.dismissCelebration);
  const haptics = useHaptics();

  useEffect(() => {
    if (!celebration) return;
    haptics('success');
    const id = setTimeout(dismiss, 2600);
    return () => clearTimeout(id);
  }, [celebration, dismiss, haptics]);

  if (!celebration) return null;
  const { pr, exerciseName } = celebration;

  return (
    <button
      type="button"
      onClick={dismiss}
      aria-label="Закрыть"
      className="fixed inset-x-0 z-[70] flex justify-center px-4"
      style={{ top: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="anim-pop w-full max-w-sm rounded-[20px] border border-accent/50 bg-[#141a06] px-4 py-3.5 text-left shadow-[0_18px_50px_-12px_rgba(182,255,59,0.35)]">
        <div className="flex items-center gap-3">
          <span className="anim-ring flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-xl">
            🔥
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.16em] text-accent uppercase">
              New PR · {pr.label}
            </p>
            <p className="tnum mt-0.5 text-[19px] leading-none font-semibold">
              {formatWeight(pr.weight)} kg × {pr.reps}
            </p>
            <p className="mt-1 truncate text-[12px] text-dim">
              {exerciseName}
              {pr.previous !== null ? ` · было ${formatWeight(pr.previous)}` : ''}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
