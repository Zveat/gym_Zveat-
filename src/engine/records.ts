import type { ID, WorkoutSession } from '@/domain/types';
import { estimated1RM } from './volume';
import { exerciseHistory } from './history';

/** Personal records for one exercise. */
export interface PersonalRecords {
  exerciseId: ID;
  exerciseName: string;
  maxWeight: { value: number; reps: number; date: string } | null;
  maxReps: { value: number; weight: number; date: string } | null;
  maxSetVolume: { value: number; weight: number; reps: number; date: string } | null;
  bestPerformance: { value: number; weight: number; reps: number; date: string } | null;
  maxSessionVolume: { value: number; date: string } | null;
}

const EMPTY = (exerciseId: ID, exerciseName: string): PersonalRecords => ({
  exerciseId,
  exerciseName,
  maxWeight: null,
  maxReps: null,
  maxSetVolume: null,
  bestPerformance: null,
  maxSessionVolume: null,
});

/**
 * PRs are computed from history, never stored — so correcting a typo in a past
 * set immediately corrects the records too.
 */
export function personalRecords(
  sessions: WorkoutSession[],
  exerciseId: ID,
  exerciseName = '',
  options: { before?: string } = {},
): PersonalRecords {
  const records = EMPTY(exerciseId, exerciseName);
  const history = exerciseHistory(sessions, exerciseId).filter((h) =>
    options.before ? h.date < options.before : true,
  );

  for (const h of history) {
    if (records.maxSessionVolume === null || h.volume > records.maxSessionVolume.value) {
      records.maxSessionVolume = { value: h.volume, date: h.date };
    }
    for (const set of h.entry.sets) {
      if (!set.actual) continue;
      const { weight, reps } = set.actual;
      if (reps <= 0) continue;
      // Warm-ups can't be records.
      if (set.setType === 'warmup') continue;

      if (
        records.maxWeight === null ||
        weight > records.maxWeight.value ||
        (weight === records.maxWeight.value && reps > records.maxWeight.reps)
      ) {
        records.maxWeight = { value: weight, reps, date: h.date };
      }
      if (records.maxReps === null || reps > records.maxReps.value) {
        records.maxReps = { value: reps, weight, date: h.date };
      }
      const vol = weight * reps;
      if (records.maxSetVolume === null || vol > records.maxSetVolume.value) {
        records.maxSetVolume = { value: vol, weight, reps, date: h.date };
      }
      const e1rm = estimated1RM(weight, reps);
      if (records.bestPerformance === null || e1rm > records.bestPerformance.value) {
        records.bestPerformance = { value: e1rm, weight, reps, date: h.date };
      }
    }
  }
  return records;
}

export type PRKind = 'weight' | 'reps' | 'set_volume' | 'performance';

export interface DetectedPR {
  kind: PRKind;
  label: string;
  weight: number;
  reps: number;
  /** Previous best, for the "beat 55 kg" line. */
  previous: number | null;
}

/**
 * Did this set just beat history? Called the moment a set is completed, so the
 * PR animation fires in the gym rather than in a report later.
 *
 * `baseline` must be the records as of *before* the current session, which is
 * why the store snapshots them when a workout starts.
 */
export function detectPRs(
  baseline: PersonalRecords,
  set: { weight: number; reps: number; setType: string },
): DetectedPR[] {
  if (set.setType === 'warmup' || set.reps <= 0 || set.weight <= 0) return [];
  // Nothing in history means no record to beat — the first session is the
  // baseline, not six instant PRs.
  if (baseline.bestPerformance === null) return [];
  const found: DetectedPR[] = [];

  if (baseline.maxWeight === null || set.weight > baseline.maxWeight.value) {
    found.push({
      kind: 'weight',
      label: 'Максимальный вес',
      weight: set.weight,
      reps: set.reps,
      previous: baseline.maxWeight?.value ?? null,
    });
  }
  if (baseline.maxReps === null || set.reps > baseline.maxReps.value) {
    found.push({
      kind: 'reps',
      label: 'Максимум повторений',
      weight: set.weight,
      reps: set.reps,
      previous: baseline.maxReps?.value ?? null,
    });
  }
  const vol = set.weight * set.reps;
  if (baseline.maxSetVolume === null || vol > baseline.maxSetVolume.value) {
    found.push({
      kind: 'set_volume',
      label: 'Лучший подход',
      weight: set.weight,
      reps: set.reps,
      previous: baseline.maxSetVolume?.value ?? null,
    });
  }
  const e1rm = estimated1RM(set.weight, set.reps);
  if (baseline.bestPerformance === null || e1rm > baseline.bestPerformance.value + 0.01) {
    found.push({
      kind: 'performance',
      label: 'Лучший результат',
      weight: set.weight,
      reps: set.reps,
      previous: baseline.bestPerformance?.value ?? null,
    });
  }
  return found;
}

/** The headline PR to celebrate when a set beats several records at once. */
export function primaryPR(prs: DetectedPR[]): DetectedPR | null {
  const order: PRKind[] = ['weight', 'performance', 'reps', 'set_volume'];
  for (const kind of order) {
    const found = prs.find((pr) => pr.kind === kind);
    if (found) return found;
  }
  return null;
}

/**
 * How many exercises in this session set a new best. Counted per exercise, not
 * per set, so escalating sets inside one workout read as one record.
 */
export function sessionPRCount(sessions: WorkoutSession[], session: WorkoutSession): number {
  const past = sessions.filter((s) => s.id !== session.id);
  let count = 0;
  for (const entry of session.exercises) {
    const baseline = personalRecords(past, entry.exerciseId, entry.name, { before: session.date });
    const prior = baseline.bestPerformance?.value;
    if (prior === undefined) continue; // first time trained: baseline only
    const best = entry.sets.reduce((max, set) => {
      if (!set.actual || set.setType === 'warmup') return max;
      return Math.max(max, estimated1RM(set.actual.weight, set.actual.reps));
    }, 0);
    if (best > prior + 0.01) count += 1;
  }
  return count;
}
