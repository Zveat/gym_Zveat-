'use client';

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentSingleTabManager,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { DatabaseSnapshot } from '@/domain/types';
import { COLLECTIONS, type CollectionName, type PersistenceAdapter } from './db';

/**
 * Firestore backend.
 *
 * Why Firestore rather than the Realtime Database the ERP uses: the web
 * Realtime Database SDK keeps its cache in memory only, so a reload in the gym
 * with no signal loses everything. Firestore's `persistentLocalCache` writes to
 * IndexedDB and queues writes until the connection returns — which is exactly
 * the behaviour the spec asks for (§45: work offline, sync when back online).
 *
 * The app therefore stays instant and offline-capable *and* the data lives on
 * a server. Same Firebase project, same console, same account.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/** Reads the config from the build environment; `null` = run purely on-device. */
export function readFirebaseConfig(): FirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId,
  };
}

export const isCloudConfigured = () => readFirebaseConfig() !== null;

interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let services: Services | null = null;

function getServices(): Services {
  if (services) return services;
  const config = readFirebaseConfig();
  if (!config) throw new Error('Firebase is not configured');

  const app = initializeApp(config);
  const auth = getAuth(app);
  // A workout must survive a reload, so the session is kept on the device.
  void setPersistence(auth, browserLocalPersistence);

  // Single-tab manager: the app is a phone PWA, and multi-tab coordination
  // costs a lock that can stall the first paint.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  });

  services = { app, auth, db };
  return services;
}

/* ── Auth ──────────────────────────────────────────────────────────── */

export interface Account {
  uid: string;
  email: string | null;
}

export function watchAccount(fn: (account: Account | null) => void): () => void {
  const { auth } = getServices();
  return onAuthStateChanged(auth, (user: User | null) => {
    fn(user ? { uid: user.uid, email: user.email } : null);
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { auth } = getServices();
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function register(email: string, password: string): Promise<void> {
  const { auth } = getServices();
  await createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOutAccount(): Promise<void> {
  const { auth } = getServices();
  await signOut(auth);
}

/** Firebase error codes are opaque; these are the ones a user can act on. */
export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Неверный адрес почты.';
    case 'auth/missing-password':
      return 'Введите пароль.';
    case 'auth/weak-password':
      return 'Пароль слишком короткий — нужно минимум 6 символов.';
    case 'auth/email-already-in-use':
      return 'Такая почта уже зарегистрирована. Войдите вместо регистрации.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Почта или пароль не подходят.';
    case 'auth/too-many-requests':
      return 'Слишком много попыток. Подождите немного.';
    case 'auth/network-request-failed':
      return 'Нет связи с сервером.';
    case 'auth/operation-not-allowed':
      return 'В Firebase не включён вход по почте и паролю.';
    default:
      return 'Не удалось выполнить вход.';
  }
}

/* ── Firestore adapter ─────────────────────────────────────────────── */

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
    return collection(getServices().db, 'users', this.uid, collectionName);
  }

  private metaDoc(key: string) {
    return doc(getServices().db, 'users', this.uid, 'meta', `${META_DOC}_${key}`);
  }

  async loadAll() {
    const result: Record<string, unknown> = {};
    await Promise.all(
      COLLECTIONS.map(async (name) => {
        const snapshot = await getDocs(this.path(name));
        result[name] = snapshot.docs.map((d) => d.data());
      }),
    );

    const meta = await getDocs(this.path('meta'));
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
      const batch = writeBatch(getServices().db);
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
      const batch = writeBatch(getServices().db);
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
        const batch = writeBatch(getServices().db);
        for (const d of existing.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
    }
  }

  /**
   * Live updates from other devices. Only whole collections are watched —
   * the data is small, and a coarse signal keeps the merge logic in one place.
   */
  watch(collectionName: CollectionName, fn: (records: { id: string }[]) => void): () => void {
    return onSnapshot(
      this.path(collectionName),
      { includeMetadataChanges: false },
      (snapshot) => {
        // Local writes come back as echoes; skip them to avoid churn.
        if (snapshot.metadata.hasPendingWrites) return;
        fn(snapshot.docs.map((d) => d.data() as { id: string }));
      },
      (error) => console.error('[gym-os] firestore watch failed', error),
    );
  }
}
