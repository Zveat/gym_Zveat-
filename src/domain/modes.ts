import type { ModeConfig, WorkoutMode } from './types';

/**
 * Modes are *modifiers over the active program*, never separate programs.
 * Every number here is user-editable in Settings; these are the defaults
 * from the spec.
 */
export const DEFAULT_MODES: Record<WorkoutMode, ModeConfig> = {
  normal: {
    id: 'normal',
    label: 'Normal',
    weightMultiplier: 1,
    setsDelta: 0,
    setsMultiplier: 1,
    repsDelta: 0,
    disableFailureSets: false,
    description: 'The program exactly as written.',
  },
  light: {
    id: 'light',
    label: 'Light',
    weightMultiplier: 0.85,
    setsDelta: -1,
    setsMultiplier: 1,
    repsDelta: 0,
    disableFailureSets: true,
    description: 'Lower weight, one set less, no failure work.',
  },
  heavy: {
    id: 'heavy',
    label: 'Heavy',
    weightMultiplier: 1.05,
    setsDelta: 0,
    setsMultiplier: 1,
    repsDelta: -2,
    disableFailureSets: false,
    description: 'Slightly heavier, lower rep target.',
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    weightMultiplier: 0.7,
    setsDelta: 0,
    setsMultiplier: 0.55,
    repsDelta: 0,
    disableFailureSets: true,
    description: 'Light weight, roughly half the sets, nothing near failure.',
  },
};

export const MODE_ORDER: WorkoutMode[] = ['normal', 'light', 'heavy', 'recovery'];

export const MODE_COLOR: Record<WorkoutMode, string> = {
  normal: 'var(--status-progress)',
  light: 'var(--status-warning)',
  heavy: 'var(--status-pain)',
  recovery: 'var(--status-info)',
};

/** Failure-ish set types that Light/Recovery strip out of the plan. */
export const FAILURE_SET_TYPES = new Set(['failure', 'burnout', 'drop_set']);
