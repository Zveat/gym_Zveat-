import { describe, expect, it, vi } from 'vitest';
import { fetchLatestBuild, isNewer, parseVersion, shouldCheck } from './app-version';

describe('отпечаток сборки', () => {
  it('читается из тела version.json', () => {
    expect(parseVersion({ build: '525c302', builtAt: '2026-09-16T03:55:16.062Z' })).toBe('525c302');
  });

  it('читается из строки, если fetch отдал текст', () => {
    expect(parseVersion('{"build":"abc1234"}')).toBe('abc1234');
  });

  it('на мусоре и пустоте не падает', () => {
    // Вместо JSON может прийти страница-заглушка хостинга или обрезанный ответ.
    for (const v of ['', null, undefined, 42, '<html></html>', {}, { build: 7 }, []]) {
      expect(parseVersion(v)).toBe('');
    }
  });
});

describe('сравнение сборок', () => {
  it('разные отпечатки — на сервере другая сборка', () => {
    expect(isNewer('525c302', 'a4196a7')).toBe(true);
  });

  it('одинаковые — молчим', () => {
    expect(isNewer('525c302', '525c302')).toBe(false);
  });

  it('пустое с любой стороны — молчим', () => {
    // Сервер не ответил. Сказать «есть обновление» было бы неправдой.
    expect(isNewer('525c302', '')).toBe(false);
    expect(isNewer('', '525c302')).toBe(false);
  });

  it('в разработке молчим', () => {
    // В `next dev` отпечатка нет, и дёргать разработчика баннером незачем.
    expect(isNewer('dev', '525c302')).toBe(false);
    expect(isNewer('525c302', 'dev')).toBe(false);
  });
});

describe('как часто спрашивать', () => {
  it('в первый раз — сразу', () => {
    expect(shouldCheck(1_000, null)).toBe(true);
  });

  it('раньше минуты — не ходим', () => {
    expect(shouldCheck(60_000, 30_000)).toBe(false);
  });

  it('через минуту — ходим', () => {
    expect(shouldCheck(90_000, 30_000)).toBe(true);
  });
});

describe('запрос к серверу', () => {
  it('обходит кэш, иначе сравнивал бы сборку сам с собой', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ build: 'a4196a7' }) });
    const build = await fetchLatestBuild(fetchImpl as unknown as typeof fetch, 12345);

    expect(build).toBe('a4196a7');
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/version.json?v=12345');
    expect(options).toEqual({ cache: 'no-store' });
  });

  it('сеть отвалилась — тихо «не знаю»', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(fetchLatestBuild(fetchImpl as unknown as typeof fetch)).resolves.toBe('');
  });

  it('сервер ответил ошибкой — тихо «не знаю»', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ build: 'x' }) });
    await expect(fetchLatestBuild(fetchImpl as unknown as typeof fetch)).resolves.toBe('');
  });

  it('вместо JSON пришёл HTML — тихо «не знаю»', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    await expect(fetchLatestBuild(fetchImpl as unknown as typeof fetch)).resolves.toBe('');
  });
});
