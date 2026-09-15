import type {
  Exercise,
  ID,
  Program,
  ProgramExercise,
  ProgressionConfig,
  SessionExercise,
  WorkoutSession,
} from '@/domain/types';
import { roundToStep } from './format';
import { exerciseHistory } from './history';
import { isWorkingSet } from './volume';

/**
 * The progression engine answers one question after every workout:
 * "should the *plan* change?" — and never changes it on its own. It produces
 * recommendations the user accepts, edits or ignores (product rule 1 & 2:
 * history is immutable, the plan only moves deliberately).
 */

export type Verdict = 'increase' | 'hold' | 'decrease' | 'none';

export interface ProgressionRecommendation {
  exerciseEntryId: ID;
  exerciseId: ID;
  exerciseName: string;
  programExerciseId: ID | null;
  verdict: Verdict;
  /** Plain-language reason, shown under the recommendation. */
  reason: string;
  /** What the plan says now (the working weight). */
  currentWeight: number | null;
  /** What the engine suggests the plan should say next time. */
  suggestedWeight: number | null;
  /** The reps the user actually hit, for the review card. */
  performed: { weight: number; reps: number }[];
  repTarget: number | null;
  progressionType: ProgressionConfig['type'];
}

function workingSets(entry: SessionExercise) {
  return entry.sets.filter((set) => isWorkingSet(set) && set.setType !== 'failure' && set.setType !== 'burnout' && set.setType !== 'drop_set');
}

/** The weight the plan prescribed for the bulk of the working sets. */
function plannedWorkingWeight(entry: SessionExercise): number | null {
  const weights = workingSets(entry)
    .map((set) => set.plan.weight)
    .filter((w): w is number => w !== null);
  if (!weights.length) return null;
  const tally = new Map<number, number>();
  weights.forEach((w) => tally.set(w, (tally.get(w) ?? 0) + 1));
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export interface RecommendOptions {
  entry: SessionExercise;
  programExercise?: ProgramExercise | null;
  exercise?: Exercise | null;
  /** Past sessions, excluding the one being reviewed. */
  sessions: WorkoutSession[];
  roundStep?: number;
}

export function recommendForExercise(options: RecommendOptions): ProgressionRecommendation {
  const { entry, programExercise, exercise, sessions, roundStep = 0.5 } = options;
  const config: ProgressionConfig = programExercise?.progression ?? { type: 'manual' };
  const increment = config.increment ?? exercise?.increment ?? 2.5;
  const sets = workingSets(entry).filter((s) => s.actual);
  const performed = sets.map((s) => ({ weight: s.actual!.weight, reps: s.actual!.reps }));
  const currentWeight = plannedWorkingWeight(entry);

  const base: ProgressionRecommendation = {
    exerciseEntryId: entry.id,
    exerciseId: entry.exerciseId,
    exerciseName: entry.name,
    programExerciseId: entry.programExerciseId,
    verdict: 'none',
    reason: '',
    currentWeight,
    suggestedWeight: null,
    performed,
    repTarget: config.repTarget ?? null,
    progressionType: config.type,
  };

  if (!sets.length) {
    return { ...base, verdict: 'none', reason: 'Упражнение не выполнялось.' };
  }

  // Anything that hurt or broke down outranks the numbers.
  if (entry.observations.includes('pain')) {
    return {
      ...base,
      verdict: 'decrease',
      reason: 'Отмечена боль — вес не поднимаем.',
      suggestedWeight:
        currentWeight === null ? null : roundToStep(Math.max(0, currentWeight - increment), roundStep),
    };
  }
  if (entry.observations.includes('bad_technique') || entry.observations.includes('form_breakdown')) {
    return { ...base, verdict: 'hold', reason: 'Техника ломалась — закрепляем текущий вес.' };
  }

  switch (config.type) {
    case 'double':
      return doubleProgression(base, { config, increment, sets, roundStep, currentWeight });
    case 'fixed':
      return {
        ...base,
        verdict: 'increase',
        reason: `Линейная прогрессия: +${increment} кг каждую тренировку.`,
        suggestedWeight:
          currentWeight === null ? null : roundToStep(currentWeight + increment, roundStep),
      };
    case 'custom':
      return customProgression(base, { config, increment, sets, roundStep, currentWeight, sessions, entry });
    case 'manual':
    default:
      return manualHint(base, { increment, sets, roundStep, currentWeight });
  }
}

interface RuleContext {
  config: ProgressionConfig;
  increment: number;
  sets: SessionExercise['sets'];
  roundStep: number;
  currentWeight: number | null;
  sessions?: WorkoutSession[];
  entry?: SessionExercise;
}

function doubleProgression(
  base: ProgressionRecommendation,
  ctx: RuleContext,
): ProgressionRecommendation {
  const { config, increment, sets, roundStep, currentWeight } = ctx;
  const target = config.repTarget ?? Math.max(...sets.map((s) => s.plan.repsMax ?? 12));
  const reps = sets.map((s) => s.actual!.reps);
  const allHit = reps.every((r) => r >= target);
  const minReps = Math.min(...reps);
  const lowFloor = Math.max(1, Math.round(target * 0.6));

  if (allHit) {
    return {
      ...base,
      verdict: 'increase',
      repTarget: target,
      reason: `Цель закрыта: ${target} повторений во всех подходах.`,
      suggestedWeight:
        currentWeight === null ? null : roundToStep(currentWeight + increment, roundStep),
    };
  }
  if (minReps < lowFloor) {
    return {
      ...base,
      verdict: 'decrease',
      repTarget: target,
      reason: `Просадка: минимум ${minReps} из ${target}. Стоит снизить вес.`,
      suggestedWeight:
        currentWeight === null ? null : roundToStep(Math.max(0, currentWeight - increment), roundStep),
    };
  }
  const missing = reps.filter((r) => r < target).length;
  return {
    ...base,
    verdict: 'hold',
    repTarget: target,
    reason: `Ещё ${missing} ${missing === 1 ? 'подход' : 'подхода'} не дотянули до ${target}. Держим вес.`,
    suggestedWeight: currentWeight,
  };
}

function customProgression(
  base: ProgressionRecommendation,
  ctx: RuleContext,
): ProgressionRecommendation {
  const { config, increment, sets, roundStep, currentWeight, sessions = [], entry } = ctx;
  const target = config.repTarget ?? Math.max(...sets.map((s) => s.plan.repsMax ?? 12));
  const need = Math.max(1, config.consecutiveSessions ?? 2);
  const reps = sets.map((s) => s.actual!.reps);
  const hitNow = reps.every((r) => r >= target);

  if (!hitNow) {
    return {
      ...base,
      verdict: 'hold',
      repTarget: target,
      reason: config.note
        ? `Правило: ${config.note}`
        : `Нужно ${target} во всех подходах ${need} ${need === 1 ? 'тренировку' : 'тренировки'} подряд.`,
      suggestedWeight: currentWeight,
    };
  }

  // Count how many previous sessions in a row also hit the target.
  let streak = 1;
  if (entry) {
    const history = exerciseHistory(sessions, entry.exerciseId);
    for (const h of history) {
      const hSets = workingSets(h.entry).filter((s) => s.actual);
      if (!hSets.length) break;
      if (hSets.every((s) => s.actual!.reps >= target)) streak += 1;
      else break;
    }
  }

  if (streak >= need) {
    return {
      ...base,
      verdict: 'increase',
      repTarget: target,
      reason: `Цель закрыта ${streak} ${streak === 1 ? 'тренировку' : 'тренировки'} подряд.`,
      suggestedWeight:
        currentWeight === null ? null : roundToStep(currentWeight + increment, roundStep),
    };
  }
  return {
    ...base,
    verdict: 'hold',
    repTarget: target,
    reason: `Закрыто ${streak} из ${need} тренировок подряд.`,
    suggestedWeight: currentWeight,
  };
}

/**
 * Manual exercises get no automatic rule, but silence is unhelpful: if every
 * set was called EASY, say so.
 */
function manualHint(
  base: ProgressionRecommendation,
  ctx: RuleContext,
): ProgressionRecommendation {
  const { increment, sets, roundStep, currentWeight } = ctx;
  const done = sets.filter((s) => s.actual);
  const allEasy = done.length > 0 && done.every((s) => s.actual!.difficulty === 'easy');
  const allAtTop = done.every((s) => s.actual!.reps >= (s.plan.repsMax ?? Infinity));

  if (allEasy && allAtTop) {
    return {
      ...base,
      verdict: 'increase',
      reason: 'Все подходы отмечены как легкие и план закрыт.',
      suggestedWeight:
        currentWeight === null ? null : roundToStep(currentWeight + increment, roundStep),
    };
  }
  return { ...base, verdict: 'none', reason: 'Ручное управление весом.' };
}

/** Recommendations for a whole finished session, ordered for review. */
export function reviewSession(
  session: WorkoutSession,
  programs: Program[],
  exercises: Exercise[],
  allSessions: WorkoutSession[],
  roundStep = 0.5,
): ProgressionRecommendation[] {
  const program = programs.find((p) => p.id === session.programId) ?? null;
  const programExercises = new Map<ID, ProgramExercise>();
  program?.days.forEach((day) =>
    day.exercises.forEach((pe) => programExercises.set(pe.id, pe)),
  );
  const library = new Map(exercises.map((e) => [e.id, e]));
  const past = allSessions.filter((s) => s.id !== session.id);

  const order: Record<Verdict, number> = { increase: 0, decrease: 1, hold: 2, none: 3 };

  return session.exercises
    .map((entry) =>
      recommendForExercise({
        entry,
        programExercise: entry.programExerciseId
          ? (programExercises.get(entry.programExerciseId) ?? null)
          : null,
        exercise: library.get(entry.exerciseId) ?? null,
        sessions: past,
        roundStep,
      }),
    )
    .filter((rec) => rec.verdict !== 'none')
    .sort((a, b) => order[a.verdict] - order[b.verdict]);
}

/**
 * Accepting a recommendation rewrites the *plan* only: every working set at the
 * old working weight moves to the new one. Top sets keep their offset so a
 * 50/50/50/60 shape stays a shape.
 */
export function applyRecommendation(
  program: Program,
  programExerciseId: ID,
  newWeight: number,
  updatedAt: string,
): Program {
  let changed = false;
  const days = program.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((pe) => {
      if (pe.id !== programExerciseId) return pe;
      const weights = pe.sets
        .filter((s) => s.setType === 'normal')
        .map((s) => s.targetWeight)
        .filter((w): w is number => w !== null);
      if (!weights.length) return pe;
      const baseWeight = Math.min(...weights);
      const delta = newWeight - baseWeight;
      if (delta === 0) return pe;
      changed = true;
      return {
        ...pe,
        sets: pe.sets.map((set) =>
          set.targetWeight === null || set.setType === 'warmup'
            ? set
            : { ...set, targetWeight: Math.max(0, set.targetWeight + delta) },
        ),
      };
    }),
  }));
  return changed ? { ...program, days, updatedAt } : program;
}
