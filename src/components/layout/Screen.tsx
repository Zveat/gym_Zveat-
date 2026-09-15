'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { BackIcon, cx } from '@/components/ui/primitives';

/**
 * Standard screen frame: safe-area aware, one column, room for the bottom nav.
 * Everything is centred in a phone-width column so the app still looks
 * deliberate on a desktop browser.
 */
export function Screen({
  children,
  className,
  /** Screens with their own fixed footer (e.g. a live workout) opt out. */
  padBottom = true,
}: {
  children?: ReactNode;
  className?: string;
  padBottom?: boolean;
}) {
  return (
    <main
      className={cx('mx-auto w-full max-w-lg px-4', className)}
      style={{
        paddingTop: 'calc(var(--safe-top) + 12px)',
        paddingBottom: padBottom
          ? 'calc(var(--nav-height) + var(--nav-safe-bottom) + 24px)'
          : 'calc(var(--safe-bottom) + 12px)',
      }}
    >
      {children}
    </main>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  back,
  right,
  large,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** `true` goes back in history, a string navigates to that route. */
  back?: boolean | string;
  right?: ReactNode;
  large?: boolean;
}) {
  const router = useRouter();

  return (
    <header className="mb-5 flex items-start gap-3">
      {back ? (
        typeof back === 'string' ? (
          <Link
            href={back}
            aria-label="Назад"
            className="touch -ml-2 flex items-center justify-center rounded-full text-dim active:bg-surface2"
          >
            <BackIcon />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="touch -ml-2 flex items-center justify-center rounded-full text-dim active:bg-surface2"
          >
            <BackIcon />
          </button>
        )
      ) : null}

      <div className="min-w-0 flex-1 pt-0.5">
        <h1
          className={cx(
            'leading-tight font-semibold tracking-tight',
            large ? 'text-[30px]' : 'text-[21px]',
          )}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-dim">{subtitle}</p> : null}
      </div>

      {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}
    </header>
  );
}
