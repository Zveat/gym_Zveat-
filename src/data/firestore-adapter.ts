'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentSingleTabManager,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { DatabaseSnapshot } from '@/domain/types';
import {
  COLLECTIONS,
  stripUndefined,
  type CollectionChange,
  type CollectionName,
  type PersistenceAdapter,
} from './db';
import { getFirebaseApp } from './firebase-app';
import { noteRead } from './read-meter';

/**
 * Firestore backend.
 *
 * Why Firestore rather than the Realtime Database the ERP uses: the web
 * Realtime Database SDK keeps its cache in memory only, so a reload in the gym
 * with no signal loses everything. Firestore's `persistentLocalCache` writes
 * to IndexedDB and queues writes until the connection returns — exactly the
 * behaviour the spec asks for (§45: work offline, sync when back online).
 *
 * The app therefore stays instant and offline-capable *and* the data lives on
 * a server.
 *
 * This module is loaded on demand, after sign-in: it is the largest piece of
 * the app, and the first screen must not wait for it.
 */

let db: Firestore | null = null;

function getDb(): Firestore {
  if (db) return db;
  // Single-tab manager: the app is a phone PWA, and multi-tab coordination
  // costs a lock that can stall the first paint.
  db = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
    /**
     * Second line of defence behind `stripUndefined`. Left at the default,
     * Firestore throws on an `undefined` field value, and because writes are
     * fire-and-forget that error only reached the console — the record showed
     * on screen and was gone on the next launch.
     */
    ignoreUndefinedProperties: true,
  });
  return db;
}

const META_DOC = 'state';

/**
 * Implements exactly the interface the local adapter does, so the store is
 * unchanged: it still writes one record per set save and never waits on the
 * network. Firestore's local cache answers reads and queues writes.
 */
export class FirestoreAdapter implements PersistenceAdapter {
  readonly kind = 'firestore' as const;

  constructor(private uid: string) {}

  private path(collectionName: string) {
    return collection(getDb(), 'users', this.uid, collectionName);
  }

  private metaDoc(key: string) {
    return doc(getDb(), 'users', this.uid, 'meta', `${META_DOC}_${key}`);
  }

  /** A cache read that reports a miss as `null` instead of throwing. */
  private async fromCache(name: string): Promise<QuerySnapshot<DocumentData> | null> {
    try {
      const snapshot = await getDocsFromCache(this.path(name));
      noteRead(name, 'cache', snapshot.size);
      return snapshot;
    } catch {
      // No cache yet (first run on this device, or storage unavailable).
      return null;
    }
  }

  /** Чтение с сервера — единственное, за которое платим. Всегда через счётчик. */
  private async fromServer(name: string): Promise<QuerySnapshot<DocumentData>> {
    const snapshot = await getDocs(this.path(name));
    noteRead(name, 'server', snapshot.size);
    return snapshot;
  }

  /**
   * Reads every collection, from the device's cache when the cache is warm.
   *
   * An empty cached collection is ambiguous: it means either "nothing there"
   * or "not cached yet". Treating it as a miss cost a network round trip per
   * empty collection on *every* launch — and a new account has four of them
   * (sessions, notes, painLogs, bodyWeightLogs), so opening the app always
   * waited on the network even though everything needed was already local.
   *
   * `programs` settles it without a flag to go stale: it is seeded on first
   * use and never empty afterwards, so a non-empty cached read proves the
   * cache is alive and every other collection can be answered from it. If it
   * comes back empty the cache is cold or was evicted, and everything is read
   * from the server as before.
   *
   * The cache is authoritative enough to open the app: whatever the server
   * knows that the cache does not arrives moments later through the live
   * subscriptions, which merge per record.
   */
  private async readAll(names: readonly string[]) {
    const programs = await this.fromCache('programs');
    const warm = programs !== null && !programs.empty;

    return Promise.all(
      names.map(async (name): Promise<[string, QuerySnapshot<DocumentData>]> => {
        if (warm) {
          if (name === 'programs') return [name, programs];
          const cached = await this.fromCache(name);
          if (cached) return [name, cached];
        }
        return [name, await this.fromServer(name)];
      }),
    );
  }

  async loadAll() {
    const result: Record<string, unknown> = {};
    const snapshots = await this.readAll([...COLLECTIONS, 'meta']);
    const byName = new Map(snapshots);
    for (const name of COLLECTIONS) {
      result[name] = byName.get(name)?.docs.map((d) => d.data()) ?? [];
    }

    const kv: Record<string, unknown> = {};
    byName.get('meta')?.docs.forEach((d) => {
      const key = d.id.startsWith(`${META_DOC}_`) ? d.id.slice(META_DOC.length + 1) : d.id;
      kv[key] = (d.data() as { value?: unknown }).value;
    });

    return { ...(result as Partial<DatabaseSnapshot>), kv };
  }

  async put(collectionName: CollectionName, record: { id: string }) {
    await setDoc(doc(this.path(collectionName), record.id), stripUndefined(record));
  }

  async putMany(collectionName: CollectionName, records: { id: string }[]) {
    // Firestore batches cap at 500 writes; imports can exceed that.
    for (let i = 0; i < records.length; i += 400) {
      const batch = writeBatch(getDb());
      for (const record of records.slice(i, i + 400)) {
        batch.set(doc(this.path(collectionName), record.id), stripUndefined(record));
      }
      await batch.commit();
    }
  }

  async remove(collectionName: CollectionName, id: string) {
    await deleteDoc(doc(this.path(collectionName), id));
  }

  async replaceAll(collectionName: CollectionName, records: { id: string }[]) {
    const existing = await getDocs(this.path(collectionName));
    const keep = new Set(records.map((r) => r.id));
    const stale = existing.docs.filter((d) => !keep.has(d.id));

    for (let i = 0; i < stale.length; i += 400) {
      const batch = writeBatch(getDb());
      for (const d of stale.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
    await this.putMany(collectionName, records);
  }

  async setKV(key: string, value: unknown) {
    if (value === undefined || value === null) {
      await deleteDoc(this.metaDoc(key));
      return;
    }
    await setDoc(this.metaDoc(key), stripUndefined({ value }));
  }

  async clear() {
    for (const name of [...COLLECTIONS, 'meta']) {
      const existing = await getDocs(this.path(name));
      for (let i = 0; i < existing.docs.length; i += 400) {
        const batch = writeBatch(getDb());
        for (const d of existing.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    }
  }

  /**
   * Live updates from other devices, delivered as *changes* rather than whole
   * collections.
   *
   * This matters for speed, not elegance: every set save is acknowledged by
   * the server, and replacing the entire session list on each acknowledgement
   * re-rendered the whole workout mid-set. Now a save that comes back
   * unchanged produces no change at all.
   */
  watch(collectionName: CollectionName, fn: (change: CollectionChange) => void): () => void {
    return onSnapshot(
      this.path(collectionName),
      { includeMetadataChanges: false },
      (snapshot) => {
        const upserted: { id: string }[] = [];
        const removed: string[] = [];

        // Подписка тоже читает документы и тоже за деньги, поэтому идёт в
        // счётчик — иначе «ноль чтений» после запуска было бы неправдой.
        noteRead(collectionName, 'watch', snapshot.docChanges().length);

        for (const change of snapshot.docChanges()) {
          // A document still being written locally is already in memory.
          if (change.doc.metadata.hasPendingWrites) continue;
          if (change.type === 'removed') removed.push(change.doc.id);
          else upserted.push(change.doc.data() as { id: string });
        }

        if (upserted.length || removed.length) fn({ upserted, removed });
      },
      (error) => console.error('[gym-os] firestore watch failed', error),
    );
  }
}
