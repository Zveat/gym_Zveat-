'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, ReactNode } from 'react';
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
  /** Остальное уходит на `<main>`: экрану тренировки нужны обработчики касаний. */
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  padBottom?: boolean;
} & Omit<ComponentProps<'main'>, 'className' | 'children' | 'style'>) {
  return (
    <main
      {...rest}
      className={cx('mx-auto w-full max-w-lg px-4', className)}
      style={{
        paddingTop: 'calc(var(--safe-top) + 12px)',
        paddingBottom: padBottom
          ? 'calc(var(--nav-height) + var(--nav-safe-bottom) + 24px)'
          : 'calc(var(--safe-bottom) + 12px)',
        /**
         * Every screen is at least a *large* viewport tall, even when its
         * content is shorter.
         *
         * In a Safari tab the bottom toolbar only retracts on a page that can
         * scroll. A short screen — programs, progress, an empty history — had
         * nothing to scroll, so the toolbar stayed out and the tab bar sat
         * ~79pt above the screen edge, while the long screens looked right
         * because scrolling them had already pushed the toolbar away. Same
         * markup, different chrome.
         *
         * `lvh` is the viewport with the toolbar retracted, so this makes the
         * page taller than the viewport is *while the toolbar is out* — which
         * is exactly the scroll needed to retract it. Once it retracts the
         * page is viewport height again and nothing scrolls. Installed to the
         * home screen there is no toolbar and this changes nothing.
         */
        minHeight: '100lvh',
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
