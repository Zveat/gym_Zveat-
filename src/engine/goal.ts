import type { DateString, WorkoutCountGoal, WorkoutSession } from '@/domain/types';
import { parseDate } from './format';

/**
 * ЦЕЛЬ «СТОЛЬКО ТРЕНИРОВОК ЗА СТОЛЬКО ДНЕЙ».
 *
 * ПОЧЕМУ СЧИТАЕТСЯ, А НЕ ХРАНИТСЯ. В прошлом приложении у этой цели были
 * кнопки «плюс» и «минус», то есть счётчик надо было двигать руками — и он
 * неизбежно расходился с тем, что человек на самом деле сделал. Здесь
 * тренировки уже лежат в истории, поэтому цель считается из них: её нельзя
 * «забыть отметить», и она не может врать. То же правило, что у рекордов.
 *
 * ЗАЧЕМ ТОГДА `baseline`. Челлендж начался до приложения: часть тренировок
 * прошла и в истории её нет. Это единственное число, которое человек вводит
 * руками, и оно относится к периоду ДО `countFrom` — так, что импорт истории
 * потом не удвоит зачёт (импортированные тренировки старше `countFrom`
 * считаются частью `baseline`, а не добавкой к нему).
 */

export interface GoalStatus {
  /** Сколько зачтено всего: вручную до приложения плюс реальная история. */
  done: number;
  target: number;
  remaining: number;
  /** Доля выполнения, 0…1 — для полосы прогресса. */
  ratio: number;
  /** Какой сегодня день челленджа, 1-based. Может быть больше срока. */
  dayNumber: number;
  totalDays: number;
  daysLeft: number;
  /** Срок вышел. */
  expired: boolean;
  /** Цель достигнута — важнее, чем «срок вышел». */
  achieved: boolean;
  /**
   * Сколько должно быть сделано к этому дню при ровном темпе. Не «норма», а
   * линия, относительно которой человек понимает, отстаёт он или нет.
   */
  onPace: number;
  /** Насколько впереди (плюс) или позади (минус) ровного темпа. */
  ahead: number;
  /** Нужно тренировок в неделю, чтобы успеть. `null` — успевать уже нечего. */
  perWeekNeeded: number | null;
  /** Текущий темп, тренировок в неделю. `null` — прошло слишком мало дней. */
  perWeekActual: number | null;
}

/** Меньше — и «темп в неделю» считался бы по одному дню и прыгал бы втрое. */
export const MIN_PACE_DAYS = 4;

function isoToday(now: Date): DateString {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Календарных дней между датами. Считаем по полуночи, а не по часам. */
export function daysBetween(from: DateString, to: DateString): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function goalEndDate(goal: WorkoutCountGoal): DateString {
  const start = parseDate(goal.startDate);
  // День 1 — сам день старта, поэтому последний день это +(days − 1).
  start.setDate(start.getDate() + goal.days - 1);
  return isoToday(start);
}

/**
 * Тренировки, которые идут в зачёт: завершённые, в пределах срока и не раньше
 * даты, с которой цель считает историю.
 */
export function goalCountedSessions(
  goal: WorkoutCountGoal,
  sessions: WorkoutSession[],
): WorkoutSession[] {
  const from = goal.countFrom;
  const to = goalEndDate(goal);
  return sessions.filter(
    (s) => s.status === 'completed' && s.date >= from && s.date <= to,
  );
}

export function goalStatus(
  goal: WorkoutCountGoal,
  sessions: WorkoutSession[],
  now: Date = new Date(),
): GoalStatus {
  const today = isoToday(now);
  const counted = goalCountedSessions(goal, sessions).length;
  const done = goal.baseline + counted;

  const totalDays = Math.max(1, goal.days);
  // Ограничиваем сроком: на 160-й день из 150 «день 160» ничего не объясняет,
  // а вот «срок вышел» — объясняет.
  const elapsed = daysBetween(goal.startDate, today) + 1;
  const dayNumber = Math.max(1, elapsed);
  const daysLeft = Math.max(0, totalDays - dayNumber + 1);
  const expired = dayNumber > totalDays;

  const remaining = Math.max(0, goal.target - done);
  const achieved = done >= goal.target;

  const onPace = Math.round((goal.target * Math.min(dayNumber, totalDays)) / totalDays);

  // Темп считаем от прошедших дней в пределах срока — иначе после срока он
  // медленно уползал бы вниз без единой тренировки.
  const paceDays = Math.min(dayNumber, totalDays);

  return {
    done,
    target: goal.target,
    remaining,
    ratio: goal.target > 0 ? Math.min(1, done / goal.target) : 0,
    dayNumber,
    totalDays,
    daysLeft,
    expired,
    achieved,
    onPace,
    ahead: done - onPace,
    perWeekNeeded: achieved || daysLeft === 0 ? null : (remaining / daysLeft) * 7,
    perWeekActual: paceDays >= MIN_PACE_DAYS ? (done / paceDays) * 7 : null,
  };
}

export type GoalVerdict = 'achieved' | 'ahead' | 'on_track' | 'behind' | 'missed';

/**
 * Порог — две тренировки, а не одна.
 *
 * `onPace` округлён до целого, поэтому расхождение в одну тренировку целиком
 * укладывается в это округление: на 76-м дне из 150 ровный темп даёт то 50, то
 * 51. Ставить тревогу на такой разнице — значит объявлять отставание из-за
 * арифметики.
 */
export const GOAL_PACE_TOLERANCE = 2;

export function goalVerdict(status: GoalStatus): GoalVerdict {
  if (status.achieved) return 'achieved';
  if (status.expired) return 'missed';
  if (status.ahead >= GOAL_PACE_TOLERANCE) return 'ahead';
  if (status.ahead <= -GOAL_PACE_TOLERANCE) return 'behind';
  return 'on_track';
}

export const GOAL_VERDICT_LABEL: Record<GoalVerdict, string> = {
  achieved: 'Цель выполнена',
  ahead: 'Идёте с опережением',
  on_track: 'Идёте по графику',
  behind: 'Отстаёте от графика',
  missed: 'Срок вышел',
};
