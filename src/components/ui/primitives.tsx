'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/** Small, composable pieces the screens are assembled from. */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Button ────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink active:bg-[#a5ee2a] font-semibold',
  secondary: 'bg-surface3 text-ink active:bg-[#32323a]',
  ghost: 'bg-transparent text-dim active:bg-surface2',
  danger: 'bg-transparent text-pain border border-pain/40 active:bg-pain/10',
  outline: 'bg-transparent text-ink border border-line-strong active:bg-surface2',
};

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] rounded-xl',
  md: 'h-12 px-4 text-[15px] rounded-2xl',
  lg: 'h-14 px-5 text-base rounded-2xl',
  xl: 'h-16 px-6 text-lg rounded-[22px] font-semibold tracking-wide',
};

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  full,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 transition-[background-color,transform,opacity] duration-150 active:scale-[0.985] disabled:opacity-35 disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  full,
  className,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={cx(
        'inline-flex items-center justify-center gap-2 transition-transform duration-150 active:scale-[0.985]',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────── */

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cx('rounded-[var(--radius-card)] border border-line bg-surface', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('eyebrow', className)}>{children}</p>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1">
      <Eyebrow>{children}</Eyebrow>
      {action}
    </div>
  );
}

/* ── Stats ─────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'progress' | 'warn' | 'pain';
  className?: string;
}) {
  const toneClass = {
    default: 'text-ink',
    accent: 'text-accent',
    progress: 'text-progress',
    warn: 'text-warn',
    pain: 'text-pain',
  }[tone];

  return (
    <div className={cx('min-w-0', className)}>
      <Eyebrow>{label}</Eyebrow>
      <p className={cx('tnum mt-1 text-[26px] leading-none font-semibold tracking-tight', toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-[13px] font-medium text-dim">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 truncate text-[12px] text-dim">{hint}</p> : null}
    </div>
  );
}

/* ── Progress ──────────────────────────────────────────────────────── */

export function ProgressBar({
  value,
  tone = 'accent',
  className,
}: {
  value: number;
  tone?: 'accent' | 'progress' | 'dim';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bg = { accent: 'bg-accent', progress: 'bg-progress', dim: 'bg-dim' }[tone];
  return (
    <div
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface3', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-300', bg)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Chips & badges ────────────────────────────────────────────────── */

export function Chip({
  children,
  selected,
  onClick,
  tone,
  className,
  disabled,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  tone?: string;
  className?: string;
  disabled?: boolean;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      style={selected && tone ? { borderColor: tone, color: tone } : undefined}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors',
        selected
          ? 'border-accent text-accent bg-accent/10'
          : 'border-line-strong text-dim bg-transparent',
        onClick && 'active:bg-surface3',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      style={color ? { color, borderColor: `${color}55` } : undefined}
      className={cx(
        'inline-flex items-center gap-1 rounded-md border border-line-strong px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Segmented control ─────────────────────────────────────────────── */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cx('flex gap-1 rounded-2xl bg-surface2 p-1', className)}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'min-h-10 flex-1 rounded-xl px-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              active ? 'bg-surface3 text-ink' : 'text-dim active:bg-surface3/60',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Rows ──────────────────────────────────────────────────────────── */

export function Row({
  label,
  value,
  onClick,
  href,
  icon,
  tone,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  const body = (
    <>
      {icon ? <span className="shrink-0 text-dim">{icon}</span> : null}
      <span className={cx('min-w-0 flex-1 truncate', tone === 'danger' && 'text-pain')}>
        {label}
      </span>
      {value !== undefined ? (
        <span className="tnum shrink-0 text-[14px] text-dim">{value}</span>
      ) : null}
      {href || onClick ? <Chevron /> : null}
    </>
  );

  const shell =
    'flex min-h-[54px] w-full items-center gap-3 px-4 text-left text-[15px] transition-colors active:bg-surface2';

  if (href) {
    return (
      <Link href={href} className={cx(shell, className)}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(shell, className)}>
        {body}
      </button>
    );
  }
  return <div className={cx(shell, className)}>{body}</div>;
}

export function RowGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? <div className="text-3xl opacity-60">{icon}</div> : null}
      <p className="text-[15px] font-semibold tracking-wide uppercase">{title}</p>
      {description ? (
        <p className="max-w-[28ch] text-[13px] leading-relaxed text-dim">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} />;
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warn' | 'pain' | 'accent';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const color = {
    info: 'var(--status-info)',
    warn: 'var(--status-warning)',
    pain: 'var(--status-pain)',
    accent: 'var(--color-accent)',
  }[tone];

  return (
    <div
      className={cx('rounded-[var(--radius-tile)] border p-3.5', className)}
      style={{ borderColor: `${color}40`, background: `${color}12` }}
    >
      {title ? (
        <p className="text-[13px] font-semibold" style={{ color }}>
          {title}
        </p>
      ) : null}
      {children ? <div className="mt-1 text-[13px] leading-relaxed text-ink/80">{children}</div> : null}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}

/* ── Icons (inline, so there is no icon dependency to load) ────────── */

export function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={cx('shrink-0 text-faint', className)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="m6 3.5 5 4.5-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="m13 5-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m3.5 9.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.5h11M7 5.5V4h4v1.5M5 5.5 5.6 15h6.8L13 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DragIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5h10M3 8h10M3 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
