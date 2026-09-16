import { beforeEach, describe, expect, it } from 'vitest';
import { noteRead, readStats, readTotals, resetReadMeter } from './read-meter';

/**
 * Считает то, за что платят. Открытие приложения делало два полных чтения базы
 * по сети вместо нуля, и на экране это выглядело одинаково — разница была
 * только в числе обращений. Прибор нужен именно для такого.
 */
describe('счётчик чтений', () => {
  beforeEach(() => resetReadMeter(1_000));

  it('на старте пусто', () => {
    expect(readTotals()).toEqual({
      docs: 0, calls: 0, serverDocs: 0, serverCalls: 0, startedAt: 1_000,
    });
    expect(readStats()).toEqual([]);
  });

  it('разделяет кэш и сеть — это главное число', () => {
    noteRead('programs', 'cache', 1);
    noteRead('sessions', 'server', 12);

    const totals = readTotals();
    expect(totals.docs).toBe(13);
    // Платим только за сетевое: 12 из 13 документов.
    expect(totals.serverDocs).toBe(12);
    expect(totals.serverCalls).toBe(1);
  });

  it('складывает повторные чтения одной коллекции', () => {
    noteRead('sessions', 'server', 5);
    noteRead('sessions', 'server', 7);

    const row = readStats().find((r) => r.collection === 'sessions');
    expect(row).toEqual({ collection: 'sessions', source: 'server', docs: 12, calls: 2 });
  });

  it('не смешивает кэш и сеть по одной коллекции', () => {
    noteRead('sessions', 'cache', 3);
    noteRead('sessions', 'server', 4);
    expect(readStats().filter((r) => r.collection === 'sessions')).toHaveLength(2);
  });

  it('подписку считает отдельно от разовых чтений', () => {
    noteRead('sessions', 'watch', 2);
    const totals = readTotals();
    expect(totals.docs).toBe(2);
    // Подписка по сети, но платится иначе — в «за что платим сейчас» не идёт.
    expect(totals.serverDocs).toBe(0);
  });

  it('сетевые строки показывает первыми', () => {
    noteRead('programs', 'cache', 40);
    noteRead('notes', 'server', 1);
    expect(readStats()[0]).toMatchObject({ collection: 'notes', source: 'server' });
  });

  it('пустое чтение тоже обращение — его и искали', () => {
    // Пустая коллекция возвращала ноль документов, но стоила запроса по сети.
    noteRead('notes', 'server', 0);
    expect(readTotals()).toMatchObject({ docs: 0, calls: 1, serverCalls: 1 });
  });
});
