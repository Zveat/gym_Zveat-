import { newId, nowStamp, todayString } from '@/domain/ids';
import { FAILURE_SET_TYPES } from '@/domain/modes';
import type {
  Difficulty,
  Exercise,
  ID,
  ModeConfig,
  Program,
  ProgramExercise,
  SessionExercise,
  SessionCardio,
  SessionSet,
  SessionSetPlan,
  WorkoutDay,
  WorkoutMode,
  WorkoutSession,
} from '@/domain/types';
import { DIFFICULTY_META, roundToStep } from './format';

/**
 * The workout engine: turns a program day + a mode into a live session, then
 * records what actually happened. Everything here is pure — the store just
 * swaps in the value it returns, which is what makes set saves instant.
 */

export interface BuildSessionOptions {
  program: Program;
  day: WorkoutDay;
  mode: WorkoutMode;
  modeConfig: ModeConfig;
  exercises: Exercise[];
  /** Plate/pin granularity for mode-adjusted weights. */
  roundStep?: number;
  date?: string;
  startedAt?: string;
  isImported?: boolean;
}

/** How many sets survive the mode's sets modifiers. */
export function applySetCount(planned: number, mode: ModeConfig): number {
  const scaled = Math.round(planned * (mode.setsMultiplier ?? 1)) + (mode.setsDelta ?? 0);
  return Math.max(1, Math.min(planned, scaled));
}

export function applyModeWeight(
  weight: number | null,
  mode: ModeConfig,
  roundStep = 0.5,
): number | null {
  if (weight === null) return null;
  if (mode.weightMultiplier === 1) return weight;
  return roundToStep(weight * mode.weightMultiplier, roundStep);
}

/** The plan a single program exercise becomes under a mode. */
export function planExerciseSets(
  programExercise: ProgramExercise,
  mode: ModeConfig,
  roundStep = 0.5,
): { plan: SessionSetPlan; setType: SessionSet['setType']; note?: string }[] {
  const source = mode.disableFailureSets
    ? programExercise.sets.filter((set) => !FAILURE_SET_TYPES.has(set.setType))
    : programExercise.sets;

  const working = source.filter((set) => set.setType !== 'warmup');
  const keep = applySetCount(working.length, mode);
  // Trim from the end: the last sets are the heaviest/hardest ones.
  const kept = new Set(working.slice(0, keep).map((set) => set.id));

  return source
    .filter((set) => set.setType === 'warmup' || kept.has(set.id))
    .map((set) => ({
      setType: set.setType,
      note: set.note,
      plan: {
        weight: applyModeWeight(set.targetWeight, mode, roundStep),
        repsMin: shiftReps(set.targetRepsMin, mode.repsDelta),
        repsMax: shiftReps(set.targetRepsMax, mode.repsDelta),
      },
    }));
}

function shiftReps(reps: number | null, delta: number): number | null {
  if (reps === null) return null;
  if (!delta) return reps;
  return Math.max(1, reps + delta);
}

export function buildSession(options: BuildSessionOptions): WorkoutSession {
  const {
    program,
    day,
    mode,
    modeConfig,
    exercises,
    roundStep = 0.5,
    date = todayString(),
    startedAt = nowStamp(),
    isImported = false,
  } = options;

  const byId = new Map(exercises.map((e) => [e.id, e]));

  const sessionExercises: SessionExercise[] = day.exercises
    .filter((pe) => pe.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((pe, index) => {
      const library = byId.get(pe.exerciseId);
      const sets = planExerciseSets(pe, modeConfig, roundStep).map((spec, i) => ({
        id: newId('sset'),
        setNumber: i + 1,
        setType: spec.setType,
        note: spec.note,
        plan: spec.plan,
        actual: null,
      }));

      return {
        id: newId('sex'),
        exerciseId: pe.exerciseId,
        programExerciseId: pe.id,
        name: library?.name ?? 'Упражнение',
        primaryMuscle: library?.primaryMuscle ?? 'other',
        section: pe.section,
        sortOrder: index,
        restSeconds: pe.restSeconds,
        instructions: pe.instructions.length ? pe.instructions : (library?.keyPoints ?? []),
        observations: [],
        status: 'pending' as const,
        sets,
      };
    });

  return {
    id: newId('sess'),
    programId: program.id,
    programName: program.name,
    workoutDayId: day.id,
    workoutDayName: day.name,
    workoutDayTitle: day.title,
    date,
    startedAt,
    completedAt: null,
    durationSeconds: 0,
    mode,
    modeSnapshot: modeConfig,
    status: 'active',
    isImported,
    // Снимок так же, как у подходов: правка разминки в программе не должна
    // менять то, что человек уже прошёл в этой тренировке.
    ...(day.warmup ? { warmup: { plan: { ...day.warmup }, actual: null } } : {}),
    ...(day.cooldown ? { cooldown: { plan: { ...day.cooldown }, actual: null } } : {}),
    exercises: sessionExercises,
  };
}

/* ── Правка прошедшей тренировки ────────────────────────────────────── */

/**
 * ДОБАВИТЬ УПРАЖНЕНИЕ В ЗАПИСАННУЮ ТРЕНИРОВКУ.
 *
 * Отдельно от `addExerciseToSession`: та заводит ПУСТЫЕ запланированные
 * подходы для тренировки, которая идёт. В истории пустой подход не существует
 * — экран показывает только выполненные, и подход без факта был бы невидим.
 * Поэтому здесь сразу один выполненный подход, а дальше он правится и
 * доращивается как любой другой.
 *
 * `plan` заполняется тем же, что и факт: в истории плана уже нет, а пустой
 * план потом выглядел бы как «подход без цели».
 */
export function addHistoricalExercise(
  session: WorkoutSession,
  exercise: Exercise,
  input: { weight: number; reps: number },
  at: string = nowStamp(),
): WorkoutSession {
  const entry: SessionExercise = {
    id: newId('sex'),
    exerciseId: exercise.id,
    programExerciseId: null,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    section: '',
    sortOrder: session.exercises.length,
    restSeconds: 90,
    instructions: [],
    observations: [],
    status: 'done',
    sets: [
      {
        id: newId('sset'),
        setNumber: 1,
        setType: 'normal',
        plan: { weight: input.weight, repsMin: input.reps, repsMax: input.reps },
        actual: {
          weight: input.weight,
          reps: input.reps,
          difficulty: null,
          rpe: null,
          rir: null,
          completedAt: at,
        },
      },
    ],
  };
  return { ...session, exercises: [...session.exercises, entry] };
}

/**
 * Дописать подход в упражнение записанной тренировки. По умолчанию повторяет
 * последний выполненный: чаще всего забыли именно ещё один такой же.
 */
export function addHistoricalSet(
  session: WorkoutSession,
  exerciseEntryId: ID,
  input?: { weight: number; reps: number },
  at: string = nowStamp(),
): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => {
    const done = ex.sets.filter((set) => set.actual);
    const last = done[done.length - 1]?.actual;
    const weight = input?.weight ?? last?.weight ?? 0;
    const reps = input?.reps ?? last?.reps ?? 0;

    const set: SessionSet = {
      id: newId('sset'),
      setNumber: ex.sets.length + 1,
      setType: 'normal',
      plan: { weight, repsMin: reps, repsMax: reps },
      actual: { weight, reps, difficulty: null, rpe: null, rir: null, completedAt: at },
    };
    return { ...ex, status: 'done', sets: [...ex.sets, set] };
  });
}

/* ── Разминка и заминка ─────────────────────────────────────────────── */

/**
 * Запустить таймер разминки или заминки.
 *
 * Хранится момент окончания, а не остаток: телефон в зале блокируется и
 * сворачивается, а отсчёт тиков этого не переживает.
 */
export function startCardio(
  session: WorkoutSession,
  slot: 'warmup' | 'cooldown',
  now: number = Date.now(),
): WorkoutSession {
  const block = session[slot];
  if (!block) return session;
  return {
    ...session,
    [slot]: {
      ...block,
      startedAt: new Date(now).toISOString(),
      endsAt: now + Math.max(1, block.plan.minutes) * 60_000,
    },
  };
}

/** Остановить таймер, не отмечая выполненным: передумал, а не сделал. */
export function stopCardio(
  session: WorkoutSession,
  slot: 'warmup' | 'cooldown',
): WorkoutSession {
  const block = session[slot];
  if (!block) return session;
  return { ...session, [slot]: { ...block, startedAt: null, endsAt: null } };
}

/** Сколько осталось, секунд. `null` — таймер не запущен. */
export function cardioRemainingSeconds(
  block: SessionCardio | undefined,
  now: number = Date.now(),
): number | null {
  if (!block?.endsAt) return null;
  return Math.max(0, Math.round((block.endsAt - now) / 1000));
}

/** Сколько реально прошло с запуска, минут. Минимум одна. */
export function cardioElapsedMinutes(
  block: SessionCardio,
  now: number = Date.now(),
): number {
  if (!block.startedAt) return block.plan.minutes;
  const started = new Date(block.startedAt).getTime();
  return Math.max(1, Math.round((now - started) / 60_000));
}

/**
 * Отметить кардио выполненным.
 *
 * Без таймера один тап = «как в плане». А если таймер ЗАПУСКАЛСЯ — пишем
 * сколько на самом деле прошло: сойти с дорожки на седьмой минуте и записать
 * себе десять значит испортить собственную историю.
 */
export function logCardio(
  session: WorkoutSession,
  slot: 'warmup' | 'cooldown',
  input: { minutes?: number; incline?: number | null } = {},
  at: string = nowStamp(),
): WorkoutSession {
  const block = session[slot];
  if (!block) return session;
  const minutes =
    input.minutes ??
    (block.startedAt ? cardioElapsedMinutes(block, new Date(at).getTime()) : block.plan.minutes);

  return {
    ...session,
    [slot]: {
      ...block,
      startedAt: null,
      endsAt: null,
      actual: {
        minutes,
        incline: input.incline === undefined ? block.plan.incline : input.incline,
        completedAt: at,
      },
    },
  };
}

/** Снять отметку. Тап мимо — обычное дело, откат обязателен. */
export function undoCardio(
  session: WorkoutSession,
  slot: 'warmup' | 'cooldown',
): WorkoutSession {
  const block = session[slot];
  if (!block || !block.actual) return session;
  return { ...session, [slot]: { ...block, actual: null } };
}

/* ── Mutating a live session (pure: returns a new session) ──────────── */

function mapExercise(
  session: WorkoutSession,
  exerciseEntryId: ID,
  fn: (ex: SessionExercise) => SessionExercise,
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((ex) => (ex.id === exerciseEntryId ? fn(ex) : ex)),
  };
}

export interface CompleteSetInput {
  weight: number;
  reps: number;
  difficulty: Difficulty | null;
}

export function completeSet(
  session: WorkoutSession,
  exerciseEntryId: ID,
  setId: ID,
  input: CompleteSetInput,
  at: string = nowStamp(),
): WorkoutSession {
  const meta = input.difficulty ? DIFFICULTY_META[input.difficulty] : null;
  return mapExercise(session, exerciseEntryId, (ex) => {
    const sets = ex.sets.map((set) =>
      set.id === setId
        ? {
            ...set,
            actual: {
              weight: input.weight,
              reps: input.reps,
              difficulty: input.difficulty,
              rpe: meta?.rpe ?? null,
              rir: meta?.rir ?? null,
              completedAt: at,
            },
          }
        : set,
    );
    const allDone = sets.every((set) => set.actual !== null);
    return { ...ex, sets, status: allDone ? 'done' : 'in_progress' };
  });
}

export function uncompleteSet(
  session: WorkoutSession,
  exerciseEntryId: ID,
  setId: ID,
): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => {
    const sets = ex.sets.map((set) => (set.id === setId ? { ...set, actual: null } : set));
    const anyDone = sets.some((set) => set.actual !== null);
    return { ...ex, sets, status: anyDone ? 'in_progress' : 'pending' };
  });
}

/** An extra set beyond the plan — its plan mirrors the last set. */
export function addSet(session: WorkoutSession, exerciseEntryId: ID): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => {
    const last = ex.sets[ex.sets.length - 1];
    const set: SessionSet = {
      id: newId('sset'),
      setNumber: ex.sets.length + 1,
      setType: 'normal',
      plan: last ? { ...last.plan } : { weight: null, repsMin: null, repsMax: null },
      actual: null,
    };
    return { ...ex, sets: [...ex.sets, set], status: ex.status === 'done' ? 'in_progress' : ex.status };
  });
}

export function removeSet(
  session: WorkoutSession,
  exerciseEntryId: ID,
  setId: ID,
): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => {
    const sets = ex.sets
      .filter((set) => set.id !== setId)
      .map((set, i) => ({ ...set, setNumber: i + 1 }));
    return { ...ex, sets };
  });
}

export function skipExercise(session: WorkoutSession, exerciseEntryId: ID): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => ({
    ...ex,
    status: ex.status === 'skipped' ? 'pending' : 'skipped',
  }));
}

export function setExerciseNote(
  session: WorkoutSession,
  exerciseEntryId: ID,
  note: string,
): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => ({ ...ex, note }));
}

export function toggleObservation(
  session: WorkoutSession,
  exerciseEntryId: ID,
  tag: SessionExercise['observations'][number],
): WorkoutSession {
  return mapExercise(session, exerciseEntryId, (ex) => ({
    ...ex,
    observations: ex.observations.includes(tag)
      ? ex.observations.filter((t) => t !== tag)
      : [...ex.observations, tag],
  }));
}

/** Adds a library exercise to a session already in progress. */
export function addExerciseToSession(
  session: WorkoutSession,
  exercise: Exercise,
  setCount = 4,
  restSeconds = 90,
): WorkoutSession {
  const entry: SessionExercise = {
    id: newId('sex'),
    exerciseId: exercise.id,
    programExerciseId: null,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    section: 'ДОПОЛНИТЕЛЬНО',
    sortOrder: session.exercises.length,
    restSeconds,
    instructions: exercise.keyPoints,
    observations: [],
    status: 'pending',
    sets: Array.from({ length: setCount }, (_, i) => ({
      id: newId('sset'),
      setNumber: i + 1,
      setType: 'normal' as const,
      plan: { weight: null, repsMin: null, repsMax: null },
      actual: null,
    })),
  };
  return { ...session, exercises: [...session.exercises, entry] };
}

export function removeExerciseFromSession(
  session: WorkoutSession,
  exerciseEntryId: ID,
): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises
      .filter((ex) => ex.id !== exerciseEntryId)
      .map((ex, i) => ({ ...ex, sortOrder: i })),
  };
}

/**
 * Finishing a workout drops the sets that were never performed — the plan is
 * already snapshotted, and history should read as what happened, not as a
 * to-do list with holes. Exercises with nothing done are kept but marked
 * skipped, so "I skipped legs" stays visible.
 */
/**
 * Сколько тренировка идёт по часам, с учётом пауз.
 *
 * Считается от отметок времени, а не счётчиком: тикающий счётчик врёт после
 * блокировки экрана, сворачивания приложения и перезагрузки страницы, а
 * тренировка длится час и всё это успевает случиться.
 */
export function workoutElapsedSeconds(session: WorkoutSession, now: number = Date.now()): number {
  const started = new Date(session.startedAt).getTime();
  const pausedMs = session.clockPausedMs ?? 0;
  // На паузе время замерло на момент её начала.
  const until = session.clockPausedAt ? new Date(session.clockPausedAt).getTime() : now;
  return Math.max(0, Math.round((until - started - pausedMs) / 1000));
}

/** Поставить часы на паузу. Повторный вызов ничего не меняет. */
export function pauseClock(session: WorkoutSession, at: string = nowStamp()): WorkoutSession {
  if (session.clockPausedAt) return session;
  return { ...session, clockPausedAt: at };
}

/** Снять с паузы, добавив простой к накопленному. */
export function resumeClock(session: WorkoutSession, at: string = nowStamp()): WorkoutSession {
  if (!session.clockPausedAt) return session;
  const paused = new Date(at).getTime() - new Date(session.clockPausedAt).getTime();
  return {
    ...session,
    clockPausedAt: null,
    clockPausedMs: (session.clockPausedMs ?? 0) + Math.max(0, paused),
  };
}

/**
 * Обнулить часы. Трогает только время: подходы, веса и история остаются на
 * месте — сбрасывается секундомер, а не тренировка.
 */
export function resetClock(session: WorkoutSession, at: string = nowStamp()): WorkoutSession {
  return { ...session, startedAt: at, clockPausedAt: null, clockPausedMs: 0 };
}

/**
 * Сменить режим посреди тренировки (§58).
 *
 * ГЛАВНОЕ ОГРАНИЧЕНИЕ: выполненные подходы не меняются никогда. История хранит
 * факт (§46), и «переключил режим — прошлые подходы стали другими» это не
 * пересчёт, а подделка записи. Поэтому режим применяется только к тем
 * подходам, которых ещё не было.
 *
 * Планы берутся из программы заново, а не пересчитываются из текущего снимка:
 * обратное умножение на множитель режима не восстанавливает исходный вес
 * из-за округления до шага, и после двух переключений вес уезжал бы.
 *
 * Если упражнения в программе больше нет (удалили, или оно добавлено на ходу)
 * — план этого упражнения остаётся как есть. Лучше оставить прежние числа,
 * чем выдумать новые.
 *
 * Количество подходов режим тоже меняет, но урезать можно только хвост из
 * невыполненных: если «легкая» оставляет три подхода, а четыре уже сделаны —
 * остаются все четыре.
 */
export function changeSessionMode(
  session: WorkoutSession,
  mode: WorkoutMode,
  modeConfig: ModeConfig,
  program: Program | null,
  roundStep = 0.5,
): WorkoutSession {
  const day = program?.days.find((d) => d.id === session.workoutDayId) ?? null;

  const exercises = session.exercises.map((entry) => {
    const done = entry.sets.filter((set) => set.actual !== null);
    const template = entry.programExerciseId
      ? (day?.exercises.find((ex) => ex.id === entry.programExerciseId) ?? null)
      : null;

    // Нечего пересчитывать: упражнение закрыто, пропущено или не из программы.
    if (!template || entry.status === 'skipped' || done.length === entry.sets.length) {
      return entry;
    }

    const derived = planExerciseSets(template, modeConfig, roundStep);
    // Хвост из невыполненных заменяем, выполненные оставляем нетронутыми.
    const tail = derived.slice(done.length).map((row, i) => {
      const existing = entry.sets[done.length + i];
      return {
        id: existing?.id ?? newId('sset'),
        setNumber: done.length + i + 1,
        setType: row.setType,
        ...(row.note ? { note: row.note } : {}),
        plan: row.plan,
        actual: null,
      } satisfies SessionSet;
    });

    return { ...entry, sets: [...done, ...tail] };
  });

  return { ...session, mode, modeSnapshot: modeConfig, exercises };
}

export function finishSession(
  session: WorkoutSession,
  at: string = nowStamp(),
): WorkoutSession {
  const completedAt = at;
  // Через ту же функцию, что и живые часы: иначе в истории осело бы время
  // вместе с паузами, а на экране всё это время показывалось другое число.
  const duration = workoutElapsedSeconds(session, new Date(completedAt).getTime());

  const exercises = session.exercises.map((ex) => {
    const done = ex.sets.filter((set) => set.actual !== null);
    if (!done.length) return { ...ex, status: 'skipped' as const };
    return {
      ...ex,
      status: 'done' as const,
      sets: done.map((set, i) => ({ ...set, setNumber: i + 1 })),
    };
  });

  return {
    ...session,
    exercises,
    completedAt,
    durationSeconds: session.durationSeconds || duration,
    status: 'completed',
  };
}

/* ── Progress readouts used by the workout screens ──────────────────── */

export interface SessionProgress {
  totalExercises: number;
  completedExercises: number;
  totalSets: number;
  completedSets: number;
  ratio: number;
}

export function sessionProgress(session: WorkoutSession): SessionProgress {
  const active = session.exercises.filter((ex) => ex.status !== 'skipped');
  const totalSets = active.reduce((n, ex) => n + ex.sets.length, 0);
  const done = active.reduce((n, ex) => n + ex.sets.filter((s) => s.actual).length, 0);
  return {
    totalExercises: active.length,
    completedExercises: active.filter((ex) => ex.status === 'done').length,
    totalSets,
    completedSets: done,
    ratio: totalSets ? done / totalSets : 0,
  };
}

/** The exercise the user should be on right now. */
export function currentExerciseId(session: WorkoutSession): ID | null {
  const inProgress = session.exercises.find((ex) => ex.status === 'in_progress');
  if (inProgress) return inProgress.id;
  const pending = session.exercises.find((ex) => ex.status === 'pending');
  return pending?.id ?? null;
}

export function nextSet(exercise: SessionExercise): SessionSet | null {
  return exercise.sets.find((set) => set.actual === null) ?? null;
}

/** Когда план не называет повторений вообще — с чего начать счётчик. */
const DEFAULT_REPS = 10;

/**
 * Чем заполнить поля подхода, чтобы после обычного подхода оставался один тап.
 *
 * План — плохой источник для второго и следующих подходов. Если человек поставил
 * 72.5 вместо запланированных 70, то следующий подход возвращался к 70, и вес
 * приходилось выставлять заново на каждом подходе. Поэтому берём то, что он
 * фактически сделал в предыдущем подходе ЭТОГО упражнения.
 *
 * Но переносим не всегда, а только когда план у двух подходов одинаковый:
 *
 *   — план 4×12 по 70 кг, сделал 72.5 → следующий подход 72.5. Это тот случай,
 *     ради которого всё и делается;
 *   — план идёт лестницей (70, 75, 80) — следуем плану: лестница задана
 *     намеренно, и тянуть в неё прошлый вес значило бы её сломать;
 *   — тип подхода другой (отказной, дроп-сет) — следуем плану: у него своя
 *     цель по повторениям, и 12 из рабочего подхода там не к месту.
 *
 * Предсказуемость здесь важнее догадливости: в зале неверное подставленное
 * число хуже, чем отсутствие подстановки — его можно не заметить и записать.
 */
export function suggestedInput(
  exercise: SessionExercise,
  set: SessionSet,
): { weight: number | null; reps: number } {
  const planReps = set.plan.repsMax ?? set.plan.repsMin ?? DEFAULT_REPS;

  // Уже выполненный подход показывает себя, а не догадку.
  if (set.actual) return { weight: set.actual.weight, reps: set.actual.reps };

  const previous = [...exercise.sets]
    .filter((s) => s.setNumber < set.setNumber && s.actual !== null)
    .sort((a, b) => b.setNumber - a.setNumber)[0];

  if (!previous?.actual) return { weight: set.plan.weight, reps: planReps };
  if (previous.setType !== set.setType) return { weight: set.plan.weight, reps: planReps };
  if (previous.plan.weight !== set.plan.weight) return { weight: set.plan.weight, reps: planReps };

  const samePlanReps =
    previous.plan.repsMin === set.plan.repsMin && previous.plan.repsMax === set.plan.repsMax;

  return {
    weight: previous.actual.weight,
    reps: samePlanReps ? previous.actual.reps : planReps,
  };
}
