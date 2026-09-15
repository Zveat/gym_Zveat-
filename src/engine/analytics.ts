import type {
  BodyWeightLog,
  Exercise,
  ID,
  MuscleGroup,
  WorkoutSession,
} from '@/domain/types';
import { completedSessions, exerciseHistory, workoutStreak } from './history';
import { personalRecords } from './records';
import { estimated1RM, isWorkingSet, sessionVolume, sessionWorkingSetCount, workingWeight } from './volume';

/** Inclusive `[start, end]` calendar window. */
export interface DateWindow {
  start: string;
  end: string;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-based week containing `now`. */
export function weekWindow(now: Date = new Date(), offsetWeeks = 0): DateWindow {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { start: iso(start), end: iso(end) };
}

export function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

export function sessionsInWindow(
  sessions: WorkoutSession[],
  window: DateWindow,
): WorkoutSession[] {
  return completedSessions(sessions).filter((s) => inWindow(s.date, window));
}

export interface OverviewStats {
  workouts: number;
  totalVolume: number;
  totalSets: number;
  avgDurationSeconds: number;
  prCount: number;
  streak: number;
}

export function overviewStats(
  sessions: WorkoutSession[],
  window?: DateWindow,
  now: Date = new Date(),
): OverviewStats {
  const scope = window ? sessionsInWindow(sessions, window) : completedSessions(sessions);
  const totalVolume = scope.reduce((sum, s) => sum + sessionVolume(s), 0);
  const totalSets = scope.reduce((sum, s) => sum + sessionWorkingSetCount(s), 0);
  const withDuration = scope.filter((s) => s.durationSeconds > 0);
  const avg = withDuration.length
    ? withDuration.reduce((sum, s) => sum + s.durationSeconds, 0) / withDuration.length
    : 0;

  return {
    workouts: scope.length,
    totalVolume,
    totalSets,
    avgDurationSeconds: avg,
    prCount: countPRs(sessions, window),
    streak: workoutStreak(sessions, now),
  };
}

/**
 * PR count, walked forward in time so each record is only counted once, the
 * session it was actually set in. One per exercise per session: three
 * escalating sets in one workout are one new best, not three.
 */
export function countPRs(sessions: WorkoutSession[], window?: DateWindow): number {
  const chronological = completedSessions(sessions).slice().reverse();
  const best = new Map<ID, number>();
  let count = 0;

  for (const session of chronological) {
    const sessionBest = new Map<ID, number>();
    for (const entry of session.exercises) {
      for (const set of entry.sets) {
        if (!set.actual || set.setType === 'warmup') continue;
        const e1rm = estimated1RM(set.actual.weight, set.actual.reps);
        if (e1rm > (sessionBest.get(entry.exerciseId) ?? 0)) {
          sessionBest.set(entry.exerciseId, e1rm);
        }
      }
    }

    for (const [exerciseId, e1rm] of sessionBest) {
      const prior = best.get(exerciseId);
      if (prior === undefined) {
        // First time this exercise was ever trained: a baseline, not a record.
        best.set(exerciseId, e1rm);
        continue;
      }
      if (e1rm > prior) {
        best.set(exerciseId, e1rm);
        if (e1rm > prior + 0.01 && (!window || inWindow(session.date, window))) count += 1;
      }
    }
  }
  return count;
}

export interface MuscleGroupStat {
  muscle: MuscleGroup;
  workingSets: number;
  volume: number;
}

/**
 * Working sets per muscle group. Secondary muscles count as half a set, which
 * is the convention that keeps "back" from looking untrained on a row day.
 */
export function muscleGroupStats(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  window?: DateWindow,
): MuscleGroupStat[] {
  const library = new Map(exercises.map((e) => [e.id, e]));
  const scope = window ? sessionsInWindow(sessions, window) : completedSessions(sessions);
  const acc = new Map<MuscleGroup, MuscleGroupStat>();

  const bump = (muscle: MuscleGroup, sets: number, volume: number) => {
    const cur = acc.get(muscle) ?? { muscle, workingSets: 0, volume: 0 };
    cur.workingSets += sets;
    cur.volume += volume;
    acc.set(muscle, cur);
  };

  for (const session of scope) {
    for (const entry of session.exercises) {
      const sets = entry.sets.filter(isWorkingSet);
      if (!sets.length) continue;
      const volume = sets.reduce((v, s) => v + s.actual!.weight * s.actual!.reps, 0);
      bump(entry.primaryMuscle, sets.length, volume);
      const secondary = library.get(entry.exerciseId)?.secondaryMuscles ?? [];
      for (const muscle of secondary) bump(muscle, sets.length * 0.5, volume * 0.5);
    }
  }

  return [...acc.values()]
    .map((s) => ({ ...s, workingSets: Math.round(s.workingSets * 10) / 10 }))
    .sort((a, b) => b.workingSets - a.workingSets);
}

export interface VolumePoint {
  label: string;
  start: string;
  end: string;
  volume: number;
  workouts: number;
  sets: number;
}

/** Weekly volume series, oldest first — the Progress screen's main chart. */
export function weeklyVolumeSeries(
  sessions: WorkoutSession[],
  weeks = 8,
  now: Date = new Date(),
): VolumePoint[] {
  const out: VolumePoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const window = weekWindow(now, -i);
    const scope = sessionsInWindow(sessions, window);
    const d = new Date(window.start);
    out.push({
      label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      start: window.start,
      end: window.end,
      volume: scope.reduce((sum, s) => sum + sessionVolume(s), 0),
      workouts: scope.length,
      sets: scope.reduce((sum, s) => sum + sessionWorkingSetCount(s), 0),
    });
  }
  return out;
}

export interface Delta {
  current: number;
  previous: number;
  /** Percent change, `null` when there is no baseline to compare against. */
  percent: number | null;
}

export function delta(current: number, previous: number): Delta {
  if (previous <= 0) return { current, previous, percent: null };
  return { current, previous, percent: ((current - previous) / previous) * 100 };
}

export function weeklyVolumeDelta(sessions: WorkoutSession[], now: Date = new Date()): Delta {
  const thisWeek = sessionsInWindow(sessions, weekWindow(now, 0)).reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  const lastWeek = sessionsInWindow(sessions, weekWindow(now, -1)).reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  return delta(thisWeek, lastWeek);
}

/* ── Per-exercise progression series ───────────────────────────────── */

export type ProgressionMetric = 'weight' | 'reps' | 'volume' | 'performance';

export const METRIC_LABEL: Record<ProgressionMetric, string> = {
  weight: 'Вес',
  reps: 'Повторения',
  volume: 'Объём',
  performance: 'Результат',
};

export interface ProgressionPoint {
  date: string;
  label: string;
  value: number;
}

export function progressionSeries(
  sessions: WorkoutSession[],
  exerciseId: ID,
  metric: ProgressionMetric,
): ProgressionPoint[] {
  const history = exerciseHistory(sessions, exerciseId).slice().reverse();
  return history.map((h) => {
    const d = new Date(h.date);
    const label = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    let value = 0;
    switch (metric) {
      case 'weight':
        value = workingWeight(h.entry) ?? h.topWeight;
        break;
      case 'reps':
        value = h.totalReps;
        break;
      case 'volume':
        value = h.volume;
        break;
      case 'performance':
        value = Math.round(h.bestEstimated1RM * 10) / 10;
        break;
    }
    return { date: h.date, label, value };
  });
}

/** Change over the last N days, for the "+20% LAST 30 DAYS" line. */
export function progressionDelta(
  points: ProgressionPoint[],
  days = 30,
  now: Date = new Date(),
): Delta {
  if (!points.length) return { current: 0, previous: 0, percent: null };
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = iso(cutoff);

  const recent = points.filter((p) => p.date >= cutoffIso);
  const current = recent.length ? recent[recent.length - 1].value : points[points.length - 1].value;
  const before = points.filter((p) => p.date < cutoffIso);
  const previous = before.length ? before[before.length - 1].value : (recent[0]?.value ?? current);
  return delta(current, previous);
}

/* ── Records overview & body weight ────────────────────────────────── */

export function allPersonalRecords(sessions: WorkoutSession[], exercises: Exercise[]) {
  const trained = new Set<ID>();
  for (const session of completedSessions(sessions)) {
    for (const entry of session.exercises) {
      if (entry.sets.some((s) => s.actual)) trained.add(entry.exerciseId);
    }
  }
  return [...trained]
    .map((id) => {
      const name = exercises.find((e) => e.id === id)?.name ?? id;
      return personalRecords(sessions, id, name);
    })
    .sort((a, b) => (b.bestPerformance?.value ?? 0) - (a.bestPerformance?.value ?? 0));
}

export interface BodyWeightStats {
  latest: BodyWeightLog | null;
  change7d: number | null;
  change30d: number | null;
}

export function bodyWeightStats(logs: BodyWeightLog[], now: Date = new Date()): BodyWeightStats {
  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0] ?? null;
  if (!latest) return { latest: null, change7d: null, change30d: null };

  const at = (days: number) => {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const target = iso(cutoff);
    const found = sorted.find((l) => l.date <= target);
    return found ? Math.round((latest.weight - found.weight) * 10) / 10 : null;
  };

  return { latest, change7d: at(7), change30d: at(30) };
}
