/**
 * Personal Gym OS — domain model.
 *
 * The shapes below mirror the relational schema in the spec 1:1 (every row has
 * the same id/foreign-key identity), but nest the children that are always read
 * and written together:
 *
 *   programs   -> days -> exercises -> sets      (the TEMPLATE)
 *   sessions   -> exercises -> sets              (the HISTORY)
 *
 * Nesting is what makes a set save atomic and instant in the gym, and it keeps
 * the two trees independent, which is the central product rule:
 *
 *   PROGRAM != HISTORY. Editing a program never rewrites a past workout, and
 *   a workout never silently rewrites the program.
 *
 * A session therefore carries a *snapshot* of the plan it was started from
 * (`plan` on every set, `modeSnapshot` on the session), so history stays true
 * even after the program moves on.
 */

export type ID = string;
/** Calendar day, `YYYY-MM-DD`, always local time. */
export type DateString = string;
/** Instant, ISO 8601 with timezone. */
export type Timestamp = string;

/* ── Exercise library ───────────────────────────────────────────────── */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'other';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'ez_bar'
  | 'other';

export interface Exercise {
  id: ID;
  /** Display name, in the language the user entered it. */
  name: string;
  /** Optional latin/english alias — used by the import parser for matching. */
  alias?: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  description?: string;
  /** Technique bullets shown on the TECHNIQUE tab. */
  keyPoints: string[];
  /** Photo/GIF/video of the movement or of the user's own machine. */
  mediaUrl?: string;
  /** Default weight increment for progression suggestions, kg. */
  increment: number;
  isCustom: boolean;
  createdAt: Timestamp;
}

/* ── Programs (templates) ───────────────────────────────────────────── */

export type ProgramStatus = 'active' | 'archived' | 'draft';

export type SetType =
  | 'normal'
  | 'warmup'
  | 'top_set'
  | 'drop_set'
  | 'failure'
  | 'burnout';

export type ProgressionType = 'manual' | 'double' | 'fixed' | 'custom';

export interface ProgressionConfig {
  type: ProgressionType;
  /** kg added when the rule fires. Falls back to the exercise increment. */
  increment?: number;
  /** `double`: every working set must reach this many reps. */
  repTarget?: number;
  /** `double` / `custom`: how many sessions in a row must hit the target. */
  consecutiveSessions?: number;
  /** `custom`: free-text rule the user wrote for themselves. */
  note?: string;
}

/** A labelled machine setting the user must reproduce, e.g. "Bench position: 2". */
export interface PersonalSetting {
  label: string;
  value: string;
}

export interface ProgramSet {
  id: ID;
  setNumber: number;
  /** `null` = bodyweight / not prescribed. */
  targetWeight: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  setType: SetType;
  /** Shown verbatim on the set, e.g. "drop weight and go to failure". */
  note?: string;
}

export interface ProgramExercise {
  id: ID;
  exerciseId: ID;
  sortOrder: number;
  /** Muscle-group heading this exercise sits under, e.g. "ГРУДЬ". */
  section: string;
  instructions: string[];
  notes?: string;
  restSeconds: number;
  progression: ProgressionConfig;
  personalSettings: PersonalSetting[];
  /** Disabled exercises stay in the program but are skipped when training. */
  isEnabled: boolean;
  sets: ProgramSet[];
}

export interface WorkoutDay {
  id: ID;
  /** Short label, e.g. "DAY 1". */
  name: string;
  /** What it trains, e.g. "ГРУДЬ + ТРИЦЕПС". */
  title: string;
  description?: string;
  sortOrder: number;
  exercises: ProgramExercise[];
}

export interface Program {
  id: ID;
  name: string;
  description?: string;
  status: ProgramStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt?: Timestamp | null;
  days: WorkoutDay[];
}

/* ── Workout modes (modifiers, not separate programs) ───────────────── */

export type WorkoutMode = 'normal' | 'light' | 'heavy' | 'recovery';

export interface ModeConfig {
  id: WorkoutMode;
  label: string;
  /** Working weight multiplier, 1 = unchanged. */
  weightMultiplier: number;
  /** Sets added/removed per exercise after the multiplier. */
  setsDelta: number;
  /** Fraction of the planned sets kept, 1 = all. */
  setsMultiplier: number;
  /** Drop RIR: shifts the rep target by this many reps (negative = fewer). */
  repsDelta: number;
  /** Failure / burnout / drop sets are removed from the plan. */
  disableFailureSets: boolean;
  description: string;
}

/* ── Sessions (history) ─────────────────────────────────────────────── */

/** Plain-language effort. RPE/RIR are derived and kept for analytics only. */
export type Difficulty = 'easy' | 'good' | 'hard' | 'failure';

export interface SessionSetPlan {
  weight: number | null;
  repsMin: number | null;
  repsMax: number | null;
}

export interface SessionSetActual {
  weight: number;
  reps: number;
  difficulty: Difficulty | null;
  rpe: number | null;
  rir: number | null;
  completedAt: Timestamp;
}

export interface SessionSet {
  id: ID;
  setNumber: number;
  setType: SetType;
  note?: string;
  /** Snapshot of what the program prescribed, after mode modifiers. */
  plan: SessionSetPlan;
  /** What actually happened. `null` until the set is completed. */
  actual: SessionSetActual | null;
}

export type ObservationTag =
  | 'too_easy'
  | 'increase_weight'
  | 'decrease_weight'
  | 'pain'
  | 'bad_technique'
  | 'good_pump'
  | 'form_breakdown';

export type SessionExerciseStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface SessionExercise {
  id: ID;
  exerciseId: ID;
  /** Link back to the template row, or `null` for an exercise added ad hoc. */
  programExerciseId: ID | null;
  /** Denormalised so history stays readable if the library is edited. */
  name: string;
  primaryMuscle: MuscleGroup;
  section: string;
  sortOrder: number;
  restSeconds: number;
  instructions: string[];
  /** Note attached to this exercise in this workout only. */
  note?: string;
  observations: ObservationTag[];
  status: SessionExerciseStatus;
  sets: SessionSet[];
}

export interface ConditionCheckIn {
  /** 1–5 each, optional. */
  sleep?: number;
  energy?: number;
  fatigue?: number;
  recovery?: number;
  note?: string;
}

export type SessionStatus = 'active' | 'completed';

export interface WorkoutSession {
  id: ID;
  programId: ID | null;
  /** Denormalised names keep history intact after renames/deletes. */
  programName: string;
  workoutDayId: ID | null;
  workoutDayName: string;
  workoutDayTitle: string;
  date: DateString;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
  /** Wall-clock length, excluding nothing — measured, not summed from sets. */
  durationSeconds: number;
  mode: WorkoutMode;
  modeSnapshot: ModeConfig;
  notes?: string;
  checkIn?: ConditionCheckIn;
  status: SessionStatus;
  /** True for workouts typed in after the fact (manual/bulk import). */
  isImported?: boolean;
  exercises: SessionExercise[];
}

/* ── Notes, pain, body weight ───────────────────────────────────────── */

export type NoteType = 'permanent' | 'pinned' | 'observation';

export interface ExerciseNote {
  id: ID;
  exerciseId: ID;
  type: NoteType;
  content: string;
  createdAt: Timestamp;
}

export type BodyPart =
  | 'shoulder'
  | 'elbow'
  | 'knee'
  | 'back'
  | 'wrist'
  | 'hip'
  | 'neck'
  | 'other';

export interface PainLog {
  id: ID;
  bodyPart: BodyPart;
  /** 1–10. */
  severity: number;
  notes?: string;
  date: DateString;
  createdAt: Timestamp;
  /** Cleared by the user once it stops hurting; keeps the log honest. */
  resolvedAt?: Timestamp | null;
}

export type BodyWeightGoal = 'bulk' | 'maintain' | 'cut';

export interface BodyWeightLog {
  id: ID;
  weight: number;
  date: DateString;
  notes?: string;
}

/* ── Settings & runtime ─────────────────────────────────────────────── */

export interface Settings {
  userName: string;
  /** Default +/- step on the weight stepper, kg. */
  weightStep: number;
  defaultRestSeconds: number;
  hapticsEnabled: boolean;
  restTimerAutoStart: boolean;
  /**
   * §37: после последнего подхода упражнения сразу открывать следующее.
   * Включено по умолчанию — это и есть смысл тренировочного режима. Но именно
   * настройкой, а не намертво: автоматика, которую нельзя выключить, бесит.
   */
  autoAdvanceExercise: boolean;
  bodyWeightGoal: BodyWeightGoal;
  activeProgramId: ID | null;
  modes: Record<WorkoutMode, ModeConfig>;
  seedVersion: number;
}

/** Rest timer state, persisted so a reload mid-workout loses nothing. */
export interface RestTimerState {
  /** Epoch ms when rest is up. */
  endsAt: number;
  totalSeconds: number;
  sessionId: ID;
  exerciseId: ID;
  setNumber: number;
}

export interface DatabaseSnapshot {
  settings: Settings;
  exercises: Exercise[];
  programs: Program[];
  sessions: WorkoutSession[];
  notes: ExerciseNote[];
  painLogs: PainLog[];
  bodyWeightLogs: BodyWeightLog[];
}
