import { newId } from '../ids';
import type {
  PersonalSetting,
  Program,
  ProgramExercise,
  ProgramSet,
  ProgressionConfig,
  SetType,
  WorkoutDay,
} from '../types';

/**
 * The user's real current program, preloaded on first launch so the app is
 * useful in the gym the same day. Transcribed verbatim from the spec:
 * weights, rep ranges, per-machine settings, personal notes and the one
 * exercise that is parked (Гиперэкстензия) but must not be deleted.
 */

interface SetSpec {
  weight: number | null;
  repsMin: number;
  repsMax: number;
  setType: SetType;
  note?: string;
}

/** One prescribed set. */
function s(
  weight: number | null,
  reps: number | [number, number],
  opts: { setType?: SetType; note?: string } = {},
): SetSpec {
  const [min, max] = Array.isArray(reps) ? reps : [reps, reps];
  return { weight, repsMin: min, repsMax: max, setType: opts.setType ?? 'normal', note: opts.note };
}

/** The same set, `count` times. */
function rep(
  count: number,
  weight: number | null,
  reps: number | [number, number],
  opts: { setType?: SetType; note?: string } = {},
): SetSpec[] {
  return Array.from({ length: count }, () => s(weight, reps, opts));
}

interface ExerciseSpec {
  exerciseId: string;
  section: string;
  sets: SetSpec[];
  restSeconds?: number;
  instructions?: string[];
  notes?: string;
  personalSettings?: PersonalSetting[];
  progression?: Partial<ProgressionConfig>;
  isEnabled?: boolean;
}

interface DaySpec {
  name: string;
  title: string;
  exercises: ExerciseSpec[];
}

const DAYS: DaySpec[] = [
  {
    name: 'DAY 1',
    title: 'ГРУДЬ + ТРИЦЕПС',
    exercises: [
      {
        exerciseId: 'ex_bench_press',
        section: 'ГРУДЬ',
        restSeconds: 150,
        sets: [...rep(3, 50, 12), s(60, 12, { setType: 'top_set' })],
      },
      {
        exerciseId: 'ex_incline_db_press',
        section: 'ГРУДЬ',
        restSeconds: 120,
        sets: [...rep(3, 16, 12), s(18, 12, { setType: 'top_set' })],
      },
      {
        exerciseId: 'ex_pec_deck',
        section: 'ГРУДЬ',
        restSeconds: 90,
        personalSettings: [{ label: 'Position', value: '2' }],
        sets: rep(4, 39, 12),
      },
      {
        exerciseId: 'ex_overhead_db_ext',
        section: 'ТРИЦЕПС',
        restSeconds: 90,
        sets: rep(4, 22.5, 12),
      },
      {
        exerciseId: 'ex_rope_pushdown',
        section: 'ТРИЦЕПС',
        restSeconds: 90,
        sets: [
          ...rep(4, 30, 12),
          s(null, [8, 15], { setType: 'failure', note: 'Сбросить вес и до отказа' }),
        ],
      },
    ],
  },
  {
    name: 'DAY 2',
    title: 'СПИНА + БИЦЕПС',
    exercises: [
      {
        exerciseId: 'ex_lat_pulldown',
        section: 'СПИНА',
        restSeconds: 120,
        notes: 'Рабочая история: 35 → 40 → 45 → 50 кг. Текущий рабочий диапазон 40-45 кг.',
        personalSettings: [{ label: 'Хват', value: 'Средний, сверху' }],
        sets: rep(4, 45, 10),
      },
      {
        exerciseId: 'ex_seated_row_v',
        section: 'СПИНА',
        restSeconds: 120,
        sets: [s(35, 10), ...rep(3, 40, 10)],
      },
      {
        exerciseId: 'ex_single_arm_row',
        section: 'СПИНА',
        restSeconds: 90,
        sets: rep(4, 15, 12),
      },
      {
        exerciseId: 'ex_hyperextension',
        section: 'СПИНА',
        restSeconds: 60,
        isEnabled: false,
        notes: 'Пока отключено. Упражнение не удалять.',
        sets: rep(3, null, [12, 15]),
      },
      {
        exerciseId: 'ex_ez_curl',
        section: 'БИЦЕПС',
        restSeconds: 90,
        personalSettings: [{ label: 'Блины', value: '+5 кг' }],
        notes: 'Вес в программе не указан — внести с первой тренировки (гриф + блины по 5 кг).',
        sets: rep(4, null, 10),
      },
      {
        exerciseId: 'ex_arm_curl_machine',
        section: 'БИЦЕПС',
        restSeconds: 75,
        sets: rep(4, 18, 12),
      },
      {
        exerciseId: 'ex_hammer_curl',
        section: 'БИЦЕПС',
        restSeconds: 75,
        sets: [
          ...rep(4, 10, 12),
          s(null, [8, 15], { setType: 'burnout', note: 'Закончить меньшим весом до отказа' }),
        ],
      },
    ],
  },
  {
    name: 'DAY 3',
    title: 'НОГИ + ПЛЕЧИ',
    exercises: [
      {
        exerciseId: 'ex_leg_press',
        section: 'НОГИ',
        restSeconds: 150,
        sets: rep(4, 70, 12),
      },
      {
        exerciseId: 'ex_leg_extension',
        section: 'НОГИ',
        restSeconds: 90,
        sets: rep(4, 40, [15, 20]),
      },
      {
        exerciseId: 'ex_leg_curl',
        section: 'НОГИ',
        restSeconds: 90,
        sets: [...rep(2, 36, 20), ...rep(2, 41, 20)],
      },
      {
        exerciseId: 'ex_seated_db_press',
        section: 'ПЛЕЧИ',
        restSeconds: 120,
        sets: rep(4, 15, 12),
      },
      {
        exerciseId: 'ex_lateral_raise',
        section: 'ПЛЕЧИ',
        restSeconds: 75,
        notes: '7.5 кг — слишком легко.',
        sets: [
          ...rep(4, 7.5, 12),
          s(5, [12, 20], { setType: 'burnout', note: 'Burnout set' }),
        ],
      },
      {
        exerciseId: 'ex_reverse_pec_deck',
        section: 'ПЛЕЧИ',
        restSeconds: 75,
        sets: rep(3, 32, [12, 15]),
      },
      {
        exerciseId: 'ex_upright_row',
        section: 'ПЛЕЧИ',
        restSeconds: 90,
        sets: rep(4, 17.5, 12),
      },
    ],
  },
  {
    name: 'DAY 4',
    title: 'ГРУДЬ + СПИНА',
    exercises: [
      {
        exerciseId: 'ex_incline_db_press',
        section: 'ГРУДЬ',
        restSeconds: 120,
        personalSettings: [{ label: 'Спинка', value: '2 видимых отверстия' }],
        sets: [...rep(3, 18, 12), s(20, 12, { setType: 'top_set' })],
      },
      {
        exerciseId: 'ex_pec_deck',
        section: 'ГРУДЬ',
        restSeconds: 90,
        personalSettings: [{ label: 'Position', value: '2' }],
        sets: rep(4, 39, 15),
      },
      {
        exerciseId: 'ex_lat_pulldown_v',
        section: 'СПИНА',
        restSeconds: 120,
        sets: rep(4, 45, 12),
      },
      {
        exerciseId: 'ex_seated_row',
        section: 'СПИНА',
        restSeconds: 120,
        personalSettings: [{ label: 'Рукоять', value: 'Прямая' }],
        sets: rep(4, 35, 12),
      },
      {
        exerciseId: 'ex_lat_pulldown_wide',
        section: 'СПИНА',
        restSeconds: 120,
        sets: rep(4, 35, 12),
      },
    ],
  },
  {
    name: 'DAY 5',
    title: 'ПЛЕЧИ + РУКИ + НОГИ',
    exercises: [
      {
        exerciseId: 'ex_lateral_raise',
        section: 'ПЛЕЧИ',
        restSeconds: 75,
        sets: rep(4, 10, [12, 15]),
      },
      {
        exerciseId: 'ex_reverse_pec_deck',
        section: 'ПЛЕЧИ',
        restSeconds: 75,
        sets: rep(4, 39, [12, 15]),
      },
      {
        exerciseId: 'ex_seated_alt_curl',
        section: 'БИЦЕПС',
        restSeconds: 75,
        personalSettings: [{ label: 'Спинка', value: '5 видимых отверстий' }],
        sets: rep(4, 10, [10, 12]),
      },
      {
        exerciseId: 'ex_hammer_curl',
        section: 'БИЦЕПС',
        restSeconds: 75,
        sets: rep(4, 12.5, 12),
      },
      {
        exerciseId: 'ex_arm_curl_machine',
        section: 'БИЦЕПС',
        restSeconds: 75,
        sets: rep(3, 18, 15),
      },
      {
        exerciseId: 'ex_overhead_db_ext',
        section: 'ТРИЦЕПС',
        restSeconds: 90,
        sets: rep(4, 22, 12),
      },
      {
        exerciseId: 'ex_bar_pushdown',
        section: 'ТРИЦЕПС',
        restSeconds: 90,
        sets: [
          ...rep(4, 55, 12),
          s(null, [8, 15], { setType: 'failure', note: 'Сбросить вес и до отказа' }),
        ],
      },
      {
        exerciseId: 'ex_leg_curl',
        section: 'НОГИ',
        restSeconds: 90,
        sets: [...rep(2, 45, 15), ...rep(2, 50, 15)],
      },
    ],
  },
];

/** Rep target for double progression = top of the working rep range. */
function defaultProgression(sets: SetSpec[], override?: Partial<ProgressionConfig>): ProgressionConfig {
  const working = sets.filter((x) => x.setType === 'normal' || x.setType === 'top_set');
  const repTarget = working.length ? Math.max(...working.map((x) => x.repsMax)) : 12;
  return {
    type: 'double',
    repTarget,
    consecutiveSessions: 1,
    ...override,
  };
}

function buildExercise(spec: ExerciseSpec, index: number): ProgramExercise {
  const sets: ProgramSet[] = spec.sets.map((set, i) => ({
    id: newId('pset'),
    setNumber: i + 1,
    targetWeight: set.weight,
    targetRepsMin: set.repsMin,
    targetRepsMax: set.repsMax,
    setType: set.setType,
    note: set.note,
  }));

  return {
    id: newId('pex'),
    exerciseId: spec.exerciseId,
    sortOrder: index,
    section: spec.section,
    instructions: spec.instructions ?? [],
    notes: spec.notes,
    restSeconds: spec.restSeconds ?? 90,
    progression: defaultProgression(spec.sets, spec.progression),
    personalSettings: spec.personalSettings ?? [],
    isEnabled: spec.isEnabled ?? true,
    sets,
  };
}

export function buildSeedProgram(createdAt: string): Program {
  const days: WorkoutDay[] = DAYS.map((day, dayIndex) => ({
    id: newId('day'),
    name: day.name,
    title: day.title,
    sortOrder: dayIndex,
    exercises: day.exercises.map(buildExercise),
  }));

  return {
    id: newId('prog'),
    name: 'СПЛИТ — НАБОР МАССЫ',
    description: '5 дней в неделю. Текущая рабочая программа.',
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    days,
  };
}
