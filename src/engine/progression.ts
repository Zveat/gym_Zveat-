import type {
  Difficulty,
  Exercise,
  ID,
  ModeConfig,
  Program,
  ProgramExercise,
  ProgressionConfig,
  SessionExercise,
  WorkoutSession,
} from '@/domain/types';
import { FAILURE_SET_TYPES, isEasierThanPlan } from '@/domain/modes';
import { roundToStep } from './format';
import { applySetCount } from './session';
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

/**
 * РАБОЧИЙ ВЕС ИЗ ПРОГРАММЫ, а не из плана на сегодня.
 *
 * Это тот же минимум по рабочим подходам, от которого считает
 * `applyRecommendation`, — и в этом весь смысл: рекомендация обязана быть
 * выражена в тех же единицах, в которых её потом применят. Иначе «ПРИНЯТЬ»
 * под зелёной надписью «можно прибавить» меняет программу не туда.
 */
function programWorkingWeight(programExercise: ProgramExercise): number | null {
  const weights = programExercise.sets
    .filter((set) => set.setType === 'normal')
    .map((set) => set.targetWeight)
    .filter((w): w is number => w !== null);
  return weights.length ? Math.min(...weights) : null;
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
  /**
   * Режим тренировки, чтобы посчитать ЗАПЛАНИРОВАННОЕ число подходов.
   *
   * Из самой сессии его не вычислить: `finishSession` выбрасывает подходы,
   * которых не было, поэтому после завершения «сделал 1 из 4» и «в плане был
   * 1» выглядят одинаково. План берём из программы и правим множителем
   * режима — тем же, что при запуске тренировки.
   */
  modeSnapshot?: ModeConfig | null;
}

export function recommendForExercise(options: RecommendOptions): ProgressionRecommendation {
  const {
    entry,
    programExercise,
    exercise,
    sessions,
    roundStep = 0.5,
    modeSnapshot = null,
  } = options;
  const config: ProgressionConfig = programExercise?.progression ?? { type: 'manual' };
  const increment = config.increment ?? exercise?.increment ?? 2.5;
  const allWorking = workingSets(entry);
  const sets = allWorking.filter((s) => s.actual);

  /*
   * Считаем ТЕ ЖЕ подходы, что считает `workingSets` у сделанного: без
   * разминочных и без отказных/дропов. Раньше отказной подход попадал в план,
   * но выбрасывался из сделанного, и приложение обвиняло владельца в
   * невыполненном подходе, которого само же не просило: «Сделано 4 из 5
   * подходов — 1 не выполнено» на тяге с канатом, где пятый подход отказной.
   * В «Легкой» это ещё и накладывалось на `disableFailureSets`.
   */
  const fromProgram = programExercise
    ? programExercise.sets.filter(
        (set) => set.setType !== 'warmup' && !FAILURE_SET_TYPES.has(set.setType),
      ).length
    : 0;
  // Упражнение, добавленное на ходу, плана не имеет — тогда сделанное и есть
  // план, и правило работает как раньше.
  const plannedCount = fromProgram
    ? modeSnapshot
      ? applySetCount(fromProgram, modeSnapshot)
      : fromProgram
    : allWorking.length;
  const performed = sets.map((s) => ({ weight: s.actual!.weight, reps: s.actual!.reps }));
  /*
   * ВЕС БЕРЁТСЯ ИЗ ПРОГРАММЫ, А НЕ ИЗ ПЛАНА НА СЕГОДНЯ.
   *
   * План на сегодня уже умножен на режим: в «Легкой» жим 50 кг превращается в
   * 42,5. Рекомендация же применяется к ПРОГРАММЕ, поэтому «42,5 + 2,5 = 45»
   * записывалось в программу как 45 — то есть удачный лёгкий день СНИЖАЛ план
   * на 5 кг под зелёной надписью «можно прибавить». В «Тяжелой» тот же расчёт
   * работал наоборот и завышал программу на 5% просто так. Для упражнения,
   * добавленного на ходу, программы нет — тогда план дня и есть вся правда.
   */
  const currentWeight = programExercise
    ? (programWorkingWeight(programExercise) ?? plannedWorkingWeight(entry))
    : plannedWorkingWeight(entry);

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

  const verdict = ((): ProgressionRecommendation => {
    switch (config.type) {
      case 'double':
        return doubleProgression(base, {
          config,
          increment,
          sets,
          roundStep,
          currentWeight,
          planned: plannedCount,
          repsDelta: modeSnapshot?.repsDelta ?? 0,
        });
      case 'fixed':
        return {
          ...base,
          verdict: 'increase',
          reason: `Линейная прогрессия: +${increment} кг каждую тренировку.`,
          suggestedWeight:
            currentWeight === null ? null : roundToStep(currentWeight + increment, roundStep),
        };
      case 'custom':
        return customProgression(base, {
          config,
          increment,
          sets,
          roundStep,
          currentWeight,
          sessions,
          entry,
        });
      case 'manual':
      default:
        return manualHint(base, { increment, sets, roundStep, currentWeight });
    }
  })();

  /*
   * ЛЁГКИЙ ДЕНЬ НЕ СУДИТ ПЛАН.
   *
   * «Зачем то предлагает корректировать тренировку хотя я выбрал режим
   * легкая» — и он прав. В «Легкой» вес снижен до 85%, один подход убран,
   * отказные выключены; закрыть 12 повторений на таком дне ОЖИДАЕМО, это и
   * есть смысл режима. Победой это не является, и поднимать по нему план
   * нельзя. Держать тоже незачем: план никто не трогал, «держим вес» здесь —
   * пустая карточка, требующая решения на ровном месте.
   *
   * Остаётся только снижение: боль и настоящая просадка на 85% — сигнал,
   * который не зависит от режима, и его глушить нельзя.
   */
  if (modeSnapshot && isEasierThanPlan(modeSnapshot) && verdict.verdict !== 'decrease') {
    return {
      ...verdict,
      verdict: 'none',
      suggestedWeight: null,
      reason: `Режим «${modeSnapshot.label}» — день был легче плана. По нему план не меняем.`,
    };
  }

  return verdict;
}

interface RuleContext {
  config?: ProgressionConfig;
  increment: number;
  sets: SessionExercise['sets'];
  roundStep: number;
  currentWeight: number | null;
  /** Сколько рабочих подходов было ЗАПЛАНИРОВАНО, а не сделано. */
  planned?: number;
  /** Сдвиг диапазона повторений у режима: в «Тяжелой» план просит на 2 меньше. */
  repsDelta?: number;
  sessions?: WorkoutSession[];
  entry?: SessionExercise;
}

function doubleProgression(
  base: ProgressionRecommendation,
  ctx: RuleContext,
): ProgressionRecommendation {
  const {
    config,
    increment,
    sets,
    roundStep,
    currentWeight,
    planned = sets.length,
    repsDelta = 0,
  } = ctx;
  /*
   * Цель по повторениям — та, что стояла в плане НА СЕГОДНЯ.
   *
   * `repTarget` живёт в программе и режимом не двигался, а план подходов —
   * двигался: в «Тяжелой» он просит 10 вместо 12. Выходило, что человек делал
   * ровно то, что написано, и читал «Ещё 4 подхода не дотянули до 12».
   * Считать по `plan.repsMax` нельзя без оговорки: там сдвиг уже применён,
   * поэтому сдвигаем только явный `repTarget`.
   */
  const target =
    config?.repTarget != null
      ? Math.max(1, config.repTarget + repsDelta)
      : Math.max(...sets.map((s) => s.plan.repsMax ?? 12));
  const reps = sets.map((s) => s.actual!.reps);
  const allHit = reps.every((r) => r >= target);
  const minReps = Math.min(...reps);
  const lowFloor = Math.max(1, Math.round(target * 0.6));

  /*
   * ПРИБАВЛЯТЬ МОЖНО ТОЛЬКО ЗА ПОЛНЫЙ ОБЪЁМ.
   *
   * Правило смотрело лишь на ВЫПОЛНЕННЫЕ подходы, поэтому один подход из
   * четырёх давал «цель закрыта во всех подходах» и предлагал +2.5 кг:
   * условие «все сделанные дотянули» при одном подходе выполняется само
   * собой. Подъём гантелей в стороны так и вышел — 7.5 кг, один подход,
   * «можно прибавить». Недоделанный объём — это не повод добавлять вес.
   */
  if (sets.length < planned) {
    const missing = planned - sets.length;
    return {
      ...base,
      verdict: 'hold',
      repTarget: target,
      reason: `Сделано ${sets.length} из ${planned} подходов — ${missing} не выполнено. Вес не меняем.`,
      suggestedWeight: currentWeight,
    };
  }

  if (allHit) {
    /*
     * Отказ или «тяжело» в последнем подходе перебивает закрытые повторения.
     * Закрыть 12 на пределе и получить сверху +2.5 кг — это way к травме, а
     * не прогрессия. Если тяжесть не отмечена (null), правило работает как
     * раньше: судить не по чему.
     */
    const topEffort = sets
      .map((set) => set.actual!.difficulty)
      .filter((d): d is Difficulty => d !== null);
    const maximal = topEffort.some((d) => d === 'failure' || d === 'hard');

    if (maximal) {
      const label = topEffort.includes('failure') ? 'отказ' : 'тяжело';
      return {
        ...base,
        verdict: 'hold',
        repTarget: target,
        reason: `Цель закрыта, но подход отмечен как «${label}». Закрепляем вес.`,
        suggestedWeight: currentWeight,
      };
    }

    return {
      ...base,
      verdict: 'increase',
      repTarget: target,
      reason: `Цель закрыта: ${target} повторений во всех ${planned} подходах.`,
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
  const target = config?.repTarget ?? Math.max(...sets.map((s) => s.plan.repsMax ?? 12));
  const need = Math.max(1, config?.consecutiveSessions ?? 2);
  const reps = sets.map((s) => s.actual!.reps);
  const hitNow = reps.every((r) => r >= target);

  if (!hitNow) {
    return {
      ...base,
      verdict: 'hold',
      repTarget: target,
      reason: config?.note
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
        modeSnapshot: session.modeSnapshot,
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
