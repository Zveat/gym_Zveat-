'use client';

import { useMemo } from 'react';
import type { Exercise, ID, PainLog, Program, WorkoutDay, WorkoutSession } from '@/domain/types';
import { activeSession, completedSessions, suggestNextDay } from '@/engine/history';
import { useStore } from './useStore';

/** Derived reads used by more than one screen. */

export function useActiveProgram(): Program | null {
  const programs = useStore((s) => s.programs);
  const activeProgramId = useStore((s) => s.settings.activeProgramId);
  return useMemo(
    () =>
      programs.find((p) => p.id === activeProgramId) ??
      programs.find((p) => p.status === 'active') ??
      null,
    [programs, activeProgramId],
  );
}

export function useProgram(id: ID | null | undefined): Program | null {
  const programs = useStore((s) => s.programs);
  return useMemo(() => (id ? (programs.find((p) => p.id === id) ?? null) : null), [programs, id]);
}

export function useActiveSession(): WorkoutSession | null {
  const sessions = useStore((s) => s.sessions);
  return useMemo(() => activeSession(sessions), [sessions]);
}

/** History, newest first. Excludes any workout in progress. */
export function useHistory(): WorkoutSession[] {
  const sessions = useStore((s) => s.sessions);
  return useMemo(() => completedSessions(sessions), [sessions]);
}

export function useExerciseMap(): Map<ID, Exercise> {
  const exercises = useStore((s) => s.exercises);
  return useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
}

export function useExercise(id: ID | null | undefined): Exercise | null {
  const map = useExerciseMap();
  return id ? (map.get(id) ?? null) : null;
}

/** The program day to offer on Home: the one trained longest ago. */
export function useSuggestedDay(program: Program | null): WorkoutDay | null {
  const history = useHistory();
  return useMemo(() => {
    if (!program || !program.days.length) return null;
    const ordered = [...program.days].sort((a, b) => a.sortOrder - b.sortOrder);
    const id = suggestNextDay(history, ordered.map((d) => d.id));
    return ordered.find((d) => d.id === id) ?? ordered[0];
  }, [program, history]);
}

/** Unresolved pain entries, most severe first — surfaced before a workout. */
export function useActivePain(): PainLog[] {
  const painLogs = useStore((s) => s.painLogs);
  return useMemo(
    () =>
      painLogs
        .filter((l) => !l.resolvedAt)
        .sort((a, b) => b.date.localeCompare(a.date) || b.severity - a.severity),
    [painLogs],
  );
}

export function useExerciseNotes(exerciseId: ID | null | undefined) {
  const notes = useStore((s) => s.notes);
  return useMemo(() => {
    if (!exerciseId) return { pinned: [], permanent: [], observations: [] };
    const mine = notes
      .filter((n) => n.exerciseId === exerciseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      pinned: mine.filter((n) => n.type === 'pinned'),
      permanent: mine.filter((n) => n.type === 'permanent'),
      observations: mine.filter((n) => n.type === 'observation'),
    };
  }, [notes, exerciseId]);
}

/** Counts shown on a program card. */
export function programSummary(program: Program) {
  const days = program.days.length;
  let exercises = 0;
  let sets = 0;
  for (const day of program.days) {
    for (const pe of day.exercises) {
      if (!pe.isEnabled) continue;
      exercises += 1;
      sets += pe.sets.filter((s) => s.setType !== 'warmup').length;
    }
  }
  return { days, exercises, sets };
}

export function daySummary(day: WorkoutDay) {
  const exercises = day.exercises.filter((e) => e.isEnabled);
  const sets = exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.setType !== 'warmup').length,
    0,
  );
  return { exercises: exercises.length, sets };
}
