import type { Equipment, Exercise, MuscleGroup } from '../types';

/**
 * Seed library. Ids are stable, human-readable slugs so the preloaded program
 * and the import parser can reference them without a lookup table, and so a
 * future server sync has a deterministic key.
 */
interface SeedExercise {
  id: string;
  name: string;
  alias?: string;
  /**
   * Названия того же упражнения из прежних выгрузок. Без них импорт заводил
   * второе упражнение с той же историей: «Сведение рук в тренажере» из старого
   * файла не находило «Разводку в тренажере».
   */
  aliases?: string[];
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: Equipment;
  keyPoints?: string[];
  increment?: number;
}

const SEED: SeedExercise[] = [
  /* Chest */
  {
    id: 'ex_bench_press',
    name: 'Жим штанги лежа',
    alias: 'Barbell Bench Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'barbell',
    increment: 2.5,
    keyPoints: [
      'Лопатки сведены',
      'Поясница слегка прогнута',
      'Опускать штангу к нижней части груди',
    ],
  },
  {
    id: 'ex_incline_db_press',
    name: 'Жим гантелей под углом 30-40°',
    aliases: ['Жим гантелей под углом 30°'],
    alias: 'Incline Dumbbell Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
    increment: 2,
    keyPoints: ['Акцент на верх груди', 'Работать плавно', 'Не сталкивать гантели наверху'],
  },
  {
    id: 'ex_pec_deck',
    name: 'Разводка в тренажере',
    aliases: ['Сведение рук в тренажере'],
    alias: 'Pec Deck',
    primaryMuscle: 'chest',
    equipment: 'machine',
    increment: 3,
    keyPoints: [
      'Рукоятки на уровне груди',
      'Грудь вперед',
      'Плечи назад и вниз',
      'Лопатки слегка сведены',
    ],
  },
  /* Triceps */
  {
    id: 'ex_overhead_db_ext',
    name: 'Жим гантели из-за головы',
    aliases: ['Разгибание гантели из-за головы'],
    alias: 'Overhead Dumbbell Extension',
    primaryMuscle: 'triceps',
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Локти неподвижны', 'Движение только предплечьями'],
  },
  {
    id: 'ex_rope_pushdown',
    name: 'Разгибание рук на верхнем блоке с канатом',
    /*
     * «с прямой канатом» — опечатка в выгрузке (смесь «с прямой рукоятью» и
     * «с канатом»). Что это канат, видно по весу: 14.09 там 30 кг × 12, ровно
     * как 07.09 на канате, тогда как прямая рукоять в те же недели шла на
     * 45–55 кг. Псевдоним, а не нечёткое совпадение: 0.80 могло уехать.
     */
    aliases: ['Разгибание рук на блоке с канатом', 'Разгибание рук на блоке с прямой канатом'],
    alias: 'Cable Triceps Pushdown (rope)',
    primaryMuscle: 'triceps',
    equipment: 'cable',
    increment: 2.5,
    keyPoints: ['Локти прижаты к корпусу', 'В конце движения развести канат'],
  },
  {
    id: 'ex_bar_pushdown',
    name: 'Разгибание рук на верхнем блоке с прямой рукоятью',
    aliases: ['Разгибание рук на блоке с прямой рукоятью'],
    alias: 'Cable Triceps Pushdown (bar)',
    primaryMuscle: 'triceps',
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Локти прижаты', 'Корпус слегка наклонен вперед'],
  },
  /* Back */
  {
    id: 'ex_lat_pulldown',
    name: 'Тяга верхнего блока к груди',
    alias: 'Lat Pulldown',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Лопатки вниз и назад', 'Хват сверху, средний', 'Тянуть к груди'],
  },
  {
    id: 'ex_lat_pulldown_v',
    name: 'Тяга верхнего блока V-хватом',
    aliases: ['Тяга верхнего блока V хватом'],
    alias: 'Lat Pulldown (V-handle)',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Тянуть к низу груди', 'Не раскачивать корпус'],
  },
  {
    /*
     * Средний хват — отдельное упражнение, а не то же, что V-хват: владелец
     * подтвердил, что это два разных вида, и в выгрузке они стоят в одном дне
     * (DAY 4) под разными названиями. Без своей записи «средним хватом»
     * садилось на V-хват с совпадением 0.80 — то есть 12 подходов легли бы в
     * рекорды другого упражнения.
     */
    id: 'ex_lat_pulldown_medium',
    name: 'Тяга верхнего блока средним хватом',
    alias: 'Medium-Grip Lat Pulldown',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Хват на ширине плеч', 'Лопатки вниз и назад'],
  },
  {
    id: 'ex_lat_pulldown_wide',
    name: 'Тяга верхнего блока широким хватом',
    aliases: ['Тяга верхнего блока широким хватом к груди'],
    alias: 'Wide-Grip Lat Pulldown',
    primaryMuscle: 'back',
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Широкий хват', 'Акцент на широчайшие'],
  },
  {
    id: 'ex_seated_row_v',
    name: 'Тяга нижнего блока к поясу V-хватом',
    aliases: ['Тяга горизонтального блока с V-образной рукоятью'],
    alias: 'Seated Cable Row (V-handle)',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Локти назад', 'Использовать V-рукоять'],
  },
  {
    id: 'ex_seated_row',
    name: 'Тяга нижнего блока к поясу',
    aliases: ['Тяга горизонтального блока'],
    alias: 'Seated Cable Row',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Спина прямая', 'Тянуть к поясу'],
  },
  {
    /*
     * Третья рукоять на той же тяге. Владелец: «разные хваты» — значит и
     * рекорды разные. В выгрузке она стоит в DAY 4 рядом с обычной тягой,
     * поэтому слить их нельзя.
     */
    id: 'ex_seated_row_alt',
    name: 'Тяга нижнего блока к поясу (другая рукоять)',
    aliases: ['Тяга горизонтального блока (другая рокоять)'],
    alias: 'Seated Cable Row (alt handle)',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'cable',
    increment: 5,
    keyPoints: ['Спина прямая', 'Тянуть к поясу'],
  },
  {
    id: 'ex_single_arm_row',
    name: 'Тяга одной рукой нижнего блока',
    aliases: ['Тяга нижнего блока одной рукой'],
    alias: 'Single-Arm Cable Row',
    primaryMuscle: 'back',
    equipment: 'cable',
    increment: 2.5,
    keyPoints: ['Полная амплитуда', 'Небольшая ротация корпуса'],
  },
  {
    id: 'ex_hyperextension',
    name: 'Гиперэкстензия',
    alias: 'Hyperextension',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes'],
    equipment: 'bodyweight',
    increment: 2.5,
    keyPoints: ['Без переразгибания', 'Движение в тазобедренном суставе'],
  },
  /* Biceps */
  {
    id: 'ex_ez_curl',
    name: 'Подъем EZ-грифа стоя',
    // Владелец пишет это упражнение как «Подьем штанги на бицепс стоя»
    // (подтвердил, что это оно же). Без псевдонима 24 подхода из выгрузки
    // завели бы дубль упражнения.
    aliases: ['Подьем штанги на бицепс стоя', 'Подъем штанги на бицепс стоя'],
    alias: 'EZ-Bar Curl',
    primaryMuscle: 'biceps',
    equipment: 'ez_bar',
    increment: 2.5,
    keyPoints: ['Локти прижаты к корпусу', 'Не раскачивать корпус'],
  },
  {
    id: 'ex_arm_curl_machine',
    name: 'ARM CURL (тренажер)',
    aliases: ['Сгибание рук на бицепс в тренажере'],
    alias: 'Machine Arm Curl',
    primaryMuscle: 'biceps',
    equipment: 'machine',
    increment: 2,
    keyPoints: ['Плечи прижаты к упору', 'Полное разгибание внизу'],
  },
  {
    /*
     * Владелец называет это «ARM CURL», но на тренажёр ARM CURL его положить
     * нельзя: 04.09 и 11.09 оба упражнения стоят в ОДНОЙ тренировке и с
     * разными весами — гантели 10 кг против 18 кг на стеке тренажёра. То есть
     * это два разных упражнения, и слияние испортило бы рекорды обоих.
     */
    id: 'ex_incline_db_curl',
    name: 'Подъем гантелей на бицепс на наклонной скамье',
    aliases: ['Подьем гантелей на бицепс на наклонной скамье'],
    alias: 'Incline Dumbbell Curl',
    primaryMuscle: 'biceps',
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Спина прижата к наклонной спинке', 'Локти не выводить вперёд'],
  },
  {
    id: 'ex_hammer_curl',
    name: 'Молотки',
    alias: 'Hammer Curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Нейтральный хват', 'Без рывков'],
  },
  {
    id: 'ex_seated_alt_curl',
    name: 'Подъем гантелей сидя попеременно',
    alias: 'Seated Alternating Dumbbell Curl',
    primaryMuscle: 'biceps',
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Спина прижата к спинке', 'Супинация в верхней точке'],
  },
  /* Shoulders */
  {
    id: 'ex_seated_db_press',
    name: 'Жим гантелей сидя',
    alias: 'Seated Dumbbell Press',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['triceps'],
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Передняя и средняя дельта', 'Не прогибать поясницу'],
  },
  {
    id: 'ex_lateral_raise',
    name: 'Подъем гантелей в стороны',
    aliases: ['Разведения гантелей в стороны'],
    alias: 'Dumbbell Lateral Raise',
    primaryMuscle: 'shoulders',
    equipment: 'dumbbell',
    increment: 2.5,
    keyPoints: ['Локти чуть выше кистей', 'Без рывка корпусом'],
  },
  {
    id: 'ex_reverse_pec_deck',
    name: 'Обратная бабочка',
    alias: 'Reverse Pec Deck',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'machine',
    increment: 3,
    keyPoints: ['Задняя дельта', 'Руки почти прямые'],
  },
  {
    id: 'ex_upright_row',
    name: 'Тяга штанги к подбородку узким хватом',
    aliases: ['Тяга штанги к подбородку'],
    alias: 'Narrow-Grip Upright Row',
    primaryMuscle: 'shoulders',
    secondaryMuscles: ['back'],
    equipment: 'barbell',
    increment: 2.5,
    keyPoints: ['Тянуть локтями вверх'],
  },
  /* Legs */
  {
    id: 'ex_leg_press',
    name: 'Жим ногами',
    alias: 'Leg Press',
    primaryMuscle: 'legs',
    secondaryMuscles: ['glutes'],
    equipment: 'machine',
    increment: 5,
    keyPoints: ['Не отрывать таз', 'Колени не сводить внутрь'],
  },
  {
    id: 'ex_leg_extension',
    name: 'Разгибание ног сидя',
    alias: 'Seated Leg Extension',
    primaryMuscle: 'legs',
    equipment: 'machine',
    increment: 4,
    keyPoints: ['Пауза в верхней точке', 'Без рывков'],
  },
  {
    id: 'ex_leg_curl',
    name: 'Сгибание ног сидя',
    alias: 'Seated Leg Curl',
    primaryMuscle: 'legs',
    equipment: 'machine',
    increment: 5,
    keyPoints: ['Таз прижат', 'Контролируемый негатив'],
  },
];

export function buildSeedExercises(createdAt: string): Exercise[] {
  return SEED.map((s) => ({
    id: s.id,
    name: s.name,
    alias: s.alias,
    ...(s.aliases ? { aliases: s.aliases } : {}),
    primaryMuscle: s.primaryMuscle,
    secondaryMuscles: s.secondaryMuscles ?? [],
    equipment: s.equipment,
    keyPoints: s.keyPoints ?? [],
    increment: s.increment ?? 2.5,
    isCustom: false,
    createdAt,
  }));
}

export const SEED_EXERCISE_IDS = SEED.map((s) => s.id);
