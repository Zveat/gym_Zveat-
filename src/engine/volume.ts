import type { SessionExercise, SessionSet, WorkoutSession } from '@/domain/types';

/** Only completed sets count. Bodyweight sets add reps, not tonnage. */
export function setVolume(set: SessionSet): number {
  if (!set.actual) return 0;
  return (set.actual.weight || 0) * (set.actual.reps || 0);
}

export function exerciseVolume(exercise: SessionExercise): number {
  return exercise.sets.reduce((sum, set) => sum + setVolume(set), 0);
}

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + exerciseVolume(ex), 0);
}

export function completedSets(exercise: SessionExercise): SessionSet[] {
  return exercise.sets.filter((s) => s.actual !== null);
}

/**
 * "Working sets" for analytics: completed sets that count as real stimulus.
 * Warm-ups do not; failure/burnout/drop sets do.
 */
export function isWorkingSet(set: SessionSet): boolean {
  return set.actual !== null && set.setType !== 'warmup';
}

export function sessionWorkingSetCount(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter(isWorkingSet).length,
    0,
  );
}

export function plannedSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
}

export function sessionCompletedSetCount(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + completedSets(ex).length, 0);
}

export function sessionRepCount(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((r, s) => r + (s.actual?.reps ?? 0), 0),
    0,
  );
}

/** Epley estimate — used for "best performance" so 60×8 can beat 50×12. */
export function estimated1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** The heaviest weight actually lifted in an exercise entry. */
export function topWeight(exercise: SessionExercise): number {
  return completedSets(exercise).reduce((max, s) => Math.max(max, s.actual!.weight), 0);
}

/**
 * The weight the user would call "the working weight": the most common weight
 * across working sets, breaking ties toward the heavier one. This is what the
 * progression chart plots, because a single top set should not read as a jump.
 */
export function workingWeight(exercise: SessionExercise): number | null {
  const sets = exercise.sets.filter(isWorkingSet);
  if (!sets.length) return null;
  const tally = new Map<number, number>();
  for (const set of sets) {
    const w = set.actual!.weight;
    tally.set(w, (tally.get(w) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [weight, count] of tally) {
    if (count > bestCount || (count === bestCount && best !== null && weight > best)) {
      best = weight;
      bestCount = count;
    }
  }
  return best;
}
