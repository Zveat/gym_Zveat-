import { describe, expect, it } from 'vitest';
import type { Program, WorkoutDay } from '../types';
import {
  backfillCardio,
  COOLDOWN_DEFAULT,
  defaultWarmup,
  initialWorkoutGoal,
  isLegsDay,
  needsWorkoutGoal,
  WARMUP_DEFAULT,
} from './migrations';

const day = (title: string, extra: Partial<WorkoutDay> = {}): WorkoutDay => ({
  id: `day-${title}`,
  name: 'DAY',
  title,
  sortOrder: 0,
  exercises: [],
  ...extra,
});

const program = (days: WorkoutDay[]): Program => ({
  id: 'p1',
  name: 'СПЛИТ',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
  days,
});

describe('isLegsDay', () => {
  it('ловит день ног в любом регистре и в составном названии', () => {
    expect(isLegsDay(day('НОГИ + ПЛЕЧИ'))).toBe(true);
    expect(isLegsDay(day('ПЛЕЧИ + РУКИ + НОГИ'))).toBe(true);
    expect(isLegsDay(day('ноги'))).toBe(true);
  });

  it('не считает ногами верх', () => {
    expect(isLegsDay(day('ГРУДЬ + ТРИЦЕПС'))).toBe(false);
    expect(isLegsDay(day('СПИНА + БИЦЕПС'))).toBe(false);
  });
});

describe('defaultWarmup', () => {
  it('дню ног даёт подъём 8, остальным — 0', () => {
    expect(defaultWarmup(day('НОГИ + ПЛЕЧИ')).incline).toBe(8);
    expect(defaultWarmup(day('ГРУДЬ + ТРИЦЕПС')).incline).toBe(0);
  });

  it('минуты одинаковые: меняется только подъём', () => {
    expect(defaultWarmup(day('НОГИ')).minutes).toBe(10);
    expect(defaultWarmup(day('СПИНА')).minutes).toBe(10);
  });

  it('отдаёт копию, а не саму константу', () => {
    const w = defaultWarmup(day('СПИНА'));
    w.minutes = 99;
    expect(WARMUP_DEFAULT.minutes).toBe(10);
  });
});

describe('backfillCardio', () => {
  it('проставляет разминку и заминку дню без них', () => {
    const next = backfillCardio(program([day('ГРУДЬ + ТРИЦЕПС')]));
    expect(next).not.toBeNull();
    expect(next!.days[0].warmup).toEqual(WARMUP_DEFAULT);
    expect(next!.days[0].cooldown).toEqual(COOLDOWN_DEFAULT);
  });

  it('дню ног ставит подъём 8, заминку — без подъёма', () => {
    const next = backfillCardio(program([day('НОГИ + ПЛЕЧИ')]));
    expect(next!.days[0].warmup!.incline).toBe(8);
    expect(next!.days[0].cooldown!.incline).toBe(0);
  });

  it('не переписывает то, что владелец поправил руками', () => {
    const mine = { minutes: 3, incline: 12 };
    const next = backfillCardio(
      program([day('НОГИ', { warmup: mine })]),
    );
    expect(next!.days[0].warmup).toEqual(mine);
    expect(next!.days[0].cooldown).toEqual(COOLDOWN_DEFAULT);
  });

  it('возвращает null, когда менять нечего — иначе писали бы в базу на каждом запуске', () => {
    const filled = program([
      day('СПИНА', { warmup: { ...WARMUP_DEFAULT }, cooldown: { ...COOLDOWN_DEFAULT } }),
    ]);
    expect(backfillCardio(filled)).toBeNull();
  });

  it('не трогает упражнения дня', () => {
    const base = program([day('СПИНА')]);
    const next = backfillCardio(base)!;
    expect(next.days[0].exercises).toBe(base.days[0].exercises);
  });
});

describe('цель по тренировкам', () => {
  it('переносит цель владельца: 100 за 150 дней', () => {
    const goal = initialWorkoutGoal();
    expect(goal.target).toBe(100);
    expect(goal.days).toBe(150);
  });

  it('считает целиком из истории: ноль зачтённого вручную', () => {
    // Старый счётчик показывал 25, но в выгрузке 24 тренировки. Проверяемая
    // цифра — та, что совпадает с историей, поэтому baseline ноль.
    expect(initialWorkoutGoal().baseline).toBe(0);
  });

  it('отсчёт с первой тренировки в выгрузке, а не с сегодня', () => {
    const goal = initialWorkoutGoal();
    expect(goal.startDate).toBe('2026-08-07');
    expect(goal.countFrom).toBe(goal.startDate);
  });

  it('ставится только когда цели никогда не было', () => {
    expect(needsWorkoutGoal(undefined)).toBe(true);
    // Убранную владельцем цель не возвращаем.
    expect(needsWorkoutGoal(null)).toBe(false);
    expect(needsWorkoutGoal(initialWorkoutGoal())).toBe(false);
  });
});
