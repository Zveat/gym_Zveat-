import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import {
  buildSession,
  cardioRemainingSeconds,
  logCardio,
  startCardio,
  stopCardio,
  undoCardio,
} from './session';
import { formatCardio } from './format';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program = buildSeedProgram('2026-01-01T00:00:00.000Z');

function start(dayIndex = 0) {
  return buildSession({
    program,
    day: program.days[dayIndex],
    mode: 'normal',
    modeConfig: DEFAULT_MODES.normal,
    exercises,
    date: '2026-09-15',
    startedAt: '2026-09-15T18:00:00.000Z',
  });
}

describe('разминка и заминка в программе', () => {
  it('есть у каждого дня', () => {
    for (const day of program.days) {
      expect(day.warmup, day.name).toBeDefined();
      expect(day.cooldown, day.name).toBeDefined();
    }
  });

  it('у дня ног подъём 8, у остальных 0 — так владелец греется перед приседом', () => {
    for (const day of program.days) {
      const expected = /ноги/i.test(day.title) ? 8 : 0;
      expect(day.warmup!.incline, day.title).toBe(expected);
    }
  });

  it('разминка 10 минут, заминка 5 — как в ТЗ владельца', () => {
    expect(program.days.map((d) => d.warmup!.minutes)).toEqual([10, 10, 10, 10, 10]);
    expect(program.days.map((d) => d.cooldown!.minutes)).toEqual([5, 5, 5, 5, 5]);
    // Заминка без подъёма всегда, включая день ног.
    expect(program.days.every((d) => d.cooldown!.incline === 0)).toBe(true);
  });
});

describe('снимок в тренировке', () => {
  it('переносит план и оставляет невыполненным', () => {
    const session = start();
    expect(session.warmup).toEqual({
      plan: { minutes: 10, incline: 0, note: 'Ходьба на дорожке' },
      actual: null,
    });
    expect(session.cooldown!.actual).toBeNull();
  });

  it('копия, а не ссылка: правка программы не меняет прошедшую тренировку', () => {
    const session = start();
    expect(session.warmup!.plan).not.toBe(program.days[0].warmup);
  });

  it('день ног приносит свой подъём', () => {
    const legsIndex = program.days.findIndex((d) => /ноги/i.test(d.title));
    expect(start(legsIndex).warmup!.plan.incline).toBe(8);
  });
});

describe('logCardio', () => {
  it('один тап без аргументов пишет ровно план — это главный случай', () => {
    const next = logCardio(start(), 'warmup', {}, '2026-09-15T18:11:00.000Z');
    expect(next.warmup!.actual).toEqual({
      minutes: 10,
      incline: 0,
      completedAt: '2026-09-15T18:11:00.000Z',
    });
  });

  it('принимает правку минут и подъёма', () => {
    const next = logCardio(start(), 'warmup', { minutes: 7, incline: 5 });
    expect(next.warmup!.actual!.minutes).toBe(7);
    expect(next.warmup!.actual!.incline).toBe(5);
  });

  it('явный null подъёма отличим от «не передали»', () => {
    const legs = start(program.days.findIndex((d) => /ноги/i.test(d.title)));
    expect(logCardio(legs, 'warmup', {}).warmup!.actual!.incline).toBe(8);
    expect(logCardio(legs, 'warmup', { incline: null }).warmup!.actual!.incline).toBeNull();
  });

  it('не трогает план и второй блок', () => {
    const session = start();
    const next = logCardio(session, 'warmup');
    expect(next.warmup!.plan).toEqual(session.warmup!.plan);
    expect(next.cooldown).toEqual(session.cooldown);
  });

  it('не трогает подходы: кардио не идёт в объём', () => {
    const session = start();
    expect(logCardio(session, 'cooldown').exercises).toEqual(session.exercises);
  });

  it('возвращает ту же тренировку, если блока в ней нет', () => {
    const session = { ...start(), warmup: undefined };
    expect(logCardio(session, 'warmup')).toBe(session);
  });
});

describe('undoCardio', () => {
  it('снимает отметку — тап мимо в зале обычное дело', () => {
    const done = logCardio(start(), 'cooldown');
    expect(undoCardio(done, 'cooldown').cooldown!.actual).toBeNull();
  });

  it('сохраняет план после отката', () => {
    const done = logCardio(start(), 'cooldown', { minutes: 2 });
    expect(undoCardio(done, 'cooldown').cooldown!.plan.minutes).toBe(5);
  });

  it('ничего не делает, когда отметки не было', () => {
    const session = start();
    expect(undoCardio(session, 'warmup')).toBe(session);
  });
});

describe('formatCardio', () => {
  it('печатает подъём даже нулевой: ноль на дорожке надо выставить', () => {
    expect(formatCardio({ minutes: 10, incline: 0 })).toBe('10 мин · подъём 0');
    expect(formatCardio({ minutes: 10, incline: 8 })).toBe('10 мин · подъём 8');
  });

  it('без подъёма — только минуты', () => {
    expect(formatCardio({ minutes: 5, incline: null })).toBe('5 мин');
  });
});

describe('таймер разминки', () => {
  const t0 = new Date('2026-09-16T18:00:00.000Z').getTime();

  it('запуск хранит момент окончания, а не остаток', () => {
    // Телефон в зале блокируется и сворачивается: отсчёт тиков этого не
    // переживает, а момент окончания переживает.
    const s = startCardio(start(), 'warmup', t0);
    expect(s.warmup!.endsAt).toBe(t0 + 10 * 60_000);
    expect(s.warmup!.startedAt).toBe('2026-09-16T18:00:00.000Z');
  });

  it('остаток считается от текущего времени', () => {
    const s = startCardio(start(), 'warmup', t0);
    expect(cardioRemainingSeconds(s.warmup, t0)).toBe(600);
    expect(cardioRemainingSeconds(s.warmup, t0 + 3 * 60_000)).toBe(420);
    // Ниже нуля не уходит: «минус две минуты» ничего не значит.
    expect(cardioRemainingSeconds(s.warmup, t0 + 20 * 60_000)).toBe(0);
  });

  it('незапущенный таймер остатка не имеет', () => {
    expect(cardioRemainingSeconds(start().warmup, t0)).toBeNull();
  });

  it('сброс не отмечает выполненным — передумал, а не сделал', () => {
    const s = stopCardio(startCardio(start(), 'warmup', t0), 'warmup');
    expect(s.warmup!.endsAt).toBeNull();
    expect(s.warmup!.startedAt).toBeNull();
    expect(s.warmup!.actual).toBeNull();
  });

  it('после таймера пишется РЕАЛЬНОЕ время, а не план', () => {
    // Сойти с дорожки на седьмой минуте и записать себе десять — значит
    // испортить собственную историю.
    const running = startCardio(start(), 'warmup', t0);
    const early = logCardio(running, 'warmup', {}, new Date(t0 + 7 * 60_000).toISOString());
    expect(early.warmup!.actual!.minutes).toBe(7);
  });

  it('доведённый до конца таймер даёт ровно план', () => {
    const running = startCardio(start(), 'warmup', t0);
    const full = logCardio(running, 'warmup', {}, new Date(t0 + 10 * 60_000).toISOString());
    expect(full.warmup!.actual!.minutes).toBe(10);
  });

  it('минимум одна минута, даже если отметили сразу', () => {
    const running = startCardio(start(), 'warmup', t0);
    expect(logCardio(running, 'warmup', {}, new Date(t0 + 5_000).toISOString()).warmup!.actual!.minutes).toBe(1);
  });

  it('без таймера один тап по-прежнему пишет план', () => {
    expect(logCardio(start(), 'warmup', {}).warmup!.actual!.minutes).toBe(10);
  });

  it('отметка гасит таймер, чтобы он не тикал под галочкой', () => {
    const done = logCardio(startCardio(start(), 'warmup', t0), 'warmup');
    expect(done.warmup!.endsAt).toBeNull();
    expect(done.warmup!.startedAt).toBeNull();
  });

  it('ручная правка минут сильнее замера', () => {
    const running = startCardio(start(), 'warmup', t0);
    const edited = logCardio(running, 'warmup', { minutes: 15 }, new Date(t0 + 60_000).toISOString());
    expect(edited.warmup!.actual!.minutes).toBe(15);
  });

  it('заминка работает так же', () => {
    const s = startCardio(start(), 'cooldown', t0);
    expect(cardioRemainingSeconds(s.cooldown, t0)).toBe(300);
  });
});
