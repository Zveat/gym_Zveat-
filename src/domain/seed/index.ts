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
 * 3 — цель по тренировкам: отсчёт с первой тренировки истории вместо
 *     сегодняшней даты, которую подставила версия 2.
 * 4 — псевдонимы и новые упражнения библиотеки: до заведённой базы они не
 *     доезжали, и импорт разбирал названия из выгрузки наугад.
 */
export const SEED_VERSION = 4;

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
