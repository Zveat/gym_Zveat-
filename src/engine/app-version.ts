/**
 * Есть ли на сервере сборка свежее той, что сейчас открыта.
 *
 * Приложение на телефоне не перезагружается: его сворачивают и разворачивают,
 * страница та же. Правка может не доехать неделями, и человек об этом не
 * узнает — просто «у меня не так, как ты говоришь». Разбирать это по
 * скриншотам бесполезно: сборку на картинке не видно, и обе стороны спорят
 * вслепую.
 *
 * Сравниваем отпечаток: свой вшит в сборку (`NEXT_PUBLIC_BUILD_ID`), серверный
 * лежит в `/version.json`, который перезаписывается каждой сборкой. Разошлись —
 * на сервере другая.
 *
 * Перезагрузки здесь нет: она выкинула бы человека с середины тренировки, а
 * незаписанный подход дороже свежей сборки. Решение — за человеком.
 *
 * Идея и обоснование — из titovstroy/src/appVersion.js.
 */

/** Отпечаток этой сборки. `dev` — сборки нет, проверять нечего. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

/** Чаще раза в минуту ходить незачем: приложение разворачивают десятки раз. */
export const CHECK_EVERY_MS = 60_000;

export function shouldCheck(
  now: number,
  lastCheckedAt: number | null,
  everyMs = CHECK_EVERY_MS,
): boolean {
  return !lastCheckedAt || now - lastCheckedAt >= everyMs;
}

/**
 * Разные отпечатки — значит на сервере другая сборка. Пустое или `dev` с любой
 * стороны — молчим: в разработке отпечатка нет, и повода дёргать человека тоже.
 */
export function isNewer(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  if (current === 'dev' || latest === 'dev') return false;
  return current !== latest;
}

/** Отпечаток из тела `/version.json`. Мусор и пустота — пустая строка. */
export function parseVersion(body: unknown): string {
  if (typeof body === 'string') {
    try {
      return parseVersion(JSON.parse(body));
    } catch {
      return '';
    }
  }
  if (!body || typeof body !== 'object') return '';
  const build = (body as { build?: unknown }).build;
  return typeof build === 'string' ? build : '';
}

/**
 * Спрашиваем сервер. Любая осечка (нет сети, сервер молчит, вернулся HTML
 * вместо JSON) — тихо «не знаю»: это фоновая проверка, ронять из-за неё
 * что-либо нельзя.
 */
export async function fetchLatestBuild(
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string> {
  try {
    // Запрос с меткой времени и `no-store`: иначе ответ отдаст кэш, и проверка
    // будет вечно сравнивать сборку сама с собой.
    const res = await fetchImpl(`/version.json?v=${now}`, { cache: 'no-store' });
    if (!res || !res.ok) return '';
    return parseVersion(await res.json());
  } catch {
    return '';
  }
}
