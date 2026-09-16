import type { BodyPart, Difficulty, MuscleGroup, SetType, WorkoutMode } from '@/domain/types';

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
  if (h > 0) return `${h} ч ${String(m).padStart(2, '0')} мин`;
  if (m > 0) return `${m} мин`;
  return `${s} с`;
}

/**
 * «10 мин · подъём 0» — одна строка для разминки и заминки.
 *
 * Подъём печатается и когда он ноль: на дорожке ноль — это осознанная
 * настройка, которую надо выставить, а не отсутствие данных. Отсутствие — это
 * `null`, и тогда про подъём не пишем вовсе.
 */
export function formatCardio(block: { minutes: number; incline: number | null }): string {
  const minutes = `${block.minutes} мин`;
  return block.incline === null ? minutes : `${minutes} · подъём ${block.incline}`;
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

const MONTHS = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const WEEKDAYS = [
  'ВОСКРЕСЕНЬЕ',
  'ПОНЕДЕЛЬНИК',
  'ВТОРНИК',
  'СРЕДА',
  'ЧЕТВЕРГ',
  'ПЯТНИЦА',
  'СУББОТА',
];

/**
 * Что человек реально сделал в подходах: «70 кг · 12 · 12 · 12» когда вес
 * один, и «70×12 · 70×12 · 70×12 · 90×12» когда он менялся.
 *
 * ЗАЧЕМ РАЗВИЛКА. Экран итогов печатал вес из ПЛАНА и дальше только
 * повторения. Владелец сделал четвёртый подход жима ногами на 90 кг при плане
 * 70 — и прочитал «70 кг · 12 · 12 · 12 · 12», то есть строка утверждала, что
 * все четыре подхода были по 70. Подход был записан, но на экране его не
 * существовало. Одинаковый вес выносим вперёд, потому что это обычный случай
 * и так короче; разный — печатаем у каждого подхода.
 */
export function formatPerformedSets(
  performed: { weight: number; reps: number }[],
  plannedWeight: number | null = null,
): string {
  if (!performed.length) return '—';

  const weights = [...new Set(performed.map((p) => p.weight))];
  if (weights.length === 1) {
    const weight = weights[0] ?? plannedWeight;
    const head = weight === null ? '' : `${formatWeight(weight)} кг · `;
    return head + performed.map((p) => p.reps).join(' · ');
  }

  return performed.map((p) => `${formatWeight(p.weight)}×${p.reps}`).join(' · ');
}

/** Parses `YYYY-MM-DD` as a *local* date (never UTC — off-by-one dates are a bug). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatDateShort(date: string): string {
  const d = parseDate(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatDateLong(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Today" / "Yesterday" / "3 days ago" / "SEP 14". */
export function formatRelativeDate(date: string, today: Date = new Date()): string {
  const target = parseDate(date);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days === -1) return 'Завтра';
  if (days > 1 && days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  return formatDateShort(date);
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'ДОБРОЙ НОЧИ';
  if (h < 12) return 'ДОБРОЕ УТРО';
  if (h < 18) return 'ДОБРЫЙ ДЕНЬ';
  return 'ДОБРЫЙ ВЕЧЕР';
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  legs: 'Ноги',
  glutes: 'Ягодицы',
  calves: 'Голени',
  core: 'Корпус',
  forearms: 'Предплечья',
  other: 'Другое',
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'Рабочий',
  warmup: 'Разминочный',
  top_set: 'Максимальный',
  drop_set: 'Со сбросом веса',
  failure: 'До отказа',
  burnout: 'Добивочный',
};

export const DIFFICULTY_META: Record<Difficulty, { label: string; emoji: string; rpe: number; rir: number }> = {
  easy: { label: 'ЛЕГКО', emoji: '😊', rpe: 6, rir: 4 },
  good: { label: 'НОРМА', emoji: '🙂', rpe: 8, rir: 2 },
  hard: { label: 'ТЯЖЕЛО', emoji: '😤', rpe: 9, rir: 1 },
  failure: { label: 'ОТКАЗ', emoji: '🔥', rpe: 10, rir: 0 },
};

/**
 * Зоны дискомфорта. Один список на приложение: отметка ставится и из
 * тренировки, и с отдельного экрана, а две копии разъехались бы по составу и
 * по названиям.
 */
export const BODY_PART_LABEL: Record<BodyPart, string> = {
  shoulder: 'Плечо',
  elbow: 'Локоть',
  knee: 'Колено',
  back: 'Спина',
  wrist: 'Кисть',
  hip: 'Бедро',
  neck: 'Шея',
  other: 'Другое',
};

/** Порядок показа: сверху то, что в зале болит чаще. */
export const BODY_PART_ORDER: BodyPart[] = [
  'knee',
  'shoulder',
  'back',
  'elbow',
  'wrist',
  'hip',
  'neck',
  'other',
];

export const MODE_LABEL: Record<WorkoutMode, string> = {
  normal: 'ОБЫЧНАЯ',
  light: 'ЛЕГКАЯ',
  heavy: 'ТЯЖЕЛАЯ',
  recovery: 'ВОССТАНОВЛЕНИЕ',
};

/**
 * Russian needs three forms, chosen by the last digits: 1 подход, 2 подхода,
 * 5 подходов — and 11 подходов, not 11 подход.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = abs % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}

/** Word forms used in more than one screen. */
export const WORDS = {
  set: ['подход', 'подхода', 'подходов'] as const,
  workingSet: ['рабочий подход', 'рабочих подхода', 'рабочих подходов'] as const,
  exercise: ['упражнение', 'упражнения', 'упражнений'] as const,
  day: ['день', 'дня', 'дней'] as const,
  workout: ['тренировка', 'тренировки', 'тренировок'] as const,
  rep: ['повторение', 'повторения', 'повторений'] as const,
  record: ['рекорд', 'рекорда', 'рекордов'] as const,
  document: ['документ', 'документа', 'документов'] as const,
  request: ['обращение', 'обращения', 'обращений'] as const,
};

/** `pluralize(4, ...WORDS.set)` reads badly at call sites; this does not. */
export function count(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${plural(n, forms[0], forms[1], forms[2])}`;
}
