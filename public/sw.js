/**
 * Offline cache for Personal Gym OS.
 *
 * Gym Wi-Fi is unreliable, so the app must open and run with no network at
 * all. Strategy:
 *   - navigations: network first, fall back to the cached shell (the app is a
 *     single client-side bundle, so any cached document boots it)
 *   - static assets: cache first, then network
 *   - everything else: passthrough
 *
 * Workout data never goes through here — it lives in IndexedDB.
 */

/**
 * Версия кэша берётся из адреса регистрации (`/sw.js?v=<сборка>`).
 *
 * Браузер считает обновлением только изменившийся ФАЙЛ sw.js. Этот файл от
 * сборки к сборке не меняется ни на байт, поэтому с постоянной версией
 * `updatefound` не наступал никогда, а статика отдавалась из кэша прошлой
 * сборки сколько угодно долго. Разный адрес — разный скрипт для браузера, и
 * заодно готовое имя кэша, которое меняется вместе со сборкой.
 */
const VERSION = `gym-os-${new URL(self.location.href).searchParams.get('v') || 'v1'}`;
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(css|js|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(request)) ??
            (await cache.match('/')) ??
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
        return response;
      }),
    );
  }
});
