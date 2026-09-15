import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import type { WorkoutSession } from '@/domain/types';
import {
  bodyWeightStats,
  countPRs,
  muscleGroupStats,
  overviewStats,
  progressionDelta,
  progressionSeries,
  weekWindow,
  weeklyVolumeDelta,
} from './analytics';
import { exerciseHistory, lastPerformance, suggestNextDay, workoutStreak } from './history';
import { detectPRs, personalRecords, primaryPR } from './records';
import { buildSession, completeSet, finishSession } from './session';
import { estimated1RM, workingWeight } from './volume';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program = buildSeedProgram('2026-01-01T00:00:00.000Z');
const NOW = new Date(2026, 8, 15, 20, 0); // Tue 15 Sep 2026

/** Day 1 with bench press done at the given weight/reps pairs. */
function benchDay(date: string, sets: [number, number][]): WorkoutSession {
  let session = buildSession({
    program,
    day: program.days[0],
    mode: 'normal',
    modeConfig: DEFAULT_MODES.normal,
    exercises,
    date,
    startedAt: `${date}T18:00:00.000Z`,
  });
  const bench = session.exercises[0];
  sets.forEach(([weight, reps], i) => {
    const set = bench.sets[i];
    if (!set) return;
    session = completeSet(session, bench.id, set.id, { weight, reps, difficulty: 'good' }, `${date}T18:0${i}:00.000Z`);
  });
  return finishSession(session, `${date}T19:00:00.000Z`);
}

const history: WorkoutSession[] = [
  benchDay('2026-08-31', [[50, 10], [50, 10], [50, 9], [55, 8]]),
  benchDay('2026-09-07', [[50, 12], [50, 12], [50, 11], [60, 8]]),
  benchDay('2026-09-14', [[50, 12], [50, 12], [50, 12], [60, 10]]),
];

describe('exercise history', () => {
  it('returns performances newest first with volume and top weight', () => {
    const entries = exerciseHistory(history, 'ex_bench_press');
    expect(entries.map((e) => e.date)).toEqual(['2026-09-14', '2026-09-07', '2026-08-31']);
    expect(entries[0].topWeight).toBe(60);
    expect(entries[0].volume).toBe(50 * 12 * 3 + 60 * 10);
    expect(workingWeight(entries[0].entry)).toBe(50);
  });

  it('filters by range and by program', () => {
    expect(exerciseHistory(history, 'ex_bench_press', { range: '1m', now: NOW })).toHaveLength(3);
    expect(
      exerciseHistory(history, 'ex_bench_press', { programId: 'nope' }),
    ).toHaveLength(0);
  });

  it('finds the last time, excluding the workout in progress', () => {
    const last = lastPerformance(history, 'ex_bench_press', history[2].id);
    expect(last?.date).toBe('2026-09-07');
  });

  it('counts a streak across normal rest days and breaks on a long gap', () => {
    expect(workoutStreak(history, NOW)).toBe(1); // 14 Sep, then a 7-day gap back
    const dense = [
      benchDay('2026-09-15', [[50, 12]]),
      benchDay('2026-09-14', [[50, 12]]),
      benchDay('2026-09-12', [[50, 12]]),
    ];
    expect(workoutStreak(dense, NOW)).toBe(3);
    expect(workoutStreak([benchDay('2026-08-01', [[50, 12]])], NOW)).toBe(0);
  });

  it('suggests the next program day after the one last trained', () => {
    const dayIds = program.days.map((d) => d.id);
    expect(suggestNextDay(history, dayIds)).toBe(dayIds[1]);
    expect(suggestNextDay([], dayIds)).toBe(dayIds[0]);
  });
});

describe('personal records', () => {
  it('tracks max weight, max reps, best set volume and best performance', () => {
    const pr = personalRecords(history, 'ex_bench_press', 'Жим лежа');
    expect(pr.maxWeight).toMatchObject({ value: 60, reps: 10 });
    expect(pr.maxReps).toMatchObject({ value: 12 });
    expect(pr.maxSetVolume?.value).toBe(600);
    expect(pr.bestPerformance?.value).toBeCloseTo(estimated1RM(60, 10), 5);
  });

  it('can be computed as of a date, which is what PR detection needs', () => {
    const before = personalRecords(history, 'ex_bench_press', '', { before: '2026-09-14' });
    expect(before.maxWeight?.value).toBe(60);
    expect(before.maxReps?.value).toBe(12);
  });

  it('detects a set that beats the baseline', () => {
    const baseline = personalRecords(history, 'ex_bench_press', '', { before: '2026-09-14' });
    const prs = detectPRs(baseline, { weight: 65, reps: 8, setType: 'normal' });
    expect(prs.map((p) => p.kind)).toContain('weight');
    expect(primaryPR(prs)?.kind).toBe('weight');
    expect(detectPRs(baseline, { weight: 50, reps: 10, setType: 'normal' })).toHaveLength(0);
  });

  it('never counts a warm-up as a record', () => {
    const baseline = personalRecords(history, 'ex_bench_press');
    expect(detectPRs(baseline, { weight: 999, reps: 20, setType: 'warmup' })).toHaveLength(0);
  });

  it('counts PRs across history without counting the first ever session', () => {
    expect(countPRs([history[0]])).toBe(0);
    // 31 Aug is the baseline; 7 Sep (60x8) and 14 Sep (60x10) each beat it.
    expect(countPRs(history)).toBe(2);
  });

  it('gives no PRs for a set with nothing in history to beat', () => {
    const fresh = personalRecords([], 'ex_bench_press');
    expect(detectPRs(fresh, { weight: 100, reps: 10, setType: 'normal' })).toHaveLength(0);
  });
});

describe('dashboard analytics', () => {
  it('summarises workouts, volume, sets and average duration', () => {
    const stats = overviewStats(history, undefined, NOW);
    expect(stats.workouts).toBe(3);
    expect(stats.totalSets).toBe(12);
    expect(stats.avgDurationSeconds).toBe(3600);
    expect(stats.totalVolume).toBeGreaterThan(5000);
  });

  it('scopes stats to a week window', () => {
    const thisWeek = overviewStats(history, weekWindow(NOW, 0), NOW);
    expect(thisWeek.workouts).toBe(1); // Mon 14 Sep starts this week
    const lastWeek = overviewStats(history, weekWindow(NOW, -1), NOW);
    expect(lastWeek.workouts).toBe(1);
  });

  it('compares this week against last week', () => {
    const d = weeklyVolumeDelta(history, NOW);
    expect(d.previous).toBeGreaterThan(0);
    expect(d.percent).not.toBeNull();
    expect(weeklyVolumeDelta([], NOW).percent).toBeNull();
  });

  it('credits secondary muscles at half a set', () => {
    const stats = muscleGroupStats(history, exercises);
    const chest = stats.find((s) => s.muscle === 'chest')!;
    const triceps = stats.find((s) => s.muscle === 'triceps')!;
    expect(chest.workingSets).toBe(12);
    expect(triceps.workingSets).toBe(6); // bench press secondary
  });

  it('plots the working weight, not the top set, for progression', () => {
    const series = progressionSeries(history, 'ex_bench_press', 'weight');
    expect(series.map((p) => p.value)).toEqual([50, 50, 50]);
    const volume = progressionSeries(history, 'ex_bench_press', 'volume');
    expect(volume.at(-1)!.value).toBeGreaterThan(volume[0].value);
  });

  it('reports change over a window, and no percentage without a baseline', () => {
    const perf = progressionSeries(history, 'ex_bench_press', 'performance');
    expect(progressionDelta(perf, 30, NOW).percent).not.toBeNull();
    expect(progressionDelta([], 30, NOW).percent).toBeNull();
  });
});

describe('body weight', () => {
  it('reports the latest entry and the change over 7 and 30 days', () => {
    const logs = [
      { id: '1', weight: 79.0, date: '2026-08-16' },
      { id: '2', weight: 79.8, date: '2026-09-08' },
      { id: '3', weight: 80.2, date: '2026-09-15' },
    ];
    const stats = bodyWeightStats(logs, NOW);
    expect(stats.latest?.weight).toBe(80.2);
    expect(stats.change7d).toBe(0.4);
    expect(stats.change30d).toBe(1.2);
    expect(bodyWeightStats([], NOW).latest).toBeNull();
  });
});
