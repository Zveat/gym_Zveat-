import type {
  ID,
  SessionExercise,
  WorkoutMode,
  WorkoutSession,
} from '@/domain/types';
import { estimated1RM, exerciseVolume, isWorkingSet, topWeight, workingWeight } from './volume';

/** One past performance of one exercise — the unit every history view uses. */
export interface ExerciseHistoryEntry {
  sessionId: ID;
  date: string;
  mode: WorkoutMode;
  programName: string;
  programId: ID | null;
  workoutDayName: string;
  entry: SessionExercise;
  volume: number;
  topWeight: number;
  workingWeight: number | null;
  totalReps: number;
  bestEstimated1RM: number;
  workingSetCount: number;
}

export type HistoryRange = 'all' | '1m' | '3m' | '6m' | '1y';

export const HISTORY_RANGE_LABEL: Record<HistoryRange, string> = {
  all: 'Всё время',
  '1m': 'Месяц',
  '3m': '3 месяца',
  '6m': 'Полгода',
  '1y': 'Год',
};

function rangeStart(range: HistoryRange, now: Date): Date | null {
  if (range === 'all') return null;
  const d = new Date(now);
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range];
  d.setMonth(d.getMonth() - months);
  return d;
}

export interface HistoryFilter {
  range?: HistoryRange;
  /** Restrict to one program (e.g. "current program only"). */
  programId?: ID | null;
  now?: Date;
}

/** Completed sessions, newest first — the canonical ordering everywhere. */
export function completedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions
    .filter((s) => s.status === 'completed')
    .slice()
    .sort((a, b) => (a.date === b.date ? b.startedAt.localeCompare(a.startedAt) : b.date.localeCompare(a.date)));
}

export function activeSession(sessions: WorkoutSession[]): WorkoutSession | null {
  return sessions.find((s) => s.status === 'active') ?? null;
}

/** Every time this exercise was performed, newest first. */
export function exerciseHistory(
  sessions: WorkoutSession[],
  exerciseId: ID,
  filter: HistoryFilter = {},
): ExerciseHistoryEntry[] {
  const { range = 'all', programId = null, now = new Date() } = filter;
  const start = rangeStart(range, now);

  const out: ExerciseHistoryEntry[] = [];
  for (const session of completedSessions(sessions)) {
    if (programId && session.programId !== programId) continue;
    if (start && new Date(session.date) < start) continue;
    for (const entry of session.exercises) {
      if (entry.exerciseId !== exerciseId) continue;
      const done = entry.sets.filter((s) => s.actual !== null);
      if (!done.length) continue;
      out.push({
        sessionId: session.id,
        date: session.date,
        mode: session.mode,
        programName: session.programName,
        programId: session.programId,
        workoutDayName: session.workoutDayName,
        entry,
        volume: exerciseVolume(entry),
        topWeight: topWeight(entry),
        workingWeight: workingWeight(entry),
        totalReps: done.reduce((n, s) => n + s.actual!.reps, 0),
        bestEstimated1RM: done.reduce(
          (max, s) => Math.max(max, estimated1RM(s.actual!.weight, s.actual!.reps)),
          0,
        ),
        workingSetCount: entry.sets.filter(isWorkingSet).length,
      });
    }
  }
  return out;
}

/** The "LAST TIME" block on the exercise screen. */
export function lastPerformance(
  sessions: WorkoutSession[],
  exerciseId: ID,
  excludeSessionId?: ID,
): ExerciseHistoryEntry | null {
  const history = exerciseHistory(sessions, exerciseId);
  const found = history.find((h) => h.sessionId !== excludeSessionId);
  return found ?? null;
}

/** How many distinct days this exercise was trained. */
export function exerciseFrequency(sessions: WorkoutSession[], exerciseId: ID): number {
  return new Set(exerciseHistory(sessions, exerciseId).map((h) => h.date)).size;
}

/** Consecutive-day-gap streak of workouts, counting back from today. */
export function workoutStreak(sessions: WorkoutSession[], now: Date = new Date()): number {
  const dates = Array.from(new Set(completedSessions(sessions).map((s) => s.date))).sort().reverse();
  if (!dates.length) return 0;

  const dayMs = 86_400_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const first = new Date(dates[0]).getTime();
  // A streak survives up to three rest days — the gap people actually take.
  if (Math.round((startOfToday - first) / dayMs) > 3) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = Math.round(
      (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / dayMs,
    );
    if (gap <= 3) streak += 1;
    else break;
  }
  return streak;
}

/** Which day of the program comes next — the one trained longest ago. */
export function suggestNextDay(
  sessions: WorkoutSession[],
  dayIds: ID[],
): ID | null {
  if (!dayIds.length) return null;
  const done = completedSessions(sessions).filter((s) => s.workoutDayId);
  const lastIndex = new Map<ID, number>();
  done.forEach((session, i) => {
    if (session.workoutDayId && !lastIndex.has(session.workoutDayId)) {
      lastIndex.set(session.workoutDayId, i);
    }
  });

  const untrained = dayIds.find((id) => !lastIndex.has(id));
  if (untrained && lastIndex.size) {
    // Prefer following the program order after the most recent day.
    const mostRecent = done[0]?.workoutDayId ?? null;
    const pos = mostRecent ? dayIds.indexOf(mostRecent) : -1;
    if (pos >= 0) return dayIds[(pos + 1) % dayIds.length];
    return untrained;
  }
  if (!lastIndex.size) return dayIds[0];

  const mostRecent = done[0]?.workoutDayId ?? null;
  const pos = mostRecent ? dayIds.indexOf(mostRecent) : -1;
  if (pos >= 0) return dayIds[(pos + 1) % dayIds.length];
  return dayIds[0];
}
