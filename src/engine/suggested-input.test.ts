import { describe, expect, it } from 'vitest';
import { suggestedInput } from './session';
import type { SessionExercise, SessionSet, SetType } from '@/domain/types';

/**
 * Главная метрика ТЗ — сколько действий на фиксацию обычного подхода. Цель:
 * один тап. Всё ломалось здесь: следующий подход заполнялся из ПЛАНА, поэтому
 * поставленные 72.5 кг возвращались к 70 на каждом подходе, и вес приходилось
 * выставлять заново четыре раза за упражнение.
 */
const set = (
  setNumber: number,
  plan: { weight: number | null; repsMin?: number | null; repsMax?: number | null },
  actual?: { weight: number; reps: number },
  setType: SetType = 'normal',
): SessionSet => ({
  id: `s${setNumber}`,
  setNumber,
  setType,
  // `?? 12` съедал явный null, и проверки «плана без повторений» не доходили
  // до кода вообще — сравнивать надо наличие ключа, а не его значение.
  plan: {
    weight: plan.weight,
    repsMin: 'repsMin' in plan ? (plan.repsMin ?? null) : null,
    repsMax: 'repsMax' in plan ? (plan.repsMax ?? null) : 12,
  },
  actual: actual
    ? { ...actual, difficulty: null, rpe: null, rir: null, completedAt: '2026-09-16T09:00:00Z' }
    : null,
});

const entry = (sets: SessionSet[]): SessionExercise =>
  ({ id: 'e1', exerciseId: 'ex1', name: 'Жим ногами', sets, status: 'in_progress' }) as SessionExercise;

describe('автозаполнение подхода', () => {
  it('первый подход берёт план — сравнивать ещё не с чем', () => {
    const sets = [set(1, { weight: 70 }), set(2, { weight: 70 })];
    expect(suggestedInput(entry(sets), sets[0])).toEqual({ weight: 70, reps: 12 });
  });

  it('переносит фактический вес в следующий подход', () => {
    // Ради этого всё и делается: поставил 72.5 — второй подход тоже 72.5.
    const sets = [set(1, { weight: 70 }, { weight: 72.5, reps: 12 }), set(2, { weight: 70 })];
    expect(suggestedInput(entry(sets), sets[1])).toEqual({ weight: 72.5, reps: 12 });
  });

  it('переносит и повторения, если цель по плану та же', () => {
    const sets = [set(1, { weight: 70 }, { weight: 70, reps: 10 }), set(2, { weight: 70 })];
    expect(suggestedInput(entry(sets), sets[1])).toEqual({ weight: 70, reps: 10 });
  });

  it('берёт последний ВЫПОЛНЕННЫЙ подход, а не первый', () => {
    const sets = [
      set(1, { weight: 70 }, { weight: 70, reps: 12 }),
      set(2, { weight: 70 }, { weight: 75, reps: 11 }),
      set(3, { weight: 70 }),
    ];
    expect(suggestedInput(entry(sets), sets[2])).toEqual({ weight: 75, reps: 11 });
  });

  it('выполненный подход показывает себя, а не догадку', () => {
    const sets = [set(1, { weight: 70 }, { weight: 72.5, reps: 11 }), set(2, { weight: 70 })];
    expect(suggestedInput(entry(sets), sets[0])).toEqual({ weight: 72.5, reps: 11 });
  });

  it('лестницу в плане не ломает', () => {
    // План 70 → 75 задан намеренно. Тянуть туда прошлый вес значит сломать схему.
    const sets = [set(1, { weight: 70 }, { weight: 72.5, reps: 12 }), set(2, { weight: 75 })];
    expect(suggestedInput(entry(sets), sets[1])).toEqual({ weight: 75, reps: 12 });
  });

  it('у подхода другого типа своя цель', () => {
    // Отказной подход не должен получить 12 повторений из рабочего.
    const sets = [
      set(1, { weight: 70 }, { weight: 70, reps: 12 }),
      set(2, { weight: 70, repsMax: null }, undefined, 'failure'),
    ];
    expect(suggestedInput(entry(sets), sets[1])).toEqual({ weight: 70, reps: 10 });
  });

  it('другая цель по повторениям в плане — повторения из плана, вес переносится', () => {
    const sets = [
      set(1, { weight: 70, repsMax: 12 }, { weight: 72.5, reps: 12 }),
      set(2, { weight: 70, repsMax: 8 }),
    ];
    expect(suggestedInput(entry(sets), sets[1])).toEqual({ weight: 72.5, reps: 8 });
  });

  it('пропущенный подход в середине не мешает', () => {
    const sets = [
      set(1, { weight: 70 }, { weight: 72.5, reps: 12 }),
      set(2, { weight: 70 }),
      set(3, { weight: 70 }),
    ];
    expect(suggestedInput(entry(sets), sets[2])).toEqual({ weight: 72.5, reps: 12 });
  });

  it('план без веса остаётся без веса', () => {
    // «Сбросить вес и до отказа» — веса в программе нет намеренно.
    const sets = [set(1, { weight: null })];
    expect(suggestedInput(entry(sets), sets[0])).toEqual({ weight: null, reps: 12 });
  });

  it('план без повторений даёт разумное начало счётчика', () => {
    const sets = [set(1, { weight: 70, repsMin: null, repsMax: null })];
    expect(suggestedInput(entry(sets), sets[0])).toEqual({ weight: 70, reps: 10 });
  });
});

/**
 * ПОДЪЁМ EZ-ГРИФА: «Че за херня? Почему вес 0?»
 *
 * В программе веса у этого упражнения нет намеренно — в ТЗ его не назвали, и
 * выдумывать нельзя. Но в истории лежат 12–17 кг в четырёх подходах, то есть
 * приложение знало ответ и подставляло ноль. Ноль сохраняется одним тапом и
 * уезжает в историю, которая не правится.
 */
describe('вес с прошлой тренировки, когда в программе его нет', () => {
  const lastWorkout = entry([
    set(1, { weight: null }, { weight: 12, reps: 17 }),
    set(2, { weight: null }, { weight: 15, reps: 14 }),
    set(3, { weight: null }, { weight: 17, reps: 12 }),
    set(4, { weight: null }, { weight: 17, reps: 12 }),
  ]);

  it('берёт вес того же по номеру подхода, а не максимум', () => {
    const sets = [set(1, { weight: null, repsMax: 10 }), set(2, { weight: null, repsMax: 10 })];
    expect(suggestedInput(entry(sets), sets[0], lastWorkout)).toEqual({
      weight: 12,
      reps: 10,
      fromLastWorkout: true,
    });
    // Второй подход — 15, как и было: лестница сохраняется.
    expect(suggestedInput(entry(sets), sets[1], lastWorkout)?.weight).toBe(15);
  });

  it('подходов в прошлый раз было больше — берёт последний', () => {
    const sets = [set(5, { weight: null, repsMax: 10 })];
    expect(suggestedInput(entry(sets), sets[0], lastWorkout)?.weight).toBe(17);
  });

  it('повторения берёт из плана, а не из прошлого раза', () => {
    // Прошлый раз в первом подходе было 17 повторений, а план просит 10.
    const sets = [set(1, { weight: null, repsMax: 10 })];
    expect(suggestedInput(entry(sets), sets[0], lastWorkout)?.reps).toBe(10);
  });

  it('когда плана по повторениям тоже нет — берёт из прошлого раза', () => {
    const sets = [set(1, { weight: null, repsMin: null, repsMax: null })];
    expect(suggestedInput(entry(sets), sets[0], lastWorkout)?.reps).toBe(17);
  });

  it('нули из истории не подставляет — это не вес', () => {
    const zeroes = entry([set(1, { weight: null }, { weight: 0, reps: 10 })]);
    const sets = [set(1, { weight: null, repsMax: 10 })];
    expect(suggestedInput(entry(sets), sets[0], zeroes)).toEqual({ weight: null, reps: 10 });
  });

  it('когда вес в программе есть, историю не трогает', () => {
    const sets = [set(1, { weight: 70 })];
    expect(suggestedInput(entry(sets), sets[0], lastWorkout)).toEqual({ weight: 70, reps: 12 });
  });

  it('внутри упражнения свой предыдущий подход всё равно главнее', () => {
    const sets = [
      set(1, { weight: null, repsMax: 10 }, { weight: 20, reps: 10 }),
      set(2, { weight: null, repsMax: 10 }),
    ];
    // Поставил 20 — второй подход начинается с 20, а не с прошлотренировочных 15.
    expect(suggestedInput(entry(sets), sets[1], lastWorkout)).toEqual({ weight: 20, reps: 10 });
  });

  it('без истории остаётся пусто — выдумывать нечего', () => {
    const sets = [set(1, { weight: null, repsMax: 10 })];
    expect(suggestedInput(entry(sets), sets[0], null)).toEqual({ weight: null, reps: 10 });
  });
});
