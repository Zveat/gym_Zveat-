import type { Difficulty, MuscleGroup, SetType, WorkoutMode } from '@/domain/types';

/** Rounds to the nearest achievable plate/pin step. */
export function roundToStep(value: number, step = 0.5): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** `50` -> "50", `52.5` -> "52.5" — never "52.50". */
export function formatWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '—';
  const rounded = Math.round(kg * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '');
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) return `${Math.round(kg).toLocaleString('en-US')}`;
  return String(Math.round(kg));
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "12" or "12-15" — what the user reads on the set card. */
export function formatRepRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null && min !== max) return `${min}-${max}`;
  return String(max ?? min);
}

export function formatSetLine(weight: number | null, reps: number | null): string {
  return `${formatWeight(weight)} × ${reps ?? '—'}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Parses `YYYY-MM-DD` as a *local* date (never UTC — off-by-one dates are a bug). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatDateShort(date: string): string {
  const d = parseDate(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatDateLong(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Today" / "Yesterday" / "3 days ago" / "SEP 14". */
export function formatRelativeDate(date: string, today: Date = new Date()): string {
  const target = parseDate(date);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  return formatDateShort(date);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'GOOD NIGHT';
  if (h < 12) return 'GOOD MORNING';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  forearms: 'Forearms',
  other: 'Other',
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'Working set',
  warmup: 'Warm-up',
  top_set: 'Top set',
  drop_set: 'Drop set',
  failure: 'To failure',
  burnout: 'Burnout',
};

export const DIFFICULTY_META: Record<Difficulty, { label: string; emoji: string; rpe: number; rir: number }> = {
  easy: { label: 'EASY', emoji: '😊', rpe: 6, rir: 4 },
  good: { label: 'GOOD', emoji: '🙂', rpe: 8, rir: 2 },
  hard: { label: 'HARD', emoji: '😤', rpe: 9, rir: 1 },
  failure: { label: 'FAILURE', emoji: '🔥', rpe: 10, rir: 0 },
};

export const MODE_LABEL: Record<WorkoutMode, string> = {
  normal: 'NORMAL',
  light: 'LIGHT',
  heavy: 'HEAVY',
  recovery: 'RECOVERY',
};

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
