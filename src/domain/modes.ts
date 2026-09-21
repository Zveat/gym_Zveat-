import type { ModeConfig, WorkoutMode } from './types';

/**
 * Modes are *modifiers over the active program*, never separate programs.
 * Every number here is user-editable in Settings; these are the defaults
 * from the spec.
 */
export const DEFAULT_MODES: Record<WorkoutMode, ModeConfig> = {
  normal: {
    id: 'normal',
    label: 'Обычная',
    weightMultiplier: 1,
    setsDelta: 0,
    setsMultiplier: 1,
    repsDelta: 0,
    disableFailureSets: false,
    description: 'Программа как написана.',
  },
  light: {
    id: 'light',
    label: 'Легкая',
    weightMultiplier: 0.85,
    setsDelta: -1,
    setsMultiplier: 1,
    repsDelta: 0,
    disableFailureSets: true,
    description: 'Меньше вес, на подход меньше, без отказных.',
  },
  heavy: {
    id: 'heavy',
    label: 'Тяжелая',
    weightMultiplier: 1.05,
    setsDelta: 0,
    setsMultiplier: 1,
    repsDelta: -2,
    disableFailureSets: false,
    description: 'Чуть тяжелее, ниже диапазон повторений.',
  },
  recovery: {
    id: 'recovery',
    label: 'Восстановление',
    weightMultiplier: 0.7,
    setsDelta: 0,
    setsMultiplier: 0.55,
    repsDelta: 0,
    disableFailureSets: true,
    description: 'Малый вес, около половины подходов, без отказа.',
  },
};


/**
 * РЕЖИМ, В КОТОРОМ ДЕНЬ БЫЛ ЛЕГЧЕ ПЛАНА.
 *
 * «Легкая» — это 85% веса и на подход меньше, «Восстановление» — 70% и
 * примерно половина подходов. Закрыть повторения на таком дне ОЖИДАЕМО: ради
 * этого режим и выбирают. Судить по нему план — всё равно что мерить силу на
 * разминке, поэтому прогрессия такие дни не трактует как победу.
 *
 * Условие смотрит на сами множители, а не на имя режима: числа режимов
 * редактируются в настройках, и владелец может сделать «Легкую» какой угодно.
 */
export function isEasierThanPlan(mode: ModeConfig): boolean {
  return (
    mode.weightMultiplier < 1 || (mode.setsDelta ?? 0) < 0 || (mode.setsMultiplier ?? 1) < 1
  );
}

export const MODE_ORDER: WorkoutMode[] = ['normal', 'light', 'heavy', 'recovery'];

export const MODE_COLOR: Record<WorkoutMode, string> = {
  normal: 'var(--status-progress)',
  light: 'var(--status-warning)',
  heavy: 'var(--status-pain)',
  recovery: 'var(--status-info)',
};

/** Failure-ish set types that Light/Recovery strip out of the plan. */
export const FAILURE_SET_TYPES = new Set(['failure', 'burnout', 'drop_set']);
