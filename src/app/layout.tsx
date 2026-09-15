import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/AppShell';
import { ServiceWorker } from '@/components/layout/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Personal Gym OS',
  description: 'Персональная операционная система для силовых тренировок.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Gym OS',
  appleWebApp: {
    capable: true,
    title: 'Gym OS',
    statusBarStyle: 'black-translucent',
  },
  /**
   * `appleWebApp.capable` only makes Next emit `mobile-web-app-capable`, the
   * standardised name. iOS reads `apple-mobile-web-app-capable`, and without
   * it a home-screen icon opens in a browser view with the Safari toolbar
   * still on screen — which pushes the bottom nav ~80pt up off the edge.
   * Emitted by hand because Next no longer emits it; `npm run test:e2e`
   * checks it is still in the built HTML.
   */
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // The app is a fixed dark surface; cover lets it sit under the notch.
  viewportFit: 'cover',
  themeColor: '#0b0b0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AppShell>{children}</AppShell>
        <ServiceWorker />
      </body>
    </html>
  );
}
