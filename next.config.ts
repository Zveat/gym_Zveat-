import type { NextConfig } from 'next';

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
};

export default nextConfig;
