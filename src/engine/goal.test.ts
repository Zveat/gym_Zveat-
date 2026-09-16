import { describe, expect, it } from 'vitest';
import type { WorkoutCountGoal, WorkoutSession } from '@/domain/types';
import {
  daysBetween,
  goalCountedSessions,
  goalEndDate,
  goalStatus,
  goalVerdict,
} from './goal';

/** Цель владельца: 100 тренировок за 150 дней, 25 уже было до приложения. */
const goal: WorkoutCountGoal = {
  target: 100,
  days: 150,
  startDate: '2026-06-01',
  baseline: 25,
  countFrom: '2026-09-01',
};

let seq = 0;
const session = (date: string, status: 'completed' | 'active' = 'completed'): WorkoutSession =>
  ({
    id: `s${seq++}`,
    programId: 'p',
    programName: 'СПЛИТ',
    workoutDayId: 'd',
    workoutDayName: 'DAY 1',
    workoutDayTitle: 'ГРУДЬ',
    date,
    startedAt: `${date}T18:00:00.000Z`,
    completedAt: status === 'completed' ? `${date}T19:00:00.000Z` : null,
    durationSeconds: 3600,
    mode: 'normal',
    modeSnapshot: { weightMultiplier: 1, setsDelta: 0, repsDelta: 0 },
    status,
    exercises: [],
  }) as unknown as WorkoutSession;

const at = (date: string) => new Date(`${date}T12:00:00`);

describe('daysBetween', () => {
  it('считает календарные дни', () => {
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0);
    expect(daysBetween('2026-06-01', '2026-06-02')).toBe(1);
    expect(daysBetween('2026-06-01', '2026-10-29')).toBe(150);
  });

  it('не сбивается на переходе зимнего времени', () => {
    // Полночь местная, а не UTC: иначе вышло бы 30.
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });
});

describe('goalEndDate', () => {
  it('день 1 — сам старт, поэтому последний день это старт + 149', () => {
    expect(goalEndDate(goal)).toBe('2026-10-28');
    expect(daysBetween(goal.startDate, goalEndDate(goal))).toBe(149);
  });
});

describe('goalCountedSessions', () => {
  it('берёт только завершённые', () => {
    const list = [session('2026-09-10'), session('2026-09-11', 'active')];
    expect(goalCountedSessions(goal, list)).toHaveLength(1);
  });

  it('не считает то, что раньше countFrom — иначе импорт удвоил бы зачёт', () => {
    const list = [session('2026-08-31'), session('2026-09-01')];
    expect(goalCountedSessions(goal, list).map((s) => s.date)).toEqual(['2026-09-01']);
  });

  it('не считает то, что позже срока', () => {
    const list = [session('2026-10-28'), session('2026-10-29')];
    expect(goalCountedSessions(goal, list).map((s) => s.date)).toEqual(['2026-10-28']);
  });
});

describe('goalStatus', () => {
  it('на старте цели считает только baseline', () => {
    const s = goalStatus(goal, [], at('2026-06-01'));
    expect(s.done).toBe(25);
    expect(s.dayNumber).toBe(1);
    expect(s.daysLeft).toBe(150);
    expect(s.remaining).toBe(75);
    expect(s.expired).toBe(false);
  });

  it('добавляет к baseline тренировки из истории', () => {
    const list = [session('2026-09-02'), session('2026-09-04'), session('2026-09-06')];
    expect(goalStatus(goal, list, at('2026-09-16')).done).toBe(28);
  });

  it('ровный темп: к половине срока ждём половину цели', () => {
    const s = goalStatus(goal, [], at('2026-08-15'));
    expect(s.dayNumber).toBe(76);
    expect(s.onPace).toBe(51);
    expect(s.ahead).toBe(25 - 51);
  });

  it('считает, сколько нужно в неделю, чтобы успеть', () => {
    // 75 осталось на 150 дней = 3.5 в неделю.
    const s = goalStatus(goal, [], at('2026-06-01'));
    expect(s.perWeekNeeded).toBeCloseTo(3.5, 5);
  });

  it('не требует ничего, когда цель достигнута', () => {
    const done = { ...goal, baseline: 100 };
    expect(goalStatus(done, [], at('2026-07-01')).perWeekNeeded).toBeNull();
    expect(goalStatus(done, [], at('2026-07-01')).achieved).toBe(true);
  });

  it('молчит о темпе, пока прошло слишком мало дней', () => {
    expect(goalStatus(goal, [], at('2026-06-01')).perWeekActual).toBeNull();
    expect(goalStatus(goal, [], at('2026-06-10')).perWeekActual).not.toBeNull();
  });

  it('после срока не уползает: темп считается по сроку, а не по сегодня', () => {
    const late = goalStatus(goal, [], at('2027-01-01'));
    expect(late.expired).toBe(true);
    expect(late.daysLeft).toBe(0);
    expect(late.perWeekActual).toBeCloseTo((25 / 150) * 7, 5);
    expect(late.onPace).toBe(100);
  });

  it('доля выполнения не выходит за единицу', () => {
    expect(goalStatus({ ...goal, baseline: 120 }, [], at('2026-07-01')).ratio).toBe(1);
  });
});

describe('goalVerdict', () => {
  const on = (baseline: number, date: string) =>
    goalVerdict(goalStatus({ ...goal, baseline }, [], at(date)));

  it('выполнена важнее, чем «срок вышел»', () => {
    expect(on(100, '2027-01-01')).toBe('achieved');
  });

  it('различает опережение, график и отставание', () => {
    // День 76 из 150 → ровный темп 51.
    expect(on(60, '2026-08-15')).toBe('ahead');
    expect(on(51, '2026-08-15')).toBe('on_track');
    expect(on(40, '2026-08-15')).toBe('behind');
  });

  it('одна тренировка разницы — это округление ровного темпа, а не тревога', () => {
    expect(on(50, '2026-08-15')).toBe('on_track');
    expect(on(52, '2026-08-15')).toBe('on_track');
  });

  it('срок вышел без выполнения', () => {
    expect(on(80, '2027-01-01')).toBe('missed');
  });
});
