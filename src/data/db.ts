import type { DatabaseSnapshot } from '@/domain/types';
import { DB_NAME, DB_VERSION, LS_PROBE, LS_SNAPSHOT } from './storage-keys';

/**
 * Storage, behind one interface.
 *
 * Two implementations sit behind it: Firestore (`data/firebase.ts`) when the
 * app is configured with a Firebase project, and the on-device stores here
 * otherwise. The store above never knows which — it writes one record per set
 * save and never waits on the result, so COMPLETE SET is instant either way.
 *
 * Records are stored one per row, so saving a set writes a single session, not
 * the entire history. If IndexedDB is unavailable (private windows, locked
 * down browsers) we degrade to localStorage, and finally to memory, so the app
 * still runs instead of failing in the middle of a workout.
 */

export { DB_NAME, DB_VERSION } from './storage-keys';

export const COLLECTIONS = [
  'exercises',
  'programs',
  'sessions',
  'notes',
  'painLogs',
  'bodyWeightLogs',
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/** Single-value rows (settings, rest timer) live here. */
const KV_STORE = 'kv';

export type StorageKind = 'firestore' | 'indexeddb' | 'localstorage' | 'memory';

/** What a live subscription delivers: only what actually changed. */
export interface CollectionChange {
  upserted: { id: string }[];
  removed: string[];
}

/**
 * Drops keys whose value is `undefined`, at any depth.
 *
 * Firestore rejects an `undefined` field value outright — `setDoc` throws
 * "Unsupported field value: undefined" — and the store builds records from
 * optional fields with object literals, so `{ notes }` with no note produces
 * `{ notes: undefined }` and the whole write fails. That is how body-weight
 * entries were lost: the record appeared on screen from the optimistic update,
 * the write threw, and the value was gone on the next launch.
 *
 * There are 25 optional fields in the domain, so this is fixed here, once, at
 * the boundary rather than at each call site. An absent optional field and an
 * `undefined` one mean the same thing in this app, so dropping the key loses
 * nothing. Arrays keep their length — an index is not a key.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  // Dates, and anything else that is not a plain object, pass through whole.
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue;
    out[key] = stripUndefined(item);
  }
  return out as T;
}

export interface PersistenceAdapter {
  readonly kind: StorageKind;
  /** Live updates from other devices. Only the cloud adapter implements it. */
  watch?(collection: CollectionName, fn: (change: CollectionChange) => void): () => void;
  loadAll(): Promise<Partial<DatabaseSnapshot> & { kv: Record<string, unknown> }>;
  put(collection: CollectionName, record: { id: string }): Promise<void>;
  putMany(collection: CollectionName, records: { id: string }[]): Promise<void>;
  remove(collection: CollectionName, id: string): Promise<void>;
  replaceAll(collection: CollectionName, records: { id: string }[]): Promise<void>;
  setKV(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

/* ── IndexedDB ─────────────────────────────────────────────────────── */

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}

class IndexedDBAdapter implements PersistenceAdapter {
  readonly kind = 'indexeddb' as const;

  constructor(private db: IDBDatabase) {}

  private tx(store: string, mode: IDBTransactionMode) {
    return this.db.transaction(store, mode).objectStore(store);
  }

  private done(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.transaction.onabort = () => reject(store.transaction.error);
    });
  }

  async loadAll() {
    const result: Record<string, unknown> = {};
    for (const name of COLLECTIONS) {
      result[name] = await promisify(this.tx(name, 'readonly').getAll());
    }
    const kvStore = this.tx(KV_STORE, 'readonly');
    const keys = await promisify(kvStore.getAllKeys());
    const values = await promisify(kvStore.getAll());
    const kv: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      kv[String(key)] = values[i];
    });
    return { ...(result as Partial<DatabaseSnapshot>), kv };
  }

  async put(collection: CollectionName, record: { id: string }) {
    const store = this.tx(collection, 'readwrite');
    store.put(record);
    await this.done(store);
  }

  async putMany(collection: CollectionName, records: { id: string }[]) {
    if (!records.length) return;
    const store = this.tx(collection, 'readwrite');
    records.forEach((r) => store.put(r));
    await this.done(store);
  }

  async remove(collection: CollectionName, id: string) {
    const store = this.tx(collection, 'readwrite');
    store.delete(id);
    await this.done(store);
  }

  async replaceAll(collection: CollectionName, records: { id: string }[]) {
    const store = this.tx(collection, 'readwrite');
    store.clear();
    records.forEach((r) => store.put(r));
    await this.done(store);
  }

  async setKV(key: string, value: unknown) {
    const store = this.tx(KV_STORE, 'readwrite');
    if (value === undefined || value === null) store.delete(key);
    else store.put(value, key);
    await this.done(store);
  }

  async clear() {
    for (const name of COLLECTIONS) {
      const store = this.tx(name, 'readwrite');
      store.clear();
      await this.done(store);
    }
    const kv = this.tx(KV_STORE, 'readwrite');
    kv.clear();
    await this.done(kv);
  }
}

/* ── localStorage fallback ─────────────────────────────────────────── */

const LS_KEY = LS_SNAPSHOT;

interface LSShape {
  collections: Record<string, { id: string }[]>;
  kv: Record<string, unknown>;
}

class LocalStorageAdapter implements PersistenceAdapter {
  readonly kind: StorageKind;
  private data: LSShape = { collections: {}, kv: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(kind: StorageKind = 'localstorage') {
    this.kind = kind;
    if (kind === 'localstorage') {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) this.data = JSON.parse(raw) as LSShape;
      } catch {
        this.data = { collections: {}, kv: {} };
      }
    }
  }

  /** Whole-snapshot writes are coarse, so they are coalesced. */
  private flush() {
    if (this.kind !== 'localstorage') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.data));
      } catch {
        /* Out of quota: memory stays authoritative for this session. */
      }
    }, 250);
  }

  private list(collection: CollectionName) {
    this.data.collections[collection] ??= [];
    return this.data.collections[collection];
  }

  async loadAll() {
    const out: Record<string, unknown> = {};
    for (const name of COLLECTIONS) out[name] = this.list(name);
    return { ...(out as Partial<DatabaseSnapshot>), kv: this.data.kv };
  }

  async put(collection: CollectionName, record: { id: string }) {
    const list = this.list(collection);
    const i = list.findIndex((r) => r.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
    this.flush();
  }

  async putMany(collection: CollectionName, records: { id: string }[]) {
    for (const record of records) await this.put(collection, record);
  }

  async remove(collection: CollectionName, id: string) {
    this.data.collections[collection] = this.list(collection).filter((r) => r.id !== id);
    this.flush();
  }

  async replaceAll(collection: CollectionName, records: { id: string }[]) {
    this.data.collections[collection] = records.slice();
    this.flush();
  }

  async setKV(key: string, value: unknown) {
    if (value === undefined || value === null) delete this.data.kv[key];
    else this.data.kv[key] = value;
    this.flush();
  }

  async clear() {
    this.data = { collections: {}, kv: {} };
    this.flush();
  }
}

/* ── Selection ─────────────────────────────────────────────────────── */

let adapter: PersistenceAdapter | null = null;

export async function getAdapter(): Promise<PersistenceAdapter> {
  if (adapter) return adapter;

  if (typeof indexedDB !== 'undefined') {
    try {
      adapter = new IndexedDBAdapter(await openDatabase());
      return adapter;
    } catch {
      /* Fall through to localStorage. */
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_PROBE, '1');
      localStorage.removeItem('personal-gym-os:probe');
      adapter = new LocalStorageAdapter('localstorage');
      return adapter;
    }
  } catch {
    /* Fall through to memory. */
  }

  adapter = new LocalStorageAdapter('memory');
  return adapter;
}

/** Test seam: lets a test or a reset swap the adapter. */
export function __setAdapter(next: PersistenceAdapter | null) {
  adapter = next;
}
