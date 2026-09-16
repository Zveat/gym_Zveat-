import { DEFAULT_MODES } from '../modes';
import type { DatabaseSnapshot, Settings } from '../types';
import { buildSeedExercises } from './exercise-library';
import { buildSeedProgram } from './program-mass-split';

/**
 * Версия засева. Поднимается ВСЯКИЙ РАЗ, когда в программу добавляется что-то
 * новое: у заведённой базы засев уже не сработает, и догоняет её только шаг из
 * `migrations.ts`, а запускается он по этому номеру.
 *
 * 2 — разминка и заминка у дня.
 */
export const SEED_VERSION = 2;

export function defaultSettings(activeProgramId: string | null): Settings {
  return {
    userName: 'ZVEAT',
    weightStep: 2.5,
    defaultRestSeconds: 90,
    hapticsEnabled: true,
    restTimerAutoStart: true,
    autoAdvanceExercise: true,
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
