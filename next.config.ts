import { readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

/**
 * Отпечаток сборки, вшитый в клиент. Пишется `scripts/version.mjs` в
 * `prebuild`, поэтому к моменту чтения файл уже на месте; в `next dev` его
 * может не быть — тогда версия 'dev', и проверка обновлений молчит.
 */
function buildId(): string {
  try {
    return JSON.parse(readFileSync('./public/version.json', 'utf8')).build || 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * Personal Gym OS ships as a fully static, offline-capable PWA:
 * every screen runs client-side against IndexedDB, so there is no server to
 * depend on in the gym. `output: 'export'` keeps that honest — the build fails
 * if anything sneaks in a server dependency.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  typedRoutes: false,
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
};

export default nextConfig;
