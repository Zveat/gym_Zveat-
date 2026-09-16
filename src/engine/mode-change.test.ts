import { describe, expect, it } from 'vitest';
import { changeSessionMode } from './session';
import { DEFAULT_MODES } from '@/domain/modes';
import type { Program, WorkoutSession } from '@/domain/types';

/**
 * Смена режима посреди тренировки (§58) против границы ПРОГРАММА ≠ ИСТОРИЯ.
 *
 * Опасность именно здесь: пересчёт плана легко задевает уже выполненные
 * подходы, и тогда «переключил режим» тихо переписывает то, что человек
 * реально поднял. Это подделка записи, а не пересчёт.
 */
const programExercise = (id: string, weight: number, sets = 4) => ({
  id,
  exerciseId: 'ex1',
  sortOrder: 0,
  restSeconds: 90,
  progression: { type: 'manual' as const },
  sets: Array.from({ length: sets }, (_, i) => ({
    id: `${id}-s${i + 1}`,
    setNumber: i + 1,
    setType: 'normal' as const,
    targetWeight: weight,
    targetRepsMin: null,
    targetRepsMax: 12,
  })),
});

const program = (weight = 50, sets = 4): Program =>
  ({
    id: 'p1',
    days: [{ id: 'd1', exercises: [programExercise('pe1', weight, sets)] }],
  }) as unknown as Program;

const session = (doneCount: number, totalSets = 4): WorkoutSession =>
  ({
    id: 's1',
    programId: 'p1',
    workoutDayId: 'd1',
    mode: 'normal',
    modeSnapshot: DEFAULT_MODES.normal,
    exercises: [
      {
        id: 'se1',
        exerciseId: 'ex1',
        programExerciseId: 'pe1',
        status: 'in_progress',
        observations: [],
        sets: Array.from({ length: totalSets }, (_, i) => ({
          id: `set${i + 1}`,
          setNumber: i + 1,
          setType: 'normal' as const,
          plan: { weight: 50, repsMin: null, repsMax: 12 },
          actual:
            i < doneCount
              ? { weight: 52.5, reps: 12, difficulty: null, rpe: null, rir: null, completedAt: 'x' }
              : null,
        })),
      },
    ],
  }) as unknown as WorkoutSession;

const apply = (s: WorkoutSession, p: Program | null = program()) =>
  changeSessionMode(s, 'light', DEFAULT_MODES.light, p);

describe('смена режима на ходу', () => {
  it('записывает новый режим и его снимок', () => {
    const next = apply(session(0));
    expect(next.mode).toBe('light');
    expect(next.modeSnapshot).toEqual(DEFAULT_MODES.light);
  });

  it('пересчитывает план у невыполненных подходов', () => {
    // Легкая: множитель 0.85 → 50 кг становится 42.5.
    const next = apply(session(0));
    expect(next.exercises[0].sets[0].plan.weight).toBe(42.5);
  });

  it('НЕ трогает выполненные подходы', () => {
    const before = session(2);
    const next = apply(before);
    const done = next.exercises[0].sets.slice(0, 2);
    expect(done.map((s) => s.actual?.weight)).toEqual([52.5, 52.5]);
    // План выполненного подхода — тоже запись о том, что было задано.
    expect(done.map((s) => s.plan.weight)).toEqual([50, 50]);
  });

  it('пересчитывает только хвост', () => {
    const next = apply(session(2));
    expect(next.exercises[0].sets[2].plan.weight).toBe(42.5);
  });

  it('урезает количество подходов только за счёт невыполненных', () => {
    // Легкая снимает один подход: из четырёх остаётся три.
    const next = apply(session(0));
    expect(next.exercises[0].sets).toHaveLength(3);
  });

  it('никогда не удаляет выполненный подход, даже если режим просит меньше', () => {
    // Сделаны все четыре, легкая просит три — остаются четыре.
    const next = apply(session(4));
    expect(next.exercises[0].sets).toHaveLength(4);
    expect(next.exercises[0].sets.every((s) => s.actual !== null)).toBe(true);
  });

  it('закрытое упражнение не трогает вообще', () => {
    const before = session(4);
    const next = apply(before);
    expect(next.exercises[0]).toBe(before.exercises[0]);
  });

  it('пропущенное упражнение не трогает', () => {
    const before = session(0);
    before.exercises[0].status = 'skipped';
    expect(apply(before).exercises[0]).toBe(before.exercises[0]);
  });

  it('упражнение, добавленное на ходу, оставляет как есть', () => {
    // Его нет в программе, пересчитывать не из чего — лучше прежние числа,
    // чем выдуманные.
    const before = session(0);
    before.exercises[0].programExerciseId = null;
    expect(apply(before).exercises[0]).toBe(before.exercises[0]);
  });

  it('без программы ничего не пересчитывает, но режим записывает', () => {
    const before = session(0);
    const next = apply(before, null);
    expect(next.mode).toBe('light');
    expect(next.exercises[0]).toBe(before.exercises[0]);
  });

  it('сохраняет идентификаторы существующих подходов', () => {
    // Иначе живой экран потерял бы выбранный подход, а записи разъехались бы.
    const next = apply(session(1));
    expect(next.exercises[0].sets.map((s) => s.id).slice(0, 2)).toEqual(['set1', 'set2']);
  });
});
