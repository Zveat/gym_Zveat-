import { describe, expect, it } from 'vitest';
import {
  bodyWeightRate,
  bodyWeightStats,
  bodyWeightVerdict,
  GOAL_BANDS,
  MIN_RATE_SPAN_DAYS,
} from './analytics';
import type { BodyWeightLog } from '@/domain/types';

const NOW = new Date('2026-09-16T09:00:00Z');
const log = (date: string, weight: number): BodyWeightLog => ({ id: `bw_${date}`, date, weight });

describe('скорость изменения веса', () => {
  it('без второго взвешивания считать нечего', () => {
    expect(bodyWeightRate([log('2026-09-16', 84)], NOW)).toBeNull();
    expect(bodyWeightRate([], NOW)).toBeNull();
  });

  it('считает по фактическому промежутку, а не по номинальной неделе', () => {
    // 28 дней и +2 кг — это 0.5 кг в неделю. Если бы делили на 7, вышло бы 2.0
    // и вердикт сказал бы «слишком быстро» там, где всё в норме.
    const rate = bodyWeightRate([log('2026-08-19', 82), log('2026-09-16', 84)], NOW);
    expect(rate?.spanDays).toBe(28);
    expect(rate?.perWeek).toBe(0.5);
  });

  it('на промежутке короче пяти дней не считает — это вода, а не динамика', () => {
    expect(bodyWeightRate([log('2026-09-13', 84), log('2026-09-16', 85)], NOW)).toBeNull();
    // Ровно пять дней уже считаются.
    expect(bodyWeightRate([log('2026-09-11', 84), log('2026-09-16', 85)], NOW)).not.toBeNull();
  });

  it('берёт самую старую запись внутри окна', () => {
    const rate = bodyWeightRate(
      [log('2026-08-25', 83), log('2026-09-05', 83.5), log('2026-09-16', 84)],
      NOW,
    );
    expect(rate?.from.date).toBe('2026-08-25');
    expect(rate?.to.date).toBe('2026-09-16');
  });

  it('записи старше окна не берёт', () => {
    // Полгода назад — не про текущую динамику.
    expect(bodyWeightRate([log('2026-03-01', 70), log('2026-09-16', 84)], NOW)).toBeNull();
  });

  it('падающий вес — отрицательная скорость', () => {
    const rate = bodyWeightRate([log('2026-09-02', 86), log('2026-09-16', 84.6)], NOW);
    expect(rate?.perWeek).toBe(-0.7);
  });
});

describe('вердикт по цели', () => {
  const at = (logs: BodyWeightLog[], goal: 'bulk' | 'cut' | 'maintain') =>
    bodyWeightVerdict(logs, goal, NOW);

  it('без данных объясняет, чего именно не хватает', () => {
    const v = at([log('2026-09-16', 84)], 'bulk');
    expect(v.kind).toBe('not-enough');
    expect(v.detail).toContain('второе взвешивание');
  });

  it('короткий промежуток объясняет отдельно от «нет данных»', () => {
    const v = at([log('2026-09-14', 84), log('2026-09-16', 85)], 'bulk');
    expect(v.kind).toBe('not-enough');
    expect(v.detail).toContain(String(MIN_RATE_SPAN_DAYS));
  });

  it('набор в коридоре — идёте по плану', () => {
    // +0.4 кг/нед при коридоре 0.2…0.6
    const v = at([log('2026-09-02', 83.2), log('2026-09-16', 84)], 'bulk');
    expect(v.kind).toBe('ok');
    expect(v.detail).toContain('+0.40 кг/нед');
    // Промежуток со склонением и без лишней точки: было «за 14 дн..».
    expect(v.detail).toContain('за 14 дней');
    expect(v.detail).not.toContain('..');
  });

  it('промежуток склоняется по-русски', () => {
    expect(at([log('2026-09-15', 84), log('2026-09-16', 84)], 'bulk').kind).toBe('not-enough');
    expect(at([log('2026-09-11', 83.8), log('2026-09-16', 84)], 'bulk').detail).toContain('за 5 дней');
    expect(at([log('2026-09-05', 83.4), log('2026-09-16', 84)], 'bulk').detail).toContain('за 11 дней');
    expect(at([log('2026-09-15', 84), log('2026-09-16', 84)], 'maintain').kind).toBe('not-enough');
  });

  it('набор быстрее коридора — «слишком быстро» с числом', () => {
    const v = at([log('2026-09-02', 82), log('2026-09-16', 84.4)], 'bulk');
    expect(v.kind).toBe('fast');
    expect(v.detail).toContain(String(GOAL_BANDS.bulk.max));
  });

  it('набор почти без роста — «для набора мало»', () => {
    const v = at([log('2026-09-02', 84), log('2026-09-16', 84.1)], 'bulk');
    expect(v.kind).toBe('slow');
  });

  it('вес падает при цели «набор» — это не «мало», а обратная сторона', () => {
    const v = at([log('2026-09-02', 85), log('2026-09-16', 84)], 'bulk');
    expect(v.kind).toBe('wrong-way');
    expect(v.headline).toContain('падает');
  });

  it('сушка в коридоре — по плану', () => {
    // −0.7 кг/нед при коридоре −1.2…−0.4
    const v = at([log('2026-09-02', 85.4), log('2026-09-16', 84)], 'cut');
    expect(v.kind).toBe('ok');
  });

  it('сушка слишком быстрая — предупреждает про силу', () => {
    const v = at([log('2026-09-02', 88), log('2026-09-16', 84)], 'cut');
    expect(v.kind).toBe('fast');
    expect(v.detail).toContain('силу');
  });

  it('вес растёт при цели «сушка» — обратная сторона', () => {
    const v = at([log('2026-09-02', 83), log('2026-09-16', 84)], 'cut');
    expect(v.kind).toBe('wrong-way');
  });

  it('поддержание внутри коридора — вес держится', () => {
    const v = at([log('2026-09-02', 84.1), log('2026-09-16', 84)], 'maintain');
    expect(v.kind).toBe('ok');
    expect(v.headline).toBe('Вес держится');
  });

  it('поддержание с дрейфом вверх — говорит об этом', () => {
    const v = at([log('2026-09-02', 82), log('2026-09-16', 84)], 'maintain');
    expect(v.kind).toBe('fast');
    expect(v.headline).toContain('вверх');
  });

  it('одни и те же данные при разных целях дают разные вердикты', () => {
    // Смысл переключателя: без этого он не влиял ни на что.
    const logs = [log('2026-09-02', 83.2), log('2026-09-16', 84)];
    expect(at(logs, 'bulk').kind).toBe('ok');
    expect(at(logs, 'cut').kind).toBe('wrong-way');
    expect(at(logs, 'maintain').kind).toBe('fast');
  });
});

describe('изменение за период считается только по замерам внутри периода', () => {
  /**
   * НАСТОЯЩИЙ СЛУЧАЙ ВЛАДЕЛЬЦА. Замеры 1 августа (81 кг) и 15 сентября
   * (85,2 кг), сегодня 18 сентября. Плитка «7 дней» показывала +4,2 —
   * разницу за сорок пять дней, потому что бралась первая запись СТАРШЕ
   * отсечки, без ограничения по давности.
   */
  const TODAY = new Date('2026-09-18T12:00:00');
  const OWNER = [log('2026-08-01', 81), log('2026-09-15', 85.2)];

  it('не выдаёт разницу за 45 дней как изменение за 7', () => {
    expect(bodyWeightStats(OWNER, TODAY).change7d).toBeNull();
  });

  it('и за 30 тоже: 1 августа вне окна', () => {
    expect(bodyWeightStats(OWNER, TODAY).change30d).toBeNull();
  });

  it('последний замер при этом показывается', () => {
    expect(bodyWeightStats(OWNER, TODAY).latest?.weight).toBe(85.2);
  });

  it('когда в окне два замера — считает по ним', () => {
    const logs = [log('2026-09-13', 84), log('2026-09-17', 85)];
    expect(bodyWeightStats(logs, TODAY).change7d).toBe(1);
  });

  it('базой берёт САМЫЙ РАННИЙ замер окна, а не предпоследний', () => {
    const logs = [log('2026-09-13', 84), log('2026-09-15', 84.5), log('2026-09-17', 85)];
    // 85 − 84, а не 85 − 84.5.
    expect(bodyWeightStats(logs, TODAY).change7d).toBe(1);
  });

  it('за 30 дней окно шире, значит и база другая', () => {
    const logs = [log('2026-08-25', 82), log('2026-09-13', 84), log('2026-09-17', 85)];
    expect(bodyWeightStats(logs, TODAY).change7d).toBe(1);
    expect(bodyWeightStats(logs, TODAY).change30d).toBe(3);
  });

  it('один замер в окне — прочерк, а не ноль', () => {
    // Ноль читался бы как «вес не изменился», а он просто не измерялся.
    expect(bodyWeightStats([log('2026-09-17', 85)], TODAY).change7d).toBeNull();
  });
});
