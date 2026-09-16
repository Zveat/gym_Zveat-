import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import type { Difficulty, Program, WorkoutSession } from '@/domain/types';
import { recommendForExercise } from './progression';
import { buildSession, completeSet, finishSession } from './session';
import { sessionPRSummary } from './records';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program: Program = buildSeedProgram('2026-01-01T00:00:00.000Z');

/**
 * Тренирует первое упражнение дня 4 (двойная прогрессия) указанным числом
 * подходов: `reps[i] === undefined` значит «подход не делали».
 */
function session(
  reps: (number | undefined)[],
  difficulty: Difficulty = 'good',
  date = '2026-09-16',
): WorkoutSession {
  let s = buildSession({
    program,
    day: program.days[3],
    mode: 'normal',
    modeConfig: DEFAULT_MODES.normal,
    exercises,
    date,
    startedAt: `${date}T18:00:00.000Z`,
  });
  const entry = s.exercises[0];
  entry.sets.forEach((set, i) => {
    const r = reps[i];
    if (r === undefined) return;
    s = completeSet(s, entry.id, set.id, {
      weight: set.plan.weight ?? 0,
      reps: r,
      difficulty,
    });
  });
  return finishSession(s, `${date}T19:00:00.000Z`);
}

const rec = (s: WorkoutSession) =>
  recommendForExercise({
    entry: s.exercises[0],
    programExercise: program.days[3].exercises[0],
    exercise: exercises.find((e) => e.id === s.exercises[0].exerciseId) ?? null,
    sessions: [],
  });

const target = () => {
  const sets = program.days[3].exercises[0].sets;
  return Math.max(...sets.map((x) => x.targetRepsMax ?? 12));
};

describe('прибавлять только за полный объём', () => {
  it('один подход из четырёх — это не «цель закрыта во всех подходах»', () => {
    // Правило смотрело лишь на выполненные подходы, поэтому при одном подходе
    // условие «все дотянули» выполнялось само собой и экран предлагал +2.5 кг.
    const r = rec(session([target()]));
    expect(r.verdict).toBe('hold');
    expect(r.reason).toMatch(/Сделано 1 из 4 подходов/);
  });

  it('называет, сколько именно не сделано', () => {
    expect(rec(session([target(), target()])).reason).toMatch(/Сделано 2 из 4 подходов — 2 не выполнено/);
  });

  it('не предлагает другой вес, пока объём не добран', () => {
    const r = rec(session([target()]));
    expect(r.suggestedWeight).toBe(r.currentWeight);
  });

  it('полный объём с закрытой целью — прибавляем', () => {
    const t = target();
    const r = rec(session([t, t, t, t]));
    expect(r.verdict).toBe('increase');
    expect(r.reason).toMatch(/во всех 4 подходах/);
    expect(r.suggestedWeight).toBeGreaterThan(r.currentWeight!);
  });

  it('недобор повторений при полном объёме по-прежнему держит вес', () => {
    const t = target();
    const r = rec(session([t, t, t, t - 3]));
    expect(r.verdict).toBe('hold');
    expect(r.reason).toMatch(/не дотянули/);
  });
});

describe('тяжесть перебивает закрытые повторения', () => {
  const t = () => target();

  it('отказ в подходе — закрепляем вес, а не прибавляем', () => {
    const r = rec(session([t(), t(), t(), t()], 'failure'));
    expect(r.verdict).toBe('hold');
    expect(r.reason).toMatch(/отказ/);
  });

  it('«тяжело» — тоже держим', () => {
    expect(rec(session([t(), t(), t(), t()], 'hard')).verdict).toBe('hold');
  });

  it('«легко» и «норма» прибавляют', () => {
    expect(rec(session([t(), t(), t(), t()], 'easy')).verdict).toBe('increase');
    expect(rec(session([t(), t(), t(), t()], 'good')).verdict).toBe('increase');
  });
});

describe('рекорды: «не с чем сравнивать» это не «ноль рекордов»', () => {
  it('без истории говорит, что сравнивать не с чем', () => {
    const s = session([12, 12, 12, 12]);
    const summary = sessionPRSummary([s], s);
    expect(summary.comparable).toBe(0);
    expect(summary.count).toBe(0);
  });

  it('с историей считает рекорд по-настоящему', () => {
    const past = session([12, 12, 12, 12], 'good', '2026-09-01');
    const now = session([12, 12, 12, 12], 'good', '2026-09-16');
    // Тот же вес и повторения — рекорда нет, но сравнение состоялось.
    const same = sessionPRSummary([past, now], now);
    expect(same.comparable).toBeGreaterThan(0);
    expect(same.count).toBe(0);

    // А теперь тяжелее: 90 кг в последнем подходе там, где раньше был план.
    // Подходы дожимаем ДО `finishSession` — он выбрасывает невыполненные, и
    // после него четвёртого подхода в сессии уже нет.
    let heavier = buildSession({
      program,
      day: program.days[3],
      mode: 'normal',
      modeConfig: DEFAULT_MODES.normal,
      exercises,
      date: '2026-09-16',
      startedAt: '2026-09-16T18:00:00.000Z',
    });
    const entry = heavier.exercises[0];
    entry.sets.forEach((set, i) => {
      heavier = completeSet(heavier, entry.id, set.id, {
        weight: i === 3 ? 90 : (set.plan.weight ?? 0),
        reps: 12,
        difficulty: 'good',
      });
    });
    heavier = finishSession(heavier, '2026-09-16T19:00:00.000Z');
    const beaten = sessionPRSummary([past, heavier], heavier);
    expect(beaten.comparable).toBeGreaterThan(0);
    expect(beaten.count).toBeGreaterThan(0);
  });

  it('пропущенное упражнение не считается несравнимым', () => {
    // У него просто нет выполненных подходов — в счёт не идёт вообще.
    const s = session([]);
    expect(sessionPRSummary([s], s)).toEqual({ count: 0, comparable: 0 });
  });
});
