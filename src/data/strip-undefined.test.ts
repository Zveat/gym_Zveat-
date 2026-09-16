import { describe, expect, it } from 'vitest';
import { stripUndefined } from './db';

/**
 * This is the bug that lost body-weight entries: the store built the record as
 * `{ id, weight, date, notes }` with no note, producing `notes: undefined`,
 * and Firestore refuses that outright — `setDoc` throws "Unsupported field
 * value: undefined". Writes are fire-and-forget, so the throw only reached the
 * console: the value appeared on screen from the optimistic update and was
 * gone on the next launch.
 */
describe('stripUndefined', () => {
  it('drops an optional field that was never filled in', () => {
    const log = { id: 'bw_1', weight: 84.5, date: '2026-09-15', notes: undefined };
    expect(stripUndefined(log)).toEqual({ id: 'bw_1', weight: 84.5, date: '2026-09-15' });
    expect('notes' in stripUndefined(log)).toBe(false);
  });

  it('keeps null, which Firestore stores happily', () => {
    // The domain uses `null` deliberately for "no weight recorded" on a set.
    expect(stripUndefined({ weight: null, reps: 12 })).toEqual({ weight: null, reps: 12 });
  });

  it('keeps falsy values that are not undefined', () => {
    expect(stripUndefined({ a: 0, b: '', c: false })).toEqual({ a: 0, b: '', c: false });
  });

  it('reaches nested records, where session sets live', () => {
    const session = {
      id: 's1',
      notes: undefined,
      exercises: [{ id: 'e1', note: undefined, sets: [{ reps: 8, weight: 50, rpe: undefined }] }],
    };
    expect(stripUndefined(session)).toEqual({
      id: 's1',
      exercises: [{ id: 'e1', sets: [{ reps: 8, weight: 50 }] }],
    });
  });

  it('does not turn an array into an object', () => {
    const cleaned = stripUndefined({ sets: [{ reps: 8 }, { reps: 10 }] });
    expect(Array.isArray(cleaned.sets)).toBe(true);
    expect(cleaned.sets).toHaveLength(2);
  });

  it('leaves an array hole alone rather than collapsing the length', () => {
    // An index is not a key: dropping one would renumber every later set.
    const cleaned = stripUndefined({ sets: [{ reps: 8 }, undefined, { reps: 10 }] });
    expect(cleaned.sets).toHaveLength(3);
  });

  it('passes a Date through instead of flattening it to {}', () => {
    const date = new Date('2026-09-15T00:00:00Z');
    expect(stripUndefined({ at: date }).at).toBe(date);
  });
});
