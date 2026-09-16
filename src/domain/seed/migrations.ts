import type { CardioBlock, Program, WorkoutCountGoal, WorkoutDay } from '../types';

/**
 * ДОБАВЛЕНИЕ НОВОГО В УЖЕ СУЩЕСТВУЮЩУЮ БАЗУ.
 *
 * Засев (`buildSeedSnapshot`) работает один раз, на пустом аккаунте. Всё, что
 * появляется в программе позже, до заведённой базы само не доедет: у владельца
 * программа уже лежит в Firestore, и новое поле у дня там просто отсутствует.
 * Поэтому к каждому расширению программы — шаг миграции и подъём
 * `SEED_VERSION`.
 *
 * ПРАВИЛО ШАГА: только добавлять. Ни один шаг не имеет права переписать то,
 * что владелец уже поправил руками, и ни один не трогает историю тренировок —
 * в сессиях лежит свой снимок плана.
 */

export const WARMUP_DEFAULT: CardioBlock = {
  minutes: 10,
  incline: 0,
  note: 'Ходьба на дорожке',
};

/** День ног — дорожка с подъёмом: так владелец греется перед приседом. */
export const WARMUP_LEGS_DEFAULT: CardioBlock = {
  minutes: 10,
  incline: 8,
  note: 'Ходьба на дорожке',
};

export const COOLDOWN_DEFAULT: CardioBlock = {
  minutes: 5,
  incline: 0,
  note: 'Ходьба на дорожке',
};

/**
 * По названию дня, а не по id: id засева случайный и у владельца в базе свой,
 * сопоставить дни между засевом и живой программой по нему нельзя.
 */
export function isLegsDay(day: Pick<WorkoutDay, 'title'>): boolean {
  return /ноги/i.test(day.title);
}

export function defaultWarmup(day: Pick<WorkoutDay, 'title'>): CardioBlock {
  return isLegsDay(day) ? { ...WARMUP_LEGS_DEFAULT } : { ...WARMUP_DEFAULT };
}

/**
 * Проставляет разминку и заминку дням, у которых их нет.
 *
 * Возвращает `null`, если менять нечего — чтобы не писать в базу зря и не
 * дёргать подписку на каждом запуске.
 */
export function backfillCardio(program: Program): Program | null {
  let changed = false;

  const days = program.days.map((day) => {
    if (day.warmup && day.cooldown) return day;
    changed = true;
    return {
      ...day,
      warmup: day.warmup ?? defaultWarmup(day),
      cooldown: day.cooldown ?? { ...COOLDOWN_DEFAULT },
    };
  });

  return changed ? { ...program, days } : null;
}

/**
 * Цель, которую владелец вёл в другом приложении: 100 тренировок за 150 дней.
 *
 * Считается целиком из истории, поэтому `baseline` здесь ноль, а отсчёт идёт
 * с первой тренировки в его выгрузке — 07.08.2026. Так цифру можно проверить:
 * она совпадает с числом тренировок в истории, а не с числом нажатий.
 *
 * В выгрузке 24 тренировки, а старый счётчик показывал 25. Одной в файле нет,
 * и угадывать её здесь нельзя: если она была, владелец либо внесёт её в
 * историю, либо поставит «уже сделано до приложения» = 1.
 */
export const OWNER_GOAL_START = '2026-08-07';

export function initialWorkoutGoal(): WorkoutCountGoal {
  return {
    target: 100,
    days: 150,
    startDate: OWNER_GOAL_START,
    baseline: 0,
    countFrom: OWNER_GOAL_START,
  };
}

/**
 * `undefined` и `null` — разные вещи: `undefined` значит «цели никогда не
 * было», `null` — «владелец её убрал». Убранную не возвращаем.
 */
export function needsWorkoutGoal(current: WorkoutCountGoal | null | undefined): boolean {
  return current === undefined;
}
