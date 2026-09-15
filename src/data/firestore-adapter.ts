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
  type CollectionChange,
  type CollectionName,
  type PersistenceAdapter,
} from './db';
import { getFirebaseApp } from './firebase-app';

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

  /**
   * Reads the device's cache first and only asks the server when the cache has
   * nothing. The cache is authoritative enough to open the app: whatever the
   * server knows that the cache does not arrives moments later through the
   * live subscriptions. Waiting for a round trip before first paint is what
   * made opening the app feel slow, especially on gym Wi-Fi.
   */
  private async read(name: string): Promise<QuerySnapshot<DocumentData>> {
    try {
      const cached = await getDocsFromCache(this.path(name));
      if (!cached.empty) return cached;
    } catch {
      // No cache yet (first run on this device, or storage unavailable).
    }
    return getDocs(this.path(name));
  }

  async loadAll() {
    const result: Record<string, unknown> = {};
    const [, meta] = await Promise.all([
      Promise.all(
        COLLECTIONS.map(async (name) => {
          const snapshot = await this.read(name);
          result[name] = snapshot.docs.map((d) => d.data());
        }),
      ),
      this.read('meta'),
    ]);

    const kv: Record<string, unknown> = {};
    meta.docs.forEach((d) => {
      const key = d.id.startsWith(`${META_DOC}_`) ? d.id.slice(META_DOC.length + 1) : d.id;
      kv[key] = (d.data() as { value?: unknown }).value;
    });

    return { ...(result as Partial<DatabaseSnapshot>), kv };
  }

  async put(collectionName: CollectionName, record: { id: string }) {
    await setDoc(doc(this.path(collectionName), record.id), record);
  }

  async putMany(collectionName: CollectionName, records: { id: string }[]) {
    // Firestore batches cap at 500 writes; imports can exceed that.
    for (let i = 0; i < records.length; i += 400) {
      const batch = writeBatch(getDb());
      for (const record of records.slice(i, i + 400)) {
        batch.set(doc(this.path(collectionName), record.id), record);
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
    await setDoc(this.metaDoc(key), { value });
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
