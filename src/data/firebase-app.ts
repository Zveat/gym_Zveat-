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

/**
 * Firebase project and sign-in.
 *
 * Deliberately separate from the Firestore adapter: this module is on the
 * critical path — nothing can be shown before the app knows who is signed in —
 * while the database layer weighs three times as much and is only needed once
 * an account exists. Keeping them apart is what lets the first screen appear
 * without waiting for the database code to arrive.
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

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** The Firebase app, created once. Shared with the Firestore adapter. */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = readFirebaseConfig();
  if (!config) throw new Error('Firebase is not configured');
  app = initializeApp(config);
  return app;
}

function getServices(): { auth: Auth } {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    // A workout must survive a reload, so the session is kept on the device.
    void setPersistence(auth, browserLocalPersistence);
  }
  return { auth };
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
