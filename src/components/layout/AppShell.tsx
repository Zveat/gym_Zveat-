'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Notice, Skeleton } from '@/components/ui/primitives';
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
      <SyncErrorBanner />
      {children}
      {!immersive ? <BottomNav /> : null}
      <RestTimerOverlay />
      <PRCelebrationOverlay />
    </>
  );
}

/**
 * A write that did not land has to say so, on every screen.
 *
 * Saving is fire-and-forget so that logging a set is instant, which means a
 * refused write has nobody to return an error to. Without this the app just
 * quietly forgot what it had already drawn on screen — body-weight entries
 * were typed three times before the failure became apparent at all.
 */
function SyncErrorBanner() {
  const syncError = useStore((s) => s.syncError);
  const dismiss = useStore((s) => s.dismissSyncError);

  if (!syncError) return null;

  return (
    <div
      className="mx-auto w-full max-w-lg px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
    >
      <Notice
        tone="pain"
        title="Не сохранилось"
        action={
          <Button size="sm" variant="outline" onClick={dismiss}>
            ПОНЯТНО
          </Button>
        }
      >
        {syncError}
      </Notice>
    </div>
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
      <BootProgress />
    </div>
  );
}

/**
 * A boot that takes a while must say so. Shimmering placeholders with no text
 * read as a frozen app, and the one thing the user cannot tell from them is
 * whether waiting will help. Silent for the first seconds so a normal launch
 * stays clean.
 */
function BootProgress() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (elapsed < 3) return null;

  return (
    <p className="mt-6 text-center text-[13px] leading-relaxed text-dim">
      {elapsed < 9
        ? 'Соединяемся с аккаунтом…'
        : 'Сеть отвечает медленно. Приложение откроется, как только ответит — данные уже сохранены и не потеряются.'}
    </p>
  );
}
