'use client';

import { create } from 'zustand';
import { newId, nowStamp, todayString } from '@/domain/ids';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedSnapshot, defaultSettings } from '@/domain/seed';
import type {
  BodyWeightLog,
  ConditionCheckIn,
  DatabaseSnapshot,
  Difficulty,
  Exercise,
  ExerciseNote,
  ID,
  ModeConfig,
  NoteType,
  ObservationTag,
  PainLog,
  Program,
  ProgramExercise,
  RestTimerState,
  Settings,
  WorkoutMode,
  WorkoutSession,
} from '@/domain/types';
import {
  COLLECTIONS,
  __setAdapter,
  getAdapter,
  type CollectionName,
  type PersistenceAdapter,
  type StorageKind,
} from '@/data/db';
import {
  FirestoreAdapter,
  isCloudConfigured,
  watchAccount,
  type Account,
} from '@/data/firebase';
import { detectPRs, personalRecords, type DetectedPR } from '@/engine/records';
import { applyRecommendation, type ProgressionRecommendation } from '@/engine/progression';
import * as engine from '@/engine/session';
import type { ParsedWorkout } from '@/engine/import-parser';

/**
 * One store for the whole app.
 *
 * Every action updates memory synchronously and persists in the background
 * (optimistic writes): in the gym the UI must never wait on storage. Because
 * state is the single source of truth, a set save is one object replacement,
 * and analytics are derived on read rather than maintained.
 */

export interface PRCelebration {
  exerciseName: string;
  pr: DetectedPR;
  at: number;
}

/** Where the data lives right now, and whether it is usable. */
export interface CloudState {
  /** A Firebase project is configured in this build. */
  configured: boolean;
  /** `null` while unknown or signed out. */
  account: Account | null;
  /** `signed_out` blocks the app behind the sign-in screen. */
  status: 'off' | 'checking' | 'signed_out' | 'ready';
}

interface StoreState extends DatabaseSnapshot {
  status: 'loading' | 'ready';
  storage: StorageKind | null;
  cloud: CloudState;
  rest: RestTimerState | null;
  celebration: PRCelebration | null;
}

interface StoreActions {
  init: () => Promise<void>;
  /** Called by the auth listener: swaps storage to that account and reloads. */
  attachAccount: (account: Account | null) => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => void;
  updateMode: (mode: WorkoutMode, patch: Partial<ModeConfig>) => void;
  resetModes: () => void;

  /* Exercise library */
  createExercise: (input: Partial<Exercise> & { name: string }) => Exercise;
  updateExercise: (id: ID, patch: Partial<Exercise>) => void;
  deleteExercise: (id: ID) => { ok: boolean; reason?: string };

  /* Programs */
  createProgram: (input: { name: string; description?: string; dayTitles?: string[] }) => Program;
  mutateProgram: (id: ID, fn: (program: Program) => Program) => void;
  deleteProgram: (id: ID) => void;
  duplicateProgram: (id: ID) => Program | null;
  setProgramStatus: (id: ID, status: Program['status']) => void;
  activateProgram: (id: ID) => void;

  /* Workout execution */
  startWorkout: (input: {
    programId: ID;
    dayId: ID;
    mode: WorkoutMode;
    checkIn?: ConditionCheckIn;
  }) => WorkoutSession | null;
  completeSet: (
    exerciseEntryId: ID,
    setId: ID,
    input: { weight: number; reps: number; difficulty: Difficulty | null },
  ) => DetectedPR[];
  uncompleteSet: (exerciseEntryId: ID, setId: ID) => void;
  addSet: (exerciseEntryId: ID) => void;
  removeSet: (exerciseEntryId: ID, setId: ID) => void;
  skipExercise: (exerciseEntryId: ID) => void;
  setExerciseNote: (exerciseEntryId: ID, note: string) => void;
  toggleObservation: (exerciseEntryId: ID, tag: ObservationTag) => void;
  addExerciseToWorkout: (exerciseId: ID) => void;
  removeExerciseFromWorkout: (exerciseEntryId: ID) => void;
  setSessionNotes: (notes: string) => void;
  setCheckIn: (checkIn: ConditionCheckIn) => void;
  finishWorkout: () => ID | null;
  discardWorkout: () => void;

  /* Rest timer */
  startRest: (seconds: number, context: Omit<RestTimerState, 'endsAt' | 'totalSeconds'>) => void;
  extendRest: (seconds: number) => void;
  clearRest: () => void;
  dismissCelebration: () => void;

  /* History */
  addHistoricalSession: (session: WorkoutSession) => void;
  updateSession: (id: ID, fn: (session: WorkoutSession) => WorkoutSession) => void;
  deleteSession: (id: ID) => void;
  importSessions: (
    workouts: ParsedWorkout[],
    options?: { programId?: ID | null; dayName?: string },
  ) => { created: number; skipped: number };

  /* Progression review */
  acceptRecommendation: (rec: ProgressionRecommendation, weight?: number) => void;

  /* Notes, pain, body weight */
  addNote: (exerciseId: ID, type: NoteType, content: string) => void;
  updateNote: (id: ID, patch: Partial<ExerciseNote>) => void;
  deleteNote: (id: ID) => void;
  addPainLog: (input: Omit<PainLog, 'id' | 'createdAt'>) => void;
  resolvePainLog: (id: ID) => void;
  deletePainLog: (id: ID) => void;
  addBodyWeight: (weight: number, date?: string, notes?: string) => void;
  deleteBodyWeight: (id: ID) => void;

  /* Data management */
  exportSnapshot: () => DatabaseSnapshot;
  importSnapshot: (snapshot: DatabaseSnapshot) => void;
  resetEverything: () => Promise<void>;
}

export type Store = StoreState & StoreActions;

const KV_SETTINGS = 'settings';
const KV_REST = 'rest';

/** Fire-and-forget persistence: failures must never break a workout. */
function persist(fn: (adapter: Awaited<ReturnType<typeof getAdapter>>) => Promise<unknown>) {
  void getAdapter()
    .then(fn)
    .catch((error) => {
      console.error('[gym-os] persistence failed', error);
    });
}

function persistRecord(collection: CollectionName, record: { id: string }) {
  persist((adapter) => adapter.put(collection, record));
}

function persistRemoval(collection: CollectionName, id: string) {
  persist((adapter) => adapter.remove(collection, id));
}

function persistSettings(settings: Settings) {
  persist((adapter) => adapter.setKV(KV_SETTINGS, settings));
}

export const useStore = create<Store>((set, get) => ({
  status: 'loading',
  storage: null,
  cloud: { configured: false, account: null, status: 'off' },
  rest: null,
  celebration: null,
  ...buildSeedSnapshot(nowStamp()),

  /**
   * Boot. With a Firebase project configured the app waits for the auth state
   * before touching data — signing in as someone else must not merge into
   * whatever happened to be cached on the device.
   */
  async init() {
    if (initStarted) return;
    initStarted = true;

    if (!isCloudConfigured()) {
      set({ cloud: { configured: false, account: null, status: 'off' } });
      await loadFrom(await getAdapter(), set);
      return;
    }

    set({ cloud: { configured: true, account: null, status: 'checking' } });
    watchAccount((account) => {
      void get().attachAccount(account);
    });
  },

  async attachAccount(account) {
    stopWatches();

    if (!account) {
      __setAdapter(null);
      set({
        status: 'ready',
        storage: null,
        cloud: { configured: true, account: null, status: 'signed_out' },
      });
      return;
    }

    const current = get().cloud.account;
    if (current?.uid === account.uid && get().cloud.status === 'ready') return;

    set({ status: 'loading', cloud: { configured: true, account, status: 'checking' } });

    const adapter = new FirestoreAdapter(account.uid);
    await migrateDeviceDataIfNeeded(adapter);
    __setAdapter(adapter);
    await loadFrom(adapter, set);
    set({ cloud: { configured: true, account, status: 'ready' } });

    startWatches(adapter, get, set);
  },

  /* ── Settings ─────────────────────────────────────────────────────── */

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    persistSettings(settings);
  },

  updateMode(mode, patch) {
    const current = get().settings;
    const settings: Settings = {
      ...current,
      modes: { ...current.modes, [mode]: { ...current.modes[mode], ...patch } },
    };
    set({ settings });
    persistSettings(settings);
  },

  resetModes() {
    get().updateSettings({ modes: DEFAULT_MODES });
  },

  /* ── Exercise library ─────────────────────────────────────────────── */

  createExercise(input) {
    const exercise: Exercise = {
      id: newId('ex'),
      name: input.name,
      alias: input.alias,
      primaryMuscle: input.primaryMuscle ?? 'other',
      secondaryMuscles: input.secondaryMuscles ?? [],
      equipment: input.equipment ?? 'other',
      description: input.description,
      keyPoints: input.keyPoints ?? [],
      mediaUrl: input.mediaUrl,
      increment: input.increment ?? 2.5,
      isCustom: true,
      createdAt: nowStamp(),
    };
    set({ exercises: [...get().exercises, exercise] });
    persistRecord('exercises', exercise);
    return exercise;
  },

  updateExercise(id, patch) {
    const exercises = get().exercises.map((e) => (e.id === id ? { ...e, ...patch, id } : e));
    set({ exercises });
    const updated = exercises.find((e) => e.id === id);
    if (updated) persistRecord('exercises', updated);
  },

  deleteExercise(id) {
    const { programs, sessions } = get();
    const usedInProgram = programs.some((p) =>
      p.days.some((d) => d.exercises.some((pe) => pe.exerciseId === id)),
    );
    if (usedInProgram) return { ok: false, reason: 'Упражнение используется в программе.' };
    const usedInHistory = sessions.some((s) => s.exercises.some((e) => e.exerciseId === id));
    if (usedInHistory) return { ok: false, reason: 'Упражнение есть в истории тренировок.' };

    set({ exercises: get().exercises.filter((e) => e.id !== id) });
    persistRemoval('exercises', id);
    return { ok: true };
  },

  /* ── Programs ─────────────────────────────────────────────────────── */

  createProgram({ name, description, dayTitles = [] }) {
    const now = nowStamp();
    const program: Program = {
      id: newId('prog'),
      name,
      description,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      days: dayTitles.map((title, i) => ({
        id: newId('day'),
        name: `DAY ${i + 1}`,
        title,
        sortOrder: i,
        exercises: [],
      })),
    };
    set({ programs: [...get().programs, program] });
    persistRecord('programs', program);
    return program;
  },

  mutateProgram(id, fn) {
    const current = get().programs.find((p) => p.id === id);
    if (!current) return;
    const next = { ...fn(current), updatedAt: nowStamp() };
    set({ programs: get().programs.map((p) => (p.id === id ? next : p)) });
    persistRecord('programs', next);
  },

  deleteProgram(id) {
    const { programs, settings, sessions } = get();
    const remaining = programs.filter((p) => p.id !== id);
    set({ programs: remaining });
    persistRemoval('programs', id);

    // History keeps its denormalised program name, so past workouts survive.
    if (settings.activeProgramId === id) {
      const next = remaining.find((p) => p.status === 'active') ?? remaining[0] ?? null;
      get().updateSettings({ activeProgramId: next?.id ?? null });
    }
    void sessions;
  },

  duplicateProgram(id) {
    const source = get().programs.find((p) => p.id === id);
    if (!source) return null;
    const now = nowStamp();
    const copy: Program = {
      ...source,
      id: newId('prog'),
      name: `${source.name} (копия)`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      days: source.days.map((day) => ({
        ...day,
        id: newId('day'),
        exercises: day.exercises.map((pe) => ({
          ...pe,
          id: newId('pex'),
          sets: pe.sets.map((s) => ({ ...s, id: newId('pset') })),
        })),
      })),
    };
    set({ programs: [...get().programs, copy] });
    persistRecord('programs', copy);
    return copy;
  },

  setProgramStatus(id, status) {
    get().mutateProgram(id, (program) => ({
      ...program,
      status,
      archivedAt: status === 'archived' ? nowStamp() : null,
    }));
    if (status === 'active') get().activateProgram(id);
  },

  activateProgram(id) {
    const { programs } = get();
    const now = nowStamp();
    const next = programs.map((p) =>
      p.id === id
        ? { ...p, status: 'active' as const, archivedAt: null, updatedAt: now }
        : p.status === 'active'
          ? { ...p, status: 'archived' as const, archivedAt: now, updatedAt: now }
          : p,
    );
    set({ programs: next });
    persist((adapter) => adapter.replaceAll('programs', next));
    get().updateSettings({ activeProgramId: id });
  },

  /* ── Workout execution ────────────────────────────────────────────── */

  startWorkout({ programId, dayId, mode, checkIn }) {
    const { programs, exercises, settings, sessions } = get();
    const program = programs.find((p) => p.id === programId);
    const day = program?.days.find((d) => d.id === dayId);
    if (!program || !day) return null;

    // Only one workout can be live: an abandoned one is dropped, not merged.
    const cleaned = sessions.filter((s) => s.status !== 'active');

    const session = engine.buildSession({
      program,
      day,
      mode,
      modeConfig: settings.modes[mode],
      exercises,
      roundStep: 0.5,
    });
    const withCheckIn = checkIn ? { ...session, checkIn } : session;

    set({ sessions: [...cleaned, withCheckIn], rest: null });
    persistRecord('sessions', withCheckIn);
    persist((adapter) => adapter.setKV(KV_REST, null));
    return withCheckIn;
  },

  completeSet(exerciseEntryId, setId, input) {
    const { sessions, exercises } = get();
    const active = sessions.find((s) => s.status === 'active');
    if (!active) return [];

    const entry = active.exercises.find((e) => e.id === exerciseEntryId);
    const setType = entry?.sets.find((s) => s.id === setId)?.setType ?? 'normal';

    // Records as of *before* this workout: the active session is excluded from
    // history by construction, so this is simply the baseline.
    const baseline = personalRecords(
      sessions.filter((s) => s.status === 'completed'),
      entry?.exerciseId ?? '',
      entry?.name ?? '',
    );
    const prs = detectPRs(baseline, { ...input, setType });

    const next = engine.completeSet(active, exerciseEntryId, setId, input);
    set({
      sessions: sessions.map((s) => (s.id === active.id ? next : s)),
      celebration: prs.length
        ? { exerciseName: entry?.name ?? '', pr: prs[0], at: Date.now() }
        : get().celebration,
    });
    persistRecord('sessions', next);
    void exercises;
    return prs;
  },

  uncompleteSet(exerciseEntryId, setId) {
    applyToActive(get, set, (s) => engine.uncompleteSet(s, exerciseEntryId, setId));
  },
  addSet(exerciseEntryId) {
    applyToActive(get, set, (s) => engine.addSet(s, exerciseEntryId));
  },
  removeSet(exerciseEntryId, setId) {
    applyToActive(get, set, (s) => engine.removeSet(s, exerciseEntryId, setId));
  },
  skipExercise(exerciseEntryId) {
    applyToActive(get, set, (s) => engine.skipExercise(s, exerciseEntryId));
  },
  setExerciseNote(exerciseEntryId, note) {
    applyToActive(get, set, (s) => engine.setExerciseNote(s, exerciseEntryId, note));
  },
  toggleObservation(exerciseEntryId, tag) {
    applyToActive(get, set, (s) => engine.toggleObservation(s, exerciseEntryId, tag));
  },
  removeExerciseFromWorkout(exerciseEntryId) {
    applyToActive(get, set, (s) => engine.removeExerciseFromSession(s, exerciseEntryId));
  },
  setSessionNotes(notes) {
    applyToActive(get, set, (s) => ({ ...s, notes }));
  },
  setCheckIn(checkIn) {
    applyToActive(get, set, (s) => ({ ...s, checkIn }));
  },

  addExerciseToWorkout(exerciseId) {
    const exercise = get().exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    applyToActive(get, set, (s) =>
      engine.addExerciseToSession(s, exercise, 4, get().settings.defaultRestSeconds),
    );
  },

  finishWorkout() {
    const { sessions } = get();
    const active = sessions.find((s) => s.status === 'active');
    if (!active) return null;
    const done = engine.finishSession(active);
    set({
      sessions: sessions.map((s) => (s.id === active.id ? done : s)),
      rest: null,
      celebration: null,
    });
    persistRecord('sessions', done);
    persist((adapter) => adapter.setKV(KV_REST, null));
    return done.id;
  },

  discardWorkout() {
    const { sessions } = get();
    const active = sessions.find((s) => s.status === 'active');
    if (!active) return;
    set({ sessions: sessions.filter((s) => s.id !== active.id), rest: null, celebration: null });
    persistRemoval('sessions', active.id);
    persist((adapter) => adapter.setKV(KV_REST, null));
  },

  /* ── Rest timer ───────────────────────────────────────────────────── */

  startRest(seconds, context) {
    const rest: RestTimerState = {
      ...context,
      totalSeconds: seconds,
      endsAt: Date.now() + seconds * 1000,
    };
    set({ rest });
    persist((adapter) => adapter.setKV(KV_REST, rest));
  },

  extendRest(seconds) {
    const rest = get().rest;
    if (!rest) return;
    const next: RestTimerState = {
      ...rest,
      endsAt: Math.max(Date.now(), rest.endsAt) + seconds * 1000,
      totalSeconds: rest.totalSeconds + seconds,
    };
    set({ rest: next });
    persist((adapter) => adapter.setKV(KV_REST, next));
  },

  clearRest() {
    set({ rest: null });
    persist((adapter) => adapter.setKV(KV_REST, null));
  },

  dismissCelebration() {
    set({ celebration: null });
  },

  /* ── History ──────────────────────────────────────────────────────── */

  /** Writes a workout that already happened, typed in after the fact. */
  addHistoricalSession(session) {
    const record: WorkoutSession = { ...session, status: 'completed', isImported: true };
    set({ sessions: [...get().sessions, record] });
    persistRecord('sessions', record);
  },

  updateSession(id, fn) {
    const current = get().sessions.find((s) => s.id === id);
    if (!current) return;
    const next = fn(current);
    set({ sessions: get().sessions.map((s) => (s.id === id ? next : s)) });
    persistRecord('sessions', next);
  },

  deleteSession(id) {
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
    persistRemoval('sessions', id);
  },

  /**
   * Turns parsed workouts into history. Imported sessions carry `isImported`
   * and use the actual numbers as their own plan — there is no plan to
   * reconstruct for a workout that already happened.
   */
  importSessions(workouts, options = {}) {
    const { exercises, programs, settings } = get();
    const program =
      programs.find((p) => p.id === (options.programId ?? settings.activeProgramId)) ?? null;
    const library = new Map(exercises.map((e) => [e.id, e]));

    const created: WorkoutSession[] = [];
    let skipped = 0;

    for (const workout of workouts) {
      if (!workout.date) {
        skipped += 1;
        continue;
      }
      const entries = workout.exercises.filter((e) => e.exerciseId && e.sets.length);
      if (!entries.length) {
        skipped += 1;
        continue;
      }

      const session: WorkoutSession = {
        id: newId('sess'),
        programId: program?.id ?? null,
        programName: program?.name ?? 'Импорт',
        workoutDayId: null,
        workoutDayName: workout.dayName ?? options.dayName ?? 'ИМПОРТ',
        workoutDayTitle: workout.dayName ?? '',
        date: workout.date,
        startedAt: `${workout.date}T12:00:00.000Z`,
        completedAt: `${workout.date}T13:00:00.000Z`,
        durationSeconds: 0,
        mode: 'normal',
        modeSnapshot: settings.modes.normal,
        status: 'completed',
        isImported: true,
        exercises: entries.map((parsed, index) => {
          const exercise = library.get(parsed.exerciseId!);
          return {
            id: newId('sex'),
            exerciseId: parsed.exerciseId!,
            programExerciseId: null,
            name: exercise?.name ?? parsed.rawName,
            primaryMuscle: exercise?.primaryMuscle ?? 'other',
            section: '',
            sortOrder: index,
            restSeconds: settings.defaultRestSeconds,
            instructions: [],
            observations: [],
            status: 'done' as const,
            sets: parsed.sets.map((s, i) => ({
              id: newId('sset'),
              setNumber: i + 1,
              setType: 'normal' as const,
              plan: { weight: s.weight, repsMin: s.reps, repsMax: s.reps },
              actual: {
                weight: s.weight ?? 0,
                reps: s.reps,
                difficulty: null,
                rpe: null,
                rir: null,
                completedAt: `${workout.date}T12:${String(Math.min(59, i * 3)).padStart(2, '0')}:00.000Z`,
              },
            })),
          };
        }),
      };
      created.push(session);
    }

    if (created.length) {
      set({ sessions: [...get().sessions, ...created] });
      persist((adapter) => adapter.putMany('sessions', created));
    }
    return { created: created.length, skipped };
  },

  /* ── Progression review ───────────────────────────────────────────── */

  acceptRecommendation(rec, weight) {
    const target = weight ?? rec.suggestedWeight;
    if (target === null || target === undefined || !rec.programExerciseId) return;
    const { programs } = get();
    const program = programs.find((p) =>
      p.days.some((d) => d.exercises.some((pe) => pe.id === rec.programExerciseId)),
    );
    if (!program) return;
    const next = applyRecommendation(program, rec.programExerciseId, target, nowStamp());
    if (next === program) return;
    set({ programs: programs.map((p) => (p.id === program.id ? next : p)) });
    persistRecord('programs', next);
  },

  /* ── Notes, pain, body weight ─────────────────────────────────────── */

  addNote(exerciseId, type, content) {
    const note: ExerciseNote = {
      id: newId('note'),
      exerciseId,
      type,
      content,
      createdAt: nowStamp(),
    };
    set({ notes: [...get().notes, note] });
    persistRecord('notes', note);
  },

  updateNote(id, patch) {
    const notes = get().notes.map((n) => (n.id === id ? { ...n, ...patch, id } : n));
    set({ notes });
    const updated = notes.find((n) => n.id === id);
    if (updated) persistRecord('notes', updated);
  },

  deleteNote(id) {
    set({ notes: get().notes.filter((n) => n.id !== id) });
    persistRemoval('notes', id);
  },

  addPainLog(input) {
    const log: PainLog = { ...input, id: newId('pain'), createdAt: nowStamp(), resolvedAt: null };
    set({ painLogs: [...get().painLogs, log] });
    persistRecord('painLogs', log);
  },

  resolvePainLog(id) {
    const painLogs = get().painLogs.map((l) =>
      l.id === id ? { ...l, resolvedAt: l.resolvedAt ? null : nowStamp() } : l,
    );
    set({ painLogs });
    const updated = painLogs.find((l) => l.id === id);
    if (updated) persistRecord('painLogs', updated);
  },

  deletePainLog(id) {
    set({ painLogs: get().painLogs.filter((l) => l.id !== id) });
    persistRemoval('painLogs', id);
  },

  addBodyWeight(weight, date = todayString(), notes) {
    const existing = get().bodyWeightLogs.find((l) => l.date === date);
    const log: BodyWeightLog = { id: existing?.id ?? newId('bw'), weight, date, notes };
    set({
      bodyWeightLogs: existing
        ? get().bodyWeightLogs.map((l) => (l.id === existing.id ? log : l))
        : [...get().bodyWeightLogs, log],
    });
    persistRecord('bodyWeightLogs', log);
  },

  deleteBodyWeight(id) {
    set({ bodyWeightLogs: get().bodyWeightLogs.filter((l) => l.id !== id) });
    persistRemoval('bodyWeightLogs', id);
  },

  /* ── Data management ──────────────────────────────────────────────── */

  exportSnapshot() {
    const { settings, exercises, programs, sessions, notes, painLogs, bodyWeightLogs } = get();
    return { settings, exercises, programs, sessions, notes, painLogs, bodyWeightLogs };
  },

  importSnapshot(snapshot) {
    set({
      settings: { ...snapshot.settings, modes: { ...DEFAULT_MODES, ...snapshot.settings.modes } },
      exercises: snapshot.exercises ?? [],
      programs: snapshot.programs ?? [],
      sessions: snapshot.sessions ?? [],
      notes: snapshot.notes ?? [],
      painLogs: snapshot.painLogs ?? [],
      bodyWeightLogs: snapshot.bodyWeightLogs ?? [],
      rest: null,
    });
    persist(async (adapter) => {
      await adapter.replaceAll('exercises', snapshot.exercises ?? []);
      await adapter.replaceAll('programs', snapshot.programs ?? []);
      await adapter.replaceAll('sessions', snapshot.sessions ?? []);
      await adapter.replaceAll('notes', snapshot.notes ?? []);
      await adapter.replaceAll('painLogs', snapshot.painLogs ?? []);
      await adapter.replaceAll('bodyWeightLogs', snapshot.bodyWeightLogs ?? []);
      await adapter.setKV(KV_SETTINGS, snapshot.settings);
      await adapter.setKV(KV_REST, null);
    });
  },

  async resetEverything() {
    const adapter = await getAdapter();
    await adapter.clear();
    const snapshot = buildSeedSnapshot(nowStamp());
    set({ ...snapshot, rest: null, celebration: null, status: 'ready' });
    await adapter.replaceAll('exercises', snapshot.exercises);
    await adapter.replaceAll('programs', snapshot.programs);
    await adapter.setKV(KV_SETTINGS, snapshot.settings);
  },
}));

/** Set once per page load; the auth listener drives everything after that. */
let initStarted = false;
let watches: (() => void)[] = [];

function stopWatches() {
  watches.forEach((off) => off());
  watches = [];
}

/**
 * First sign-in on a device that was already used without an account.
 *
 * Without this, training done before connecting Firebase would sit in the
 * device's own storage while the app showed an empty cloud account — data not
 * lost, but invisible, which is worse. If the account is empty and the device
 * has something, the device's database is uploaded once.
 *
 * Seeded-but-untouched data is uploaded too: it is identical to what the
 * account would have been seeded with anyway.
 */
async function migrateDeviceDataIfNeeded(cloud: PersistenceAdapter): Promise<void> {
  try {
    const remote = await cloud.loadAll();
    const cloudHasData =
      (remote.programs?.length ?? 0) > 0 ||
      (remote.exercises?.length ?? 0) > 0 ||
      Boolean(remote.kv?.[KV_SETTINGS]);
    if (cloudHasData) return;

    const local = await getAdapter();
    if (local.kind === 'firestore') return;
    const device = await local.loadAll();
    const deviceHasData =
      (device.programs?.length ?? 0) > 0 || (device.exercises?.length ?? 0) > 0;
    if (!deviceHasData) return;

    await cloud.replaceAll('exercises', device.exercises ?? []);
    await cloud.replaceAll('programs', device.programs ?? []);
    await cloud.replaceAll('sessions', device.sessions ?? []);
    await cloud.replaceAll('notes', device.notes ?? []);
    await cloud.replaceAll('painLogs', device.painLogs ?? []);
    await cloud.replaceAll('bodyWeightLogs', device.bodyWeightLogs ?? []);
    const settings = device.kv?.[KV_SETTINGS];
    if (settings) await cloud.setKV(KV_SETTINGS, settings);

    console.info('[gym-os] данные с устройства перенесены в аккаунт');
  } catch (error) {
    // A failed migration must not block sign-in: the device keeps its copy,
    // and the backup file in Settings is still there as the manual route.
    console.error('[gym-os] не удалось перенести данные с устройства', error);
  }
}

/**
 * Loads a whole database into memory, seeding it on first use.
 *
 * Shared by the local and cloud paths so "first launch" means the same thing
 * either way: an account with no program gets the user's real program.
 */
async function loadFrom(
  adapter: PersistenceAdapter,
  set: (partial: Partial<StoreState>) => void,
): Promise<void> {
  const loaded = await adapter.loadAll();
  const kv = loaded.kv ?? {};

  const isEmpty =
    !(loaded.programs?.length ?? 0) && !(loaded.exercises?.length ?? 0) && !kv[KV_SETTINGS];

  if (isEmpty) {
    const snapshot = buildSeedSnapshot(nowStamp());
    set({ ...snapshot, status: 'ready', storage: adapter.kind, rest: null });
    persist(async (a) => {
      await a.replaceAll('exercises', snapshot.exercises);
      await a.replaceAll('programs', snapshot.programs);
      await a.setKV(KV_SETTINGS, snapshot.settings);
    });
    return;
  }

  const storedSettings = kv[KV_SETTINGS] as Settings | undefined;
  const programs = loaded.programs ?? [];
  const settings: Settings = {
    ...defaultSettings(programs.find((p) => p.status === 'active')?.id ?? null),
    ...storedSettings,
    // Mode configs gain fields over time; keep the defaults as the floor.
    modes: { ...DEFAULT_MODES, ...(storedSettings?.modes ?? {}) },
  };

  set({
    status: 'ready',
    storage: adapter.kind,
    settings,
    exercises: loaded.exercises ?? [],
    programs,
    sessions: loaded.sessions ?? [],
    notes: loaded.notes ?? [],
    painLogs: loaded.painLogs ?? [],
    bodyWeightLogs: loaded.bodyWeightLogs ?? [],
    rest: (kv[KV_REST] as RestTimerState | undefined) ?? null,
  });
}

/**
 * Live updates from the user's other devices.
 *
 * One rule matters: a workout in progress on *this* device is never
 * overwritten. Everything else is server-wins, which is right for a single
 * user — the newest write is simply the truth.
 */
function startWatches(
  adapter: FirestoreAdapter,
  get: () => Store,
  set: (partial: Partial<StoreState>) => void,
) {
  const simple: CollectionName[] = ['exercises', 'programs', 'notes', 'painLogs', 'bodyWeightLogs'];

  for (const name of simple) {
    watches.push(
      adapter.watch(name, (records) => {
        set({ [name]: records } as unknown as Partial<StoreState>);
      }),
    );
  }

  watches.push(
    adapter.watch('sessions', (records) => {
      const remote = records as unknown as WorkoutSession[];
      const activeHere = get().sessions.find((s) => s.status === 'active');
      if (!activeHere) {
        set({ sessions: remote });
        return;
      }
      // Keep the live workout exactly as this device has it.
      set({ sessions: [...remote.filter((s) => s.id !== activeHere.id), activeHere] });
    }),
  );
}

/** Applies an engine function to the live session and persists the result. */
function applyToActive(
  get: () => Store,
  set: (partial: Partial<StoreState>) => void,
  fn: (session: WorkoutSession) => WorkoutSession,
) {
  const { sessions } = get();
  const active = sessions.find((s) => s.status === 'active');
  if (!active) return;
  const next = fn(active);
  set({ sessions: sessions.map((s) => (s.id === active.id ? next : s)) });
  persistRecord('sessions', next);
}

export { COLLECTIONS };
export type { ProgramExercise };
