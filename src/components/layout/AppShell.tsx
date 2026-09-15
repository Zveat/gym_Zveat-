'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/primitives';
import { useStore } from '@/store/useStore';
import { BottomNav } from './BottomNav';
import { SignInScreen } from './SignInScreen';
import { RestTimerOverlay } from '@/components/workout/RestTimerOverlay';
import { PRCelebrationOverlay } from '@/components/workout/PRCelebration';

/**
 * Loads the local database once, then gets out of the way.
 *
 * The bottom nav is hidden on the live workout screens: mid-set, the only
 * things on screen should be the exercise and the set.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const status = useStore((s) => s.status);
  const cloud = useStore((s) => s.cloud);
  const init = useStore((s) => s.init);
  const pathname = usePathname();

  useEffect(() => {
    void init();
  }, [init]);

  const immersive = pathname.startsWith('/workout');

  if (cloud.status === 'signed_out') return <SignInScreen />;
  if (status === 'loading') return <BootSkeleton />;

  return (
    <>
      {children}
      {!immersive ? <BottomNav /> : null}
      <RestTimerOverlay />
      <PRCelebrationOverlay />
    </>
  );
}

function BootSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-lg px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 24px)' }}
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-8 w-48" />
      <Skeleton className="mt-6 h-52 w-full rounded-[var(--radius-card)]" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="mt-4 h-28 w-full rounded-[var(--radius-card)]" />
      <span className="sr-only">Загрузка</span>
    </div>
  );
}
