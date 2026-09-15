import { DEFAULT_MODES } from '../modes';
import type { DatabaseSnapshot, Settings } from '../types';
import { buildSeedExercises } from './exercise-library';
import { buildSeedProgram } from './program-mass-split';

export const SEED_VERSION = 1;

export function defaultSettings(activeProgramId: string | null): Settings {
  return {
    userName: 'ZVEAT',
    weightStep: 2.5,
    defaultRestSeconds: 90,
    hapticsEnabled: true,
    restTimerAutoStart: true,
    bodyWeightGoal: 'bulk',
    activeProgramId,
    modes: DEFAULT_MODES,
    seedVersion: SEED_VERSION,
  };
}

/** The database a brand-new install starts from. */
export function buildSeedSnapshot(now: string): DatabaseSnapshot {
  const program = buildSeedProgram(now);
  return {
    settings: defaultSettings(program.id),
    exercises: buildSeedExercises(now),
    programs: [program],
    sessions: [],
    notes: [],
    painLogs: [],
    bodyWeightLogs: [],
  };
}

export { buildSeedExercises, buildSeedProgram };
