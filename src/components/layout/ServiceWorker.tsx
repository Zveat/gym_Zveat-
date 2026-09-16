'use client';

import { useEffect } from 'react';
import { BUILD_ID } from '@/engine/app-version';

/** Registers the offline cache. Failure is silent: the app works either way. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      // Отпечаток в адресе: без него браузер не видит, что вышла новая
      // сборка, и держит кэш прошлой.
      navigator.serviceWorker.register(`/sw.js?v=${BUILD_ID}`).catch(() => {
        /* Offline caching unavailable — the app still runs from memory. */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
