import { describe, expect, it } from 'vitest';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import {
  matchExercise,
  parseDateLine,
  parseSetLine,
  parseWorkoutCsv,
  parseWorkoutText,
  splitCsvLine,
} from './import-parser';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const TODAY = new Date(2026, 8, 15); // 15 Sep 2026

describe('parseDateLine', () => {
  it('reads the formats people actually type', () => {
    expect(parseDateLine('01.08.2026', TODAY)).toBe('2026-08-01');
    expect(parseDateLine('1/8/26', TODAY)).toBe('2026-08-01');
    expect(parseDateLine('2026-08-01', TODAY)).toBe('2026-08-01');
    expect(parseDateLine('14 сентября', TODAY)).toBe('2026-09-14');
    expect(parseDateLine('SEP 14', TODAY)).toBe('2026-09-14');
  });

  it('assumes the most recent occurrence for a date with no year', () => {
    // December has not happened yet in 2026, so it means last year.
    expect(parseDateLine('20 декабря', TODAY)).toBe('2025-12-20');
    expect(parseDateLine('12.09', TODAY)).toBe('2026-09-12');
  });

  it('rejects things that are not dates', () => {
    expect(parseDateLine('Жим лежа')).toBeNull();
    expect(parseDateLine('50 x 12')).toBeNull();
  });
});

describe('parseSetLine', () => {
  it('reads a plain weight x reps set', () => {
    const { sets, remainder } = parseSetLine('50 x 12');
    expect(sets).toEqual([{ weight: 50, reps: 12, raw: '50 x 12' }]);
    expect(remainder).toBe('');
  });

  it('handles kg units, cyrillic x, decimal commas and slashes', () => {
    expect(parseSetLine('52,5кг × 10').sets[0]).toMatchObject({ weight: 52.5, reps: 10 });
    expect(parseSetLine('50/12').sets[0]).toMatchObject({ weight: 50, reps: 12 });
  });

  it('expands weight x reps x sets into separate sets', () => {
    const { sets } = parseSetLine('22.5 x 12 x 4');
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.weight === 22.5 && s.reps === 12)).toBe(true);
  });

  it('expands "3 по 12" style with the weight anywhere on the line', () => {
    const { sets } = parseSetLine('3 по 12 50кг');
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({ weight: 50, reps: 12 });
  });

  it('expands "50кг 3 по 12"', () => {
    const { sets } = parseSetLine('50кг 3 по 12');
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({ weight: 50, reps: 12 });
  });

  it('keeps the exercise name as the remainder', () => {
    const { sets, remainder } = parseSetLine('Жим лежа 50 x 12');
    expect(sets).toHaveLength(1);
    expect(remainder).toBe('Жим лежа');
  });

  it('reads several sets from one line', () => {
    const { sets } = parseSetLine('50 x 12, 50 x 12, 60 x 8');
    expect(sets).toHaveLength(3);
    expect(sets.map((s) => s.reps)).toEqual([12, 12, 8]);
  });

  it('warns and takes the lower bound for a rep range', () => {
    const { sets, warnings } = parseSetLine('40 x 15-20');
    expect(sets[0]).toMatchObject({ weight: 40, reps: 15 });
    expect(warnings).toHaveLength(1);
  });

  it('reads reps-only lines as bodyweight work', () => {
    expect(parseSetLine('15').sets[0]).toMatchObject({ weight: null, reps: 15 });
  });

  it('carries reps over for a bare heavier last set', () => {
    expect(parseSetLine('последний 60кг', 12).sets[0]).toMatchObject({ weight: 60, reps: 12 });
    expect(parseSetLine('60кг', 10).sets[0]).toMatchObject({ weight: 60, reps: 10 });
  });
});

describe('matchExercise', () => {
  it('matches by russian name and by latin alias', () => {
    expect(matchExercise('Жим штанги лежа', exercises).exerciseId).toBe('ex_bench_press');
    expect(matchExercise('Bench Press', exercises).exerciseId).toBe('ex_bench_press');
    expect(matchExercise('Incline Dumbbell Press', exercises).exerciseId).toBe('ex_incline_db_press');
  });

  it('refuses to guess when nothing is close', () => {
    expect(matchExercise('Заплыв на спине', exercises).exerciseId).toBeNull();
  });
});

describe('parseWorkoutText', () => {
  it('parses the spec example', () => {
    const { workouts } = parseWorkoutText(
      [
        '01.08.2026',
        'Bench Press',
        '50 x 12',
        '50 x 12',
        '50 x 12',
        '60 x 8',
        'Incline Dumbbell Press',
        '16 x 12',
        '16 x 12',
        '18 x 10',
      ].join('\n'),
      exercises,
      TODAY,
    );

    expect(workouts).toHaveLength(1);
    expect(workouts[0].date).toBe('2026-08-01');
    expect(workouts[0].exercises).toHaveLength(2);
    expect(workouts[0].exercises[0].exerciseId).toBe('ex_bench_press');
    expect(workouts[0].exercises[0].sets).toHaveLength(4);
    expect(workouts[0].exercises[1].sets.at(-1)).toMatchObject({ weight: 18, reps: 10 });
  });

  it('splits multiple dated workouts and reads day headers', () => {
    const { workouts } = parseWorkoutText(
      [
        '01.08.2026',
        'День 1 - Грудь + Трицепс',
        'жим 50кг 3 по 12',
        '08.08.2026',
        'Жим ногами',
        '70 x 12 x 4',
      ].join('\n'),
      exercises,
      TODAY,
    );

    expect(workouts).toHaveLength(2);
    expect(workouts[0].dayName).toContain('DAY 1');
    expect(workouts[0].exercises[0].sets).toHaveLength(3);
    expect(workouts[1].exercises[0].exerciseId).toBe('ex_leg_press');
    expect(workouts[1].exercises[0].sets).toHaveLength(4);
  });

  it('flags a workout with no date instead of inventing one', () => {
    const { workouts } = parseWorkoutText('Жим лежа\n50 x 12', exercises, TODAY);
    expect(workouts[0].date).toBeNull();
    expect(workouts[0].warnings.join(' ')).toContain('Дата');
  });

  it('flags exercises it could not match', () => {
    const { workouts } = parseWorkoutText(
      '01.08.2026\nМоё странное упражнение\n20 x 10',
      exercises,
      TODAY,
    );
    expect(workouts[0].exercises[0].exerciseId).toBeNull();
    expect(workouts[0].warnings.join(' ')).toContain('не найдено');
  });

  it('drops exercises that have no sets', () => {
    const { workouts } = parseWorkoutText(
      '01.08.2026\nЖим лежа\n50 x 12\nЗаметка без подходов и чисел',
      exercises,
      TODAY,
    );
    expect(workouts[0].exercises).toHaveLength(1);
  });
});

describe('csv import', () => {
  it('splits quoted cells', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
    expect(splitCsvLine('a;b', ';')).toEqual(['a', 'b']);
  });

  it('groups rows into workouts by date and reads columns by header', () => {
    const csv = [
      'Date,Program,Workout,Exercise,Set,Weight,Reps',
      '2026-08-01,Mass,Day 1,Жим штанги лежа,1,50,12',
      '2026-08-01,Mass,Day 1,Жим штанги лежа,2,50,12',
      '2026-08-08,Mass,Day 3,Жим ногами,1,70,12',
    ].join('\n');

    const { workouts, warnings } = parseWorkoutCsv(csv, exercises, TODAY);
    expect(warnings).toHaveLength(0);
    expect(workouts).toHaveLength(2);
    expect(workouts[0].exercises[0].sets).toHaveLength(2);
    expect(workouts[1].exercises[0].exerciseId).toBe('ex_leg_press');
  });

  it('reports the rows it had to skip', () => {
    const csv = ['Date,Exercise,Weight,Reps', 'не дата,Жим,50,12'].join('\n');
    const { workouts, warnings } = parseWorkoutCsv(csv, exercises, TODAY);
    expect(workouts).toHaveLength(0);
    expect(warnings[0]).toContain('дата');
  });

  it('reads dates Excel wrote as day counts', () => {
    const csv = ['Date,Exercise,Weight,Reps', '46235,Жим штанги лежа,50,12'].join('\n');
    const { workouts, warnings } = parseWorkoutCsv(csv, exercises, TODAY);
    expect(warnings).toHaveLength(0);
    expect(workouts[0].date).toBe('2026-08-01');
  });

  it('does not read bare numbers in free text as excel dates', () => {
    // A stray "46235" in pasted notes is not a date.
    expect(parseDateLine('46235', TODAY)).toBeNull();
    expect(parseDateLine('46235', TODAY, { allowExcelSerial: true })).toBe('2026-08-01');
  });

  it('explains what columns it needs', () => {
    const { warnings } = parseWorkoutCsv('Foo,Bar\n1,2', exercises, TODAY);
    expect(warnings[0]).toContain('Date');
  });
});
