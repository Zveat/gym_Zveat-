import { describe, expect, it } from 'vitest';
import { averageDifficulty, sessionExerciseCount } from './analytics';
import type { Difficulty, WorkoutSession } from '@/domain/types';

/**
 * Итоги тренировки (§39). Средняя тяжесть считается по RPE, а не по
 * порядковому номеру варианта: между «легко» и «нормой» по ощущениям два шага
 * RPE, а между «тяжело» и «отказом» — один, и усреднение по номерам смещало бы
 * результат в тяжёлую сторону.
 */
const set = (difficulty: Difficulty | null) => ({
  id: 's',
  setNumber: 1,
  setType: 'normal' as const,
  plan: { weight: 50, repsMin: null, repsMax: 12 },
  actual: difficulty === null ? null : { weight: 50, reps: 12, difficulty, rpe: null, rir: null, completedAt: '2026-09-16T09:00:00Z' },
});

const session = (exercises: unknown[]) => ({ exercises }) as WorkoutSession;
const exercise = (difficulties: (Difficulty | null)[], status = 'done') => ({
  id: 'e',
  status,
  sets: difficulties.map(set),
});

describe('средняя тяжесть', () => {
  it('без оценок — нечего усреднять', () => {
    expect(averageDifficulty(session([exercise([null, null])]))).toBeNull();
    expect(averageDifficulty(session([]))).toBeNull();
  });

  it('одна оценка — она и есть средняя', () => {
    expect(averageDifficulty(session([exercise(['hard'])]))).toBe('hard');
  });

  it('усредняет по всем упражнениям', () => {
    // easy(6) + hard(9) → 7.5, ближе к good(8), чем к easy(6).
    expect(averageDifficulty(session([exercise(['easy']), exercise(['hard'])]))).toBe('good');
  });

  it('не смещается в тяжёлую сторону из-за неравных шагов', () => {
    // По номерам варианта easy(0)+failure(3) дало бы среднее 1.5 → hard.
    // По RPE: 6 и 10 → 8 → «норма», что честнее.
    expect(averageDifficulty(session([exercise(['easy', 'failure'])]))).toBe('good');
  });

  it('незаполненные оценки не тянут результат вниз', () => {
    expect(averageDifficulty(session([exercise(['hard', null, null])]))).toBe('hard');
  });
});

describe('счёт упражнений в итогах', () => {
  it('считает только те, где есть хотя бы один подход', () => {
    expect(sessionExerciseCount(session([exercise(['good']), exercise([null, null])]))).toBe(1);
  });

  it('пропущенные не считает', () => {
    // Иначе «упражнений 7» при трёх сделанных — приложение хвалит за пропуски.
    expect(sessionExerciseCount(session([exercise(['good'], 'skipped')]))).toBe(0);
  });

  it('пустая тренировка — ноль', () => {
    expect(sessionExerciseCount(session([]))).toBe(0);
  });
});
