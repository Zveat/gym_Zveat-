import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import type { Program, WorkoutDay } from '@/domain/types';
import {
  addSet,
  applySetCount,
  buildSession,
  completeSet,
  currentExerciseId,
  finishSession,
  planExerciseSets,
  removeExerciseFromSession,
  sessionProgress,
  skipExercise,
  uncompleteSet,
} from './session';
import { sessionVolume, sessionWorkingSetCount } from './volume';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program: Program = buildSeedProgram('2026-01-01T00:00:00.000Z');
const day1: WorkoutDay = program.days[0];

function start(mode: keyof typeof DEFAULT_MODES = 'normal', day = day1) {
  return buildSession({
    program,
    day,
    mode,
    modeConfig: DEFAULT_MODES[mode],
    exercises,
    date: '2026-09-15',
    startedAt: '2026-09-15T18:00:00.000Z',
  });
}

describe('the preloaded program', () => {
  it('has the five days from the spec', () => {
    expect(program.days.map((d) => d.name)).toEqual(['DAY 1', 'DAY 2', 'DAY 3', 'DAY 4', 'DAY 5']);
    expect(program.status).toBe('active');
  });

  it('prescribes bench press 50/50/50/60 x 12 on day 1', () => {
    const bench = day1.exercises.find((e) => e.exerciseId === 'ex_bench_press')!;
    expect(bench.sets.map((s) => s.targetWeight)).toEqual([50, 50, 50, 60]);
    expect(bench.sets.every((s) => s.targetRepsMax === 12)).toBe(true);
    expect(bench.sets.at(-1)!.setType).toBe('top_set');
  });

  it('keeps the parked hyperextension in the program but disabled', () => {
    const parked = program.days[1].exercises.find((e) => e.exerciseId === 'ex_hyperextension')!;
    expect(parked.isEnabled).toBe(false);
  });

  it('carries per-machine settings and personal notes', () => {
    const pecDeck = day1.exercises.find((e) => e.exerciseId === 'ex_pec_deck')!;
    expect(pecDeck.personalSettings).toEqual([{ label: 'Position', value: '2' }]);
    const lateral = program.days[2].exercises.find((e) => e.exerciseId === 'ex_lateral_raise')!;
    expect(lateral.notes).toContain('слишком легко');
  });
});

describe('buildSession', () => {
  it('snapshots the plan and starts with nothing completed', () => {
    const session = start();
    expect(session.status).toBe('active');
    expect(session.exercises).toHaveLength(5);
    const bench = session.exercises[0];
    expect(bench.sets.map((s) => s.plan.weight)).toEqual([50, 50, 50, 60]);
    expect(bench.sets.every((s) => s.actual === null)).toBe(true);
  });

  it('skips disabled exercises', () => {
    const session = start('normal', program.days[1]);
    expect(session.exercises.some((e) => e.exerciseId === 'ex_hyperextension')).toBe(false);
  });

  it('inherits technique key points when the program adds no instructions', () => {
    expect(start().exercises[0].instructions).toContain('Лопатки сведены');
  });
});

describe('workout modes are modifiers, not separate programs', () => {
  it('light drops the weight, removes a set and strips failure work', () => {
    const normal = start('normal');
    const light = start('light');

    const benchNormal = normal.exercises[0];
    const benchLight = light.exercises[0];
    expect(benchLight.sets).toHaveLength(benchNormal.sets.length - 1);
    // 50 * 0.85 = 42.5 — the preview number from the spec.
    expect(benchLight.sets[0].plan.weight).toBe(42.5);

    const ropeNormal = normal.exercises.find((e) => e.exerciseId === 'ex_rope_pushdown')!;
    const ropeLight = light.exercises.find((e) => e.exerciseId === 'ex_rope_pushdown')!;
    expect(ropeNormal.sets.some((s) => s.setType === 'failure')).toBe(true);
    expect(ropeLight.sets.some((s) => s.setType === 'failure')).toBe(false);
  });

  it('heavy adds weight and lowers the rep target', () => {
    const heavy = start('heavy').exercises[0];
    expect(heavy.sets[0].plan.weight).toBe(52.5);
    expect(heavy.sets[0].plan.repsMax).toBe(10);
  });

  it('recovery roughly halves the sets and never goes near failure', () => {
    const recovery = start('recovery').exercises[0];
    expect(recovery.sets).toHaveLength(2);
    expect(recovery.sets[0].plan.weight).toBe(35);
  });

  it('never grows the plan beyond what the program prescribes', () => {
    expect(applySetCount(4, { ...DEFAULT_MODES.normal, setsDelta: 3 })).toBe(4);
    expect(applySetCount(4, DEFAULT_MODES.light)).toBe(3);
    expect(applySetCount(1, DEFAULT_MODES.recovery)).toBe(1);
  });

  it('keeps warm-up sets regardless of the sets modifier', () => {
    const withWarmup = {
      ...day1.exercises[0],
      sets: [
        { ...day1.exercises[0].sets[0], id: 'w', setType: 'warmup' as const, targetWeight: 20 },
        ...day1.exercises[0].sets,
      ],
    };
    const planned = planExerciseSets(withWarmup, DEFAULT_MODES.light);
    expect(planned.filter((s) => s.setType === 'warmup')).toHaveLength(1);
    expect(planned.filter((s) => s.setType !== 'warmup')).toHaveLength(3);
  });
});

describe('completing sets', () => {
  it('stores the actual result without touching the plan', () => {
    let session = start();
    const bench = session.exercises[0];
    session = completeSet(session, bench.id, bench.sets[2].id, {
      weight: 55,
      reps: 10,
      difficulty: 'hard',
    });

    const saved = session.exercises[0].sets[2];
    expect(saved.plan.weight).toBe(50); // plan untouched
    expect(saved.actual).toMatchObject({ weight: 55, reps: 10, difficulty: 'hard', rpe: 9, rir: 1 });
    expect(session.exercises[0].status).toBe('in_progress');
  });

  it('marks the exercise done once every set is in', () => {
    let session = start();
    const bench = session.exercises[0];
    for (const set of bench.sets) {
      session = completeSet(session, bench.id, set.id, { weight: 50, reps: 12, difficulty: 'good' });
    }
    expect(session.exercises[0].status).toBe('done');
    expect(sessionProgress(session).completedExercises).toBe(1);
  });

  it('can undo a set', () => {
    let session = start();
    const bench = session.exercises[0];
    session = completeSet(session, bench.id, bench.sets[0].id, { weight: 50, reps: 12, difficulty: 'good' });
    session = uncompleteSet(session, bench.id, bench.sets[0].id);
    expect(session.exercises[0].sets[0].actual).toBeNull();
    expect(session.exercises[0].status).toBe('pending');
  });

  it('can add an extra set beyond the plan', () => {
    let session = start();
    const bench = session.exercises[0];
    session = addSet(session, bench.id);
    expect(session.exercises[0].sets).toHaveLength(5);
    expect(session.exercises[0].sets[4].plan.weight).toBe(60);
  });

  it('points at the exercise to do next', () => {
    let session = start();
    expect(currentExerciseId(session)).toBe(session.exercises[0].id);
    const bench = session.exercises[0];
    for (const set of bench.sets) {
      session = completeSet(session, bench.id, set.id, { weight: 50, reps: 12, difficulty: 'good' });
    }
    expect(currentExerciseId(session)).toBe(session.exercises[1].id);
  });

  it('skips past an exercise the user does not want today', () => {
    let session = start();
    session = skipExercise(session, session.exercises[0].id);
    expect(currentExerciseId(session)).toBe(session.exercises[1].id);
    expect(sessionProgress(session).totalExercises).toBe(4);
  });
});

describe('finishSession', () => {
  it('records duration, keeps what was done and drops sets never performed', () => {
    let session = start();
    const bench = session.exercises[0];
    session = completeSet(session, bench.id, bench.sets[0].id, { weight: 50, reps: 12, difficulty: 'good' });
    session = completeSet(session, bench.id, bench.sets[1].id, { weight: 50, reps: 11, difficulty: 'hard' });

    const done = finishSession(session, '2026-09-15T19:14:00.000Z');
    expect(done.status).toBe('completed');
    expect(done.durationSeconds).toBe(74 * 60);
    expect(done.exercises[0].sets).toHaveLength(2);
    expect(done.exercises[0].sets.map((s) => s.setNumber)).toEqual([1, 2]);
    // Untouched exercises stay visible as skipped rather than vanishing.
    expect(done.exercises[1].status).toBe('skipped');
    expect(sessionVolume(done)).toBe(50 * 12 + 50 * 11);
    expect(sessionWorkingSetCount(done)).toBe(2);
  });

  it('can drop an exercise from a live session entirely', () => {
    const session = start();
    const trimmed = removeExerciseFromSession(session, session.exercises[0].id);
    expect(trimmed.exercises).toHaveLength(4);
    expect(trimmed.exercises.map((e) => e.sortOrder)).toEqual([0, 1, 2, 3]);
  });
});
