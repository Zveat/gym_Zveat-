import { describe, expect, it } from 'vitest';
import { DEFAULT_MODES } from '@/domain/modes';
import { buildSeedExercises } from '@/domain/seed/exercise-library';
import { buildSeedProgram } from '@/domain/seed/program-mass-split';
import type { Program, SessionExercise, WorkoutSession } from '@/domain/types';
import { applyRecommendation, recommendForExercise, reviewSession } from './progression';
import { buildSession, completeSet, finishSession, toggleObservation } from './session';

const exercises = buildSeedExercises('2026-01-01T00:00:00.000Z');
const program: Program = buildSeedProgram('2026-01-01T00:00:00.000Z');

/** Trains day 4's incline press (18/18/18/20 x 12) with the given reps. */
function inclineSession(reps: number[], date = '2026-09-15'): WorkoutSession {
  const day = program.days[3];
  let session = buildSession({
    program,
    day,
    mode: 'normal',
    modeConfig: DEFAULT_MODES.normal,
    exercises,
    date,
    startedAt: `${date}T18:00:00.000Z`,
  });
  const entry = session.exercises[0];
  entry.sets.forEach((set, i) => {
    if (reps[i] === undefined) return;
    session = completeSet(session, entry.id, set.id, {
      weight: set.plan.weight ?? 0,
      reps: reps[i],
      difficulty: 'good',
    });
  });
  return finishSession(session, `${date}T19:00:00.000Z`);
}

function entryOf(session: WorkoutSession): SessionExercise {
  return session.exercises[0];
}

const inclineProgramExercise = program.days[3].exercises[0];
const inclineExercise = exercises.find((e) => e.id === 'ex_incline_db_press')!;

function recommend(session: WorkoutSession, past: WorkoutSession[] = []) {
  return recommendForExercise({
    entry: entryOf(session),
    programExercise: inclineProgramExercise,
    exercise: inclineExercise,
    sessions: past,
  });
}

describe('double progression', () => {
  it('suggests more weight once every set hits the rep target', () => {
    const rec = recommend(inclineSession([12, 12, 12, 12]));
    expect(rec.verdict).toBe('increase');
    expect(rec.currentWeight).toBe(18);
    expect(rec.suggestedWeight).toBe(20); // dumbbell increment
    expect(rec.reason).toContain('Цель закрыта');
  });

  it('holds the weight while any set is short', () => {
    const rec = recommend(inclineSession([12, 12, 11, 10]));
    expect(rec.verdict).toBe('hold');
    expect(rec.suggestedWeight).toBe(18);
  });

  it('suggests dropping the weight after a real collapse', () => {
    const rec = recommend(inclineSession([7, 6, 6, 5]));
    expect(rec.verdict).toBe('decrease');
    expect(rec.suggestedWeight).toBe(16);
  });

  it('never suggests more weight when pain was reported', () => {
    let session = inclineSession([12, 12, 12, 12]);
    session = toggleObservation(session, entryOf(session).id, 'pain');
    const rec = recommend(session);
    expect(rec.verdict).toBe('decrease');
    expect(rec.reason).toContain('боль');
  });

  it('holds when technique broke down even with the target met', () => {
    let session = inclineSession([12, 12, 12, 12]);
    session = toggleObservation(session, entryOf(session).id, 'bad_technique');
    expect(recommend(session).verdict).toBe('hold');
  });

  it('says nothing about an exercise that was not performed', () => {
    const session = inclineSession([]);
    expect(recommend(session).verdict).toBe('none');
  });
});

describe('fixed and custom progression', () => {
  it('fixed adds the increment every session', () => {
    const rec = recommendForExercise({
      entry: entryOf(inclineSession([12, 12, 12, 12])),
      programExercise: { ...inclineProgramExercise, progression: { type: 'fixed', increment: 2.5 } },
      exercise: inclineExercise,
      sessions: [],
    });
    expect(rec.verdict).toBe('increase');
    expect(rec.suggestedWeight).toBe(20.5);
  });

  it('custom waits for the required number of sessions in a row', () => {
    const config = { type: 'custom' as const, repTarget: 12, consecutiveSessions: 2 };
    const first = inclineSession([12, 12, 12, 12], '2026-09-08');
    const second = inclineSession([12, 12, 12, 12], '2026-09-15');

    const afterOne = recommendForExercise({
      entry: entryOf(first),
      programExercise: { ...inclineProgramExercise, progression: config },
      exercise: inclineExercise,
      sessions: [],
    });
    expect(afterOne.verdict).toBe('hold');

    const afterTwo = recommendForExercise({
      entry: entryOf(second),
      programExercise: { ...inclineProgramExercise, progression: config },
      exercise: inclineExercise,
      sessions: [first],
    });
    expect(afterTwo.verdict).toBe('increase');
  });

  it('manual stays quiet unless everything was easy and the plan was met', () => {
    const manual = { ...inclineProgramExercise, progression: { type: 'manual' as const } };
    const quiet = recommendForExercise({
      entry: entryOf(inclineSession([12, 12, 11, 12])),
      programExercise: manual,
      exercise: inclineExercise,
      sessions: [],
    });
    expect(quiet.verdict).toBe('none');

    let easy = inclineSession([12, 12, 12, 12]);
    easy = {
      ...easy,
      exercises: easy.exercises.map((ex, i) =>
        i === 0
          ? {
              ...ex,
              sets: ex.sets.map((s) =>
                s.actual ? { ...s, actual: { ...s.actual, difficulty: 'easy' as const } } : s,
              ),
            }
          : ex,
      ),
    };
    const nudge = recommendForExercise({
      entry: entryOf(easy),
      programExercise: manual,
      exercise: inclineExercise,
      sessions: [],
    });
    expect(nudge.verdict).toBe('increase');
  });
});

describe('reviewSession', () => {
  it('lists only exercises with something to decide, increases first', () => {
    const session = inclineSession([12, 12, 12, 12]);
    const recs = reviewSession(session, [program], exercises, [session]);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].verdict).toBe('increase');
    expect(recs.every((r) => r.verdict !== 'none')).toBe(true);
  });
});

describe('accepting a recommendation', () => {
  it('moves the whole set shape and leaves history alone', () => {
    const bench = program.days[0].exercises[0];
    const updated = applyRecommendation(program, bench.id, 52.5, '2026-09-15T19:30:00.000Z');
    const after = updated.days[0].exercises[0];

    // 50/50/50/60 -> 52.5/52.5/52.5/62.5: the top-set offset survives.
    expect(after.sets.map((s) => s.targetWeight)).toEqual([52.5, 52.5, 52.5, 62.5]);
    expect(updated.updatedAt).toBe('2026-09-15T19:30:00.000Z');
    // The original program object is untouched.
    expect(program.days[0].exercises[0].sets.map((s) => s.targetWeight)).toEqual([50, 50, 50, 60]);
  });

  it('is a no-op when the weight is unchanged', () => {
    const bench = program.days[0].exercises[0];
    expect(applyRecommendation(program, bench.id, 50, 'x')).toBe(program);
  });
});
