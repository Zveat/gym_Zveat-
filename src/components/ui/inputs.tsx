'use client';

import type { ComponentProps, ReactNode } from 'react';
import { cx } from './primitives';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      {label ? <span className="eyebrow mb-1.5 block">{label}</span> : null}
      {children}
      {hint ? <span className="mt-1.5 block text-[12px] text-dim">{hint}</span> : null}
    </label>
  );
}

/**
 * Size is a variant rather than an override: Tailwind resolves conflicting
 * utilities (`py-3` vs `py-2`) by stylesheet order, not by the order they
 * appear in `className`, so "pass a smaller padding class" silently does
 * nothing. Variants change the base instead.
 */
const INPUT_SHELL =
  'w-full rounded-[var(--radius-tile)] border border-line bg-surface2 text-ink placeholder:text-faint outline-none transition-colors focus:border-line-strong';

const INPUT_DENSITY = {
  default: 'min-h-12 px-3.5 py-3',
  /** Dense forms: the program editor's set table, inline numbers. */
  compact: 'min-h-10 px-2.5 py-1.5 text-[14px]',
  /** No chrome at all — an editable heading. */
  bare: 'border-0 bg-transparent px-0 py-1',
} as const;

/** `default` for forms, `compact` for dense tables, `bare` for editable headings. */
export type InputDensity = keyof typeof INPUT_DENSITY;

export function TextInput({
  className,
  density = 'default',
  ...rest
}: ComponentProps<'input'> & { density?: InputDensity }) {
  return <input className={cx(INPUT_SHELL, INPUT_DENSITY[density], className)} {...rest} />;
}

export function TextArea({
  className,
  density = 'default',
  ...rest
}: ComponentProps<'textarea'> & { density?: InputDensity }) {
  return (
    <textarea
      className={cx(
        INPUT_SHELL,
        INPUT_DENSITY[density],
        'min-h-24 resize-y leading-relaxed',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  density = 'default',
  ...rest
}: ComponentProps<'select'> & { density?: InputDensity }) {
  return (
    <select
      className={cx(INPUT_SHELL, INPUT_DENSITY[density], 'appearance-none pr-9', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * The stepper the workout screen is built around: a very large value with two
 * thumb-sized controls. Holding a control repeats, because changing 50 kg to
 * 70 kg should not take eight taps.
 */
export function BigStepper({
  label,
  value,
  unit,
  step,
  min = 0,
  max,
  onChange,
  onEdit,
  tone = 'ink',
}: {
  label: string;
  value: number;
  unit?: string;
  step: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  /** Tapping the number opens a keyboard for an exact value. */
  onEdit?: () => void;
  tone?: 'ink' | 'accent';
}) {
  const clamp = (next: number) => {
    const rounded = Math.round(next * 100) / 100;
    if (rounded < min) return min;
    if (max !== undefined && rounded > max) return max;
    return rounded;
  };

  return (
    <div>
      <p className="eyebrow text-center">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <StepButton label={`Минус ${step}`} onPress={() => onChange(clamp(value - step))}>
          −
        </StepButton>

        <button
          type="button"
          onClick={onEdit}
          disabled={!onEdit}
          className="min-w-0 flex-1 text-center disabled:cursor-default"
        >
          <span
            className={cx(
              'tnum block text-[56px] leading-none font-semibold tracking-[-0.04em]',
              tone === 'accent' ? 'text-accent' : 'text-ink',
            )}
          >
            {Number.isInteger(value) ? value : value.toFixed(1)}
          </span>
          {unit ? (
            <span className="mt-1 block text-[12px] font-semibold tracking-[0.12em] text-dim uppercase">
              {unit}
            </span>
          ) : null}
        </button>

        <StepButton label={`Плюс ${step}`} onPress={() => onChange(clamp(value + step))}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onPress,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface3 text-2xl font-medium text-ink transition-transform active:scale-95 active:bg-[#32323a]"
    >
      {children}
    </button>
  );
}

/** 1–5 rating used by the pre-workout check-in. */
export function ScalePicker({
  label,
  value,
  onChange,
  max = 5,
  hint,
}: {
  label: string;
  value?: number;
  onChange: (value: number) => void;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[14px]">{label}</p>
        {hint ? <p className="text-[11px] text-dim">{hint}</p> : null}
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cx(
              'tnum h-11 flex-1 rounded-xl border text-[15px] font-medium transition-colors',
              value === n
                ? 'border-accent bg-accent/12 text-accent'
                : 'border-line bg-surface2 text-dim active:bg-surface3',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[54px] w-full items-center gap-3 px-4 text-left active:bg-surface2"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-dim">{description}</span> : null}
      </span>
      <span
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface3',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
