import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import {
  addHistoricalExercise,
  addHistoricalSet,
  buildSession,
  completeSet,
  finishSession,
  removeExerciseFromSession,
} from './session';
import { sessionVolume, sessionWorkingSetCount } from './volume';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program = buildSeedProgram('2026-01-01T00:00:00.000Z');
const legPress = exercises.find((e) => e.name === 'Жим ногами')!;

function past() {
  let s = buildSession({
    program,
    day: program.days[0],
    mode: 'normal',
    modeConfig: DEFAULT_MODES.normal,
    exercises,
    date: '2026-09-10',
    startedAt: '2026-09-10T18:00:00.000Z',
  });
  const entry = s.exercises[0];
  entry.sets.forEach((set) => {
    s = completeSet(s, entry.id, set.id, {
      weight: set.plan.weight ?? 40,
      reps: 12,
      difficulty: 'good',
    });
  });
  return finishSession(s, '2026-09-10T19:00:00.000Z');
}

describe('добавить упражнение в записанную тренировку', () => {
  it('подход сразу выполненный — иначе в истории его не видно', () => {
    // Экран истории показывает только подходы с фактом: запланированный
    // подход без факта был бы невидимым и неправимым.
    const s = addHistoricalExercise(past(), legPress, { weight: 70, reps: 12 });
    const added = s.exercises[s.exercises.length - 1];
    expect(added.sets).toHaveLength(1);
    expect(added.sets[0].actual).toMatchObject({ weight: 70, reps: 12 });
    expect(added.status).toBe('done');
  });

  it('план равен факту: в истории плана уже нет', () => {
    const s = addHistoricalExercise(past(), legPress, { weight: 70, reps: 12 });
    const added = s.exercises[s.exercises.length - 1];
    expect(added.sets[0].plan).toEqual({ weight: 70, repsMin: 12, repsMax: 12 });
  });

  it('идёт в объём и в счёт рабочих подходов', () => {
    const before = past();
    const after = addHistoricalExercise(before, legPress, { weight: 70, reps: 12 });
    expect(sessionVolume(after) - sessionVolume(before)).toBe(840);
    expect(sessionWorkingSetCount(after)).toBe(sessionWorkingSetCount(before) + 1);
  });

  it('не привязано к программе — правка истории не меняет план', () => {
    const s = addHistoricalExercise(past(), legPress, { weight: 70, reps: 12 });
    expect(s.exercises[s.exercises.length - 1].programExerciseId).toBeNull();
  });

  it('не трогает то, что уже записано', () => {
    const before = past();
    const after = addHistoricalExercise(before, legPress, { weight: 70, reps: 12 });
    expect(after.exercises.slice(0, before.exercises.length)).toEqual(before.exercises);
  });
});

describe('дописать подход', () => {
  it('без аргументов повторяет последний — чаще всего забыли такой же', () => {
    const s = past();
    const entry = s.exercises[0];
    const last = entry.sets[entry.sets.length - 1].actual!;
    const next = addHistoricalSet(s, entry.id);
    const added = next.exercises[0].sets[entry.sets.length];
    expect(added.actual).toMatchObject({ weight: last.weight, reps: last.reps });
  });

  it('принимает свой вес и повторения', () => {
    const s = past();
    const next = addHistoricalSet(s, s.exercises[0].id, { weight: 90, reps: 8 });
    const added = next.exercises[0].sets.at(-1)!;
    expect(added.actual).toMatchObject({ weight: 90, reps: 8 });
  });

  it('нумерация подходов продолжается, а не начинается заново', () => {
    const s = past();
    const n = s.exercises[0].sets.length;
    const next = addHistoricalSet(s, s.exercises[0].id);
    expect(next.exercises[0].sets.at(-1)!.setNumber).toBe(n + 1);
  });

  it('у упражнения без подходов берёт то, что передали', () => {
    const s = addHistoricalExercise(past(), legPress, { weight: 70, reps: 12 });
    const entry = s.exercises.at(-1)!;
    const next = addHistoricalSet(s, entry.id);
    // Повторяет единственный существующий.
    expect(next.exercises.at(-1)!.sets.at(-1)!.actual).toMatchObject({ weight: 70, reps: 12 });
  });

  it('не трогает другие упражнения', () => {
    const s = past();
    const next = addHistoricalSet(s, s.exercises[0].id);
    expect(next.exercises.slice(1)).toEqual(s.exercises.slice(1));
  });
});

describe('убрать упражнение из записанной тренировки', () => {
  it('исчезает вместе с подходами и объёмом', () => {
    const s = past();
    const entry = s.exercises[0];
    const volume = sessionVolume(s);
    const next = removeExerciseFromSession(s, entry.id);
    expect(next.exercises.find((e) => e.id === entry.id)).toBeUndefined();
    expect(sessionVolume(next)).toBeLessThan(volume);
  });

  it('порядок остальных пересчитывается без дыр', () => {
    const s = past();
    const next = removeExerciseFromSession(s, s.exercises[0].id);
    expect(next.exercises.map((e) => e.sortOrder)).toEqual(
      next.exercises.map((_, i) => i),
    );
  });
});
