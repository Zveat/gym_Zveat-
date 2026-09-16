'use client';

import { useEffect, useState } from 'react';
import { Button, Notice } from '@/components/ui/primitives';
import { LS_INSTALL_HINT_DISMISSED } from '@/data/storage-keys';

/**
 * Whether the app is running as an installed app or inside a browser tab, and
 * how much room the browser keeps for itself.
 *
 * This exists because "the bottom menu sits too high" has two completely
 * different causes that look identical in a screenshot. The tab bar is fixed
 * to `bottom: 0`, so it is always flush with the *viewport*; but in a Safari
 * tab the viewport ends ~78pt above the screen, and Safari's own toolbar
 * fills the gap, tinted with our `theme-color` so it reads as empty space.
 * Measuring on the device settles it instead of guessing from pixels.
 */
export interface DisplayModeInfo {
  standalone: boolean;
  /**
   * Screen height minus viewport height, in CSS px — the browser's own UI.
   * Meaningful on a phone, where browser chrome sits below the viewport. On a
   * desktop the difference is mostly the window not being maximised, which is
   * why `phone` gates every message that talks about it.
   */
  chrome: number;
  screenHeight: number;
  viewportHeight: number;
  /** What iOS reports for the home-indicator area. Zero in a Safari tab. */
  safeBottom: number;
  /** A touch device at phone width — the only place installing is the fix. */
  phone: boolean;
}

export function readDisplayMode(): DisplayModeInfo {
  const mq = (query: string) => window.matchMedia(query).matches;
  // iOS sets `navigator.standalone`; the media queries cover everything else.
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalone =
    legacy || mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)');

  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;height:env(safe-area-inset-bottom,0px);pointer-events:none';
  document.body.appendChild(probe);
  const safeBottom = Math.round(probe.getBoundingClientRect().height);
  probe.remove();

  const screenHeight = Math.round(window.screen.height);
  const viewportHeight = Math.round(window.innerHeight);
  return {
    standalone,
    chrome: Math.max(0, screenHeight - viewportHeight),
    screenHeight,
    viewportHeight,
    safeBottom,
    phone: navigator.maxTouchPoints > 0 && window.innerWidth <= 500,
  };
}

/** Reads on mount and after a resize, because Safari's toolbar collapses. */
export function useDisplayMode(): DisplayModeInfo | null {
  const [info, setInfo] = useState<DisplayModeInfo | null>(null);

  useEffect(() => {
    const read = () => setInfo(readDisplayMode());
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    return () => {
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
    };
  }, []);

  return info;
}

const DISMISSED = LS_INSTALL_HINT_DISMISSED;

/**
 * Shown only in a browser tab, and only when the browser is actually keeping a
 * meaningful strip for itself. Dismissible, because after the first read it is
 * noise.
 */
export function InstallHint() {
  const info = useDisplayMode();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Desktop browsers also report a gap (an unmaximised window), but there is
  // nothing to fix there, so the hint is limited to phones.
  if (dismissed || !info || info.standalone || !info.phone || info.chrome < 24) return null;

  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // A private window forgets it anyway; the hint is not worth failing over.
    }
  };

  return (
    <Notice
      tone="info"
      title="Снизу — панель браузера, не приложение"
      action={
        <Button size="sm" variant="outline" onClick={hide}>
          ПОНЯТНО
        </Button>
      }
    >
      Браузер занимает {info.chrome} pt внизу экрана, поэтому меню приложения выглядит
      приподнятым. Откройте «Поделиться» → «На экран «Домой»» и запускайте с иконки — панель
      исчезнет, и меню встанет вплотную к краю.
    </Notice>
  );
}
