import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two things here are invisible from the UI and can only be pinned down at the
 * call level.
 *
 * What is written: Firestore refuses an `undefined` field value, and writes are
 * fire-and-forget, so a refused write reached the console and nothing else —
 * body-weight entries showed on screen and were gone on the next launch.
 *
 * What is read: opening the app used to wait on the network even when
 * everything it needed was already on the device, because an empty cached
 * collection was treated as a cache miss and a new account has four of them.
 * The app looks identical either way; only the call count differs.
 */

const fromCache = vi.fn();
const fromServer = vi.fn();
const setDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}` }),
  deleteDoc: vi.fn(),
  getDocs: (ref: { path: string }) => fromServer(ref.path),
  getDocsFromCache: (ref: { path: string }) => fromCache(ref.path),
  initializeFirestore: () => ({}),
  onSnapshot: vi.fn(),
  persistentLocalCache: () => ({}),
  persistentSingleTabManager: () => ({}),
  setDoc: (ref: unknown, data: unknown) => setDoc(ref, data),
  writeBatch: () => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn() }),
}));

vi.mock('@/data/firebase-app', () => ({ getFirebaseApp: () => ({}) }));

const snapshot = (ids: string[]) => ({
  empty: ids.length === 0,
  docs: ids.map((id) => ({ id, data: () => ({ id, value: id }) })),
});

/** Every collection the adapter asks for, as a bare name. */
const asked = (calls: unknown[][]) =>
  calls.map(([path]) => String(path).split('/').pop()).sort();

describe('FirestoreAdapter writes', () => {
  beforeEach(() => {
    vi.resetModules();
    setDoc.mockReset();
  });

  it('never sends an undefined field value to Firestore', async () => {
    const { FirestoreAdapter } = await import('./firestore-adapter');
    await new FirestoreAdapter('uid').put('bodyWeightLogs', {
      id: 'bw_1',
      weight: 84.5,
      date: '2026-09-15',
      notes: undefined,
    } as { id: string });

    const [, written] = setDoc.mock.calls[0];
    expect(written).toEqual({ id: 'bw_1', weight: 84.5, date: '2026-09-15' });
    expect('notes' in (written as object)).toBe(false);
  });
});

describe('FirestoreAdapter.loadAll', () => {
  beforeEach(() => {
    vi.resetModules();
    fromCache.mockReset();
    fromServer.mockReset();
  });

  it('reads everything from the server when the cache is cold', async () => {
    fromCache.mockResolvedValue(snapshot([]));
    fromServer.mockResolvedValue(snapshot(['a']));

    const { FirestoreAdapter } = await import('./firestore-adapter');
    await new FirestoreAdapter('uid').loadAll();

    // `programs` came back empty from the cache, so nothing local is trusted.
    expect(asked(fromServer.mock.calls)).toContain('programs');
    expect(asked(fromServer.mock.calls)).toContain('sessions');
    expect(asked(fromServer.mock.calls)).toContain('meta');
  });

  it('asks the server for nothing once the cache holds a program', async () => {
    fromCache.mockImplementation((path: string) =>
      Promise.resolve(snapshot(path.endsWith('/programs') ? ['mass-split'] : [])),
    );
    fromServer.mockResolvedValue(snapshot([]));

    const { FirestoreAdapter } = await import('./firestore-adapter');
    const loaded = await new FirestoreAdapter('uid').loadAll();

    expect(fromServer).not.toHaveBeenCalled();
    expect(loaded.programs).toHaveLength(1);
    // The empty ones are answered as empty rather than re-fetched.
    expect(loaded.sessions).toEqual([]);
  });

  it('falls back to the server for a collection the cache cannot answer', async () => {
    fromCache.mockImplementation((path: string) => {
      if (path.endsWith('/programs')) return Promise.resolve(snapshot(['mass-split']));
      if (path.endsWith('/sessions')) return Promise.reject(new Error('cache unavailable'));
      return Promise.resolve(snapshot([]));
    });
    fromServer.mockResolvedValue(snapshot(['s1']));

    const { FirestoreAdapter } = await import('./firestore-adapter');
    const loaded = await new FirestoreAdapter('uid').loadAll();

    expect(asked(fromServer.mock.calls)).toEqual(['sessions']);
    expect(loaded.sessions).toHaveLength(1);
  });

  it('still returns the key-value meta documents', async () => {
    fromCache.mockImplementation((path: string) => {
      if (path.endsWith('/programs')) return Promise.resolve(snapshot(['mass-split']));
      if (path.endsWith('/meta')) return Promise.resolve(snapshot(['state_settings']));
      return Promise.resolve(snapshot([]));
    });

    const { FirestoreAdapter } = await import('./firestore-adapter');
    const loaded = await new FirestoreAdapter('uid').loadAll();

    // `state_` is stripped so the store sees the plain key it wrote.
    expect(loaded.kv).toEqual({ settings: 'state_settings' });
  });
});
