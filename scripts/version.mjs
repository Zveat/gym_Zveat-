/**
 * Записывает отпечаток сборки в public/version.json.
 *
 * ЗАЧЕМ. На телефоне приложение почти никогда не загружается заново: его
 * сворачивают и разворачивают, страница та же. Выкаченная правка может не
 * доехать до человека неделями, и он об этом не узнает — просто «у меня не
 * так, как ты говоришь». Разбираться в этом по скриншотам можно очень долго:
 * по картинке сборку не видно вообще, и обе стороны спорят вслепую.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ SERVICE WORKER. Механизм браузера «нашлось
 * обновление» завязан на то, что изменился сам файл sw.js. Наш sw.js от сборки
 * к сборке не меняется ни на байт, поэтому updatefound не наступает никогда,
 * сколько ни выкатывай. Проверять надо не его.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: перезагрузки. Она выкинула бы человека с середины
 * тренировки, а незаписанный подход дороже свежей сборки. Решение — за
 * человеком.
 *
 * Идея и обоснование взяты из titovstroy/src/appVersion.js.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Короткий SHA коммита. На Vercel .git может быть недоступен, поэтому сначала
 * смотрим переменные окружения сборщика, а git — как запасной путь.
 */
function buildId() {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Ни CI, ни git — сборка из архива. Времени достаточно, чтобы отличить
    // одну сборку от другой, а это единственное, что от отпечатка требуется.
    return `t${Date.now().toString(36)}`;
  }
}

const version = { build: buildId(), builtAt: new Date().toISOString() };

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public/version.json'), `${JSON.stringify(version, null, 2)}\n`);

console.log(`[gym-os] сборка ${version.build} (${version.builtAt})`);
