'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui/primitives';

const ITEMS = [
  { href: '/', label: 'Home', title: 'Главная', match: (p: string) => p === '/' },
  { href: '/programs', label: 'Programs', title: 'Программы', match: (p: string) => p.startsWith('/programs') },
  { href: '/progress', label: 'Progress', title: 'Прогресс', match: (p: string) => p.startsWith('/progress') || p.startsWith('/records') },
  { href: '/history', label: 'History', title: 'История', match: (p: string) => p.startsWith('/history') },
  { href: '/more', label: 'More', title: 'Ещё', match: (p: string) => p.startsWith('/more') },
];

function Glyph({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? 'var(--color-accent)' : 'currentColor';
  const common = { stroke, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {name === 'Home' && <path d="M3.5 9.8 11 4l7.5 5.8V18a.9.9 0 0 1-.9.9h-4.2v-5.3H8.6V19H4.4a.9.9 0 0 1-.9-.9z" {...common} />}
      {name === 'Programs' && (
        <>
          <rect x="3.6" y="4.2" width="14.8" height="13.6" rx="2.4" {...common} />
          <path d="M7.2 8.6h7.6M7.2 11.6h7.6M7.2 14.6h4.4" {...common} />
        </>
      )}
      {name === 'Progress' && <path d="M3.6 15.4l4.2-4.6 3.2 2.6 5.4-6.2M13.8 7.2h4v4" {...common} />}
      {name === 'History' && (
        <>
          <circle cx="11" cy="11" r="7.2" {...common} />
          <path d="M11 6.8V11l3 1.9" {...common} />
        </>
      )}
      {name === 'More' && <path d="M4.4 6.6h13.2M4.4 11h13.2M4.4 15.4h13.2" {...common} />}
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 backdrop-blur-xl"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-[64px] flex-col items-center justify-center gap-1 transition-colors',
                  active ? 'text-accent' : 'text-faint active:text-dim',
                )}
              >
                <Glyph name={item.label} active={active} />
                <span className="text-[10px] font-medium tracking-[0.06em] uppercase">
                  {item.title}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
