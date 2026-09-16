'use client';

import { useEffect, useState } from 'react';
import { Button, Notice } from '@/components/ui/primitives';
import { BUILD_ID, CHECK_EVERY_MS, fetchLatestBuild, isNewer } from '@/engine/app-version';

/**
 * «На сервере другая сборка» — с кнопкой, а не с автоперезагрузкой.
 *
 * Перезагрузка посреди тренировки стоила бы незаписанного подхода, а это дороже
 * свежей сборки. Поэтому решение за человеком: кнопка перезагружает страницу с
 * пустым кэшем.
 *
 * Проверяем при возврате в приложение, а не по таймеру: телефон сворачивают и
 * разворачивают десятки раз за тренировку, и именно в этот момент дешевле всего
 * узнать, что правка доехала.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState('');

  useEffect(() => {
    let cancelled = false;
    let lastCheckedAt = 0;

    const check = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (lastCheckedAt && now - lastCheckedAt < CHECK_EVERY_MS) return;
      lastCheckedAt = now;
      const build = await fetchLatestBuild(fetch, now);
      if (!cancelled && build) setLatest(build);
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!isNewer(BUILD_ID, latest)) return null;

  return (
    <div
      className="mx-auto w-full max-w-lg px-4"
      style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
    >
      <Notice
        tone="accent"
        title="Есть новая версия"
        action={
          <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
            ОБНОВИТЬ
          </Button>
        }
      >
        Открыта сборка {BUILD_ID}, на сервере {latest}. Тренировка и записанные подходы
        сохранены — перезагрузка их не тронет.
      </Notice>
    </div>
  );
}
