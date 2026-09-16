/**
 * СКОЛЬКО ДОКУМЕНТОВ ЭТА ВКЛАДКА ПРОЧИТАЛА ИЗ БАЗЫ И ОТКУДА.
 *
 * ЗАЧЕМ. Firestore берёт деньги за чтение документов, а сколько их на самом
 * деле — из приложения не видно никак. Открытие приложения делало два полных
 * чтения базы по сети вместо нуля, и нашлось это только чтением кода: на
 * экране всё выглядело одинаково, разница была лишь в числе обращений. Такое
 * нельзя искать глазами по третьему разу.
 *
 * СЧИТАЕМ ТОЛЬКО ЧТЕНИЕ. Платим за него; записей мало и они дешёвые.
 *
 * РАЗДЕЛЯЕМ КЭШ И СЕТЬ. Это главное число: чтение из кэша бесплатно и мгновенно,
 * чтение из сети стоит денег и секунду на телефоне в зале. «20 документов» само
 * по себе не говорит ничего — важно, сколько из них пришло по сети.
 *
 * НИЧЕГО НЕ ПИШЕМ В БАЗУ. Счётчик живёт в памяти вкладки и умирает вместе с
 * ней, иначе измерительный прибор сам стал бы источником того, что измеряет.
 *
 * Идея и правила — из titovstroy/src/cloud/trafficMeter.js.
 */

export type ReadSource = 'cache' | 'server' | 'watch';

export interface ReadStat {
  collection: string;
  source: ReadSource;
  docs: number;
  calls: number;
}

export interface ReadTotals {
  docs: number;
  calls: number;
  /** Документы, пришедшие по сети — то, за что платим. */
  serverDocs: number;
  serverCalls: number;
  startedAt: number;
}

const stats = new Map<string, ReadStat>();
let startedAt = Date.now();

export function noteRead(collection: string, source: ReadSource, docs: number): void {
  const key = `${collection}:${source}`;
  const row = stats.get(key) ?? { collection, source, docs: 0, calls: 0 };
  row.docs += docs;
  row.calls += 1;
  stats.set(key, row);
}

/** Самые дорогие строки первыми: сеть выше кэша, внутри — по числу документов. */
export function readStats(): ReadStat[] {
  const weight = (s: ReadSource) => (s === 'server' ? 0 : s === 'watch' ? 1 : 2);
  return [...stats.values()].sort(
    (a, b) => weight(a.source) - weight(b.source) || b.docs - a.docs,
  );
}

export function readTotals(): ReadTotals {
  let docs = 0;
  let calls = 0;
  let serverDocs = 0;
  let serverCalls = 0;
  for (const row of stats.values()) {
    docs += row.docs;
    calls += row.calls;
    // Подписка тоже идёт по сети, но платится один раз за документ и приносит
    // только изменения — считаем её отдельно от разовых чтений.
    if (row.source === 'server') {
      serverDocs += row.docs;
      serverCalls += row.calls;
    }
  }
  return { docs, calls, serverDocs, serverCalls, startedAt };
}

/** Только для тестов и для кнопки «сбросить счётчик». */
export function resetReadMeter(now = Date.now()): void {
  stats.clear();
  startedAt = now;
}
