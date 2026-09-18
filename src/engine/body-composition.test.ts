import { describe, expect, it } from 'vitest';
import type { BodyWeightLog } from '@/domain/types';
import { bodyWeightVerdict } from './analytics';
import {
  compositionChange,
  describeComposition,
  fatMass,
  leanMass,
} from './body-composition';

const log = (
  date: string,
  weight: number,
  bodyFatPercent?: number,
  visceralFat?: number,
): BodyWeightLog => ({
  id: `bw-${date}`,
  date,
  weight,
  ...(bodyFatPercent !== undefined ? { bodyFatPercent } : {}),
  ...(visceralFat !== undefined ? { visceralFat } : {}),
});

/**
 * НАСТОЯЩИЙ ОТЧЁТ ВЕСОВ ВЛАДЕЛЬЦА, 15.09.2026.
 *
 * 85,2 кг · жир 26,0% · масса жира 22,2 · безжировая 63 · мышечная 59,6 ·
 * кости 3,4 · висцеральный 10. Пять дней назад было 83,1 кг и 24,8%.
 * Числа взяты с экрана, а не придуманы: на них проверяется, что расчёт
 * совпадает с тем, что человек видит на весах.
 */
const NOW = log('2026-09-15', 85.2, 26.0, 10);
const FIVE_DAYS_AGO = log('2026-09-10', 83.1, 24.8);

describe('масса жира и сухая масса совпадают с отчётом весов', () => {
  it('масса жира: 85,2 × 26,0% = 22,2', () => {
    expect(fatMass(NOW)).toBe(22.2);
  });

  it('сухая масса: 85,2 − 22,2 = 63', () => {
    expect(leanMass(NOW)).toBe(63);
  });

  it('мышечная масса весов = сухая минус кости: 63 − 3,4 = 59,6', () => {
    // Не считаем её сами (костей мы не знаем), но проверяем, что расчёт
    // сходится с отчётом — иначе вводить процент жира бессмысленно.
    expect(leanMass(NOW)! - 3.4).toBeCloseTo(59.6, 1);
  });

  it('без процента жира не выдумывает состав', () => {
    expect(fatMass(log('2026-09-15', 85.2))).toBeNull();
    expect(leanMass(log('2026-09-15', 85.2))).toBeNull();
  });
});

describe('чем набран вес', () => {
  it('раскладывает +2,1 кг на жир и сухую массу', () => {
    const change = compositionChange(FIVE_DAYS_AGO, NOW)!;
    expect(change.days).toBe(5);
    expect(change.weight).toBe(2.1);
    // 22,2 − 20,6 = 1,6 жиром; 63 − 62,5 = 0,5 сухой.
    expect(change.fat).toBe(1.6);
    expect(change.lean).toBe(0.5);
  });

  it('жир плюс сухая дают полное изменение веса', () => {
    const c = compositionChange(FIVE_DAYS_AGO, NOW)!;
    expect(c.fat + c.lean).toBeCloseTo(c.weight, 1);
  });

  it('говорит словами, чем именно', () => {
    expect(describeComposition(compositionChange(FIVE_DAYS_AGO, NOW)!)).toBe(
      'Из них жир +1.6 кг, сухая +0.5 кг.',
    );
  });

  it('сушка: минус жиром — это то, что нужно', () => {
    const from = log('2026-09-01', 85, 26);
    const to = log('2026-09-15', 83, 24);
    const c = compositionChange(from, to)!;
    expect(c.weight).toBe(-2);
    expect(c.fat).toBeLessThan(0);
    expect(describeComposition(c)).toContain('жир −2.2 кг');
    // Сухая при этом даже выросла — именно это и хочется видеть.
    expect(c.lean).toBeGreaterThan(0);
  });

  it('молчит, если процента жира нет хотя бы на одном конце', () => {
    expect(compositionChange(log('2026-09-10', 83.1), NOW)).toBeNull();
    expect(compositionChange(FIVE_DAYS_AGO, log('2026-09-15', 85.2))).toBeNull();
  });

  it('изменение в пределах шума не объявляет составом', () => {
    // 100 граммов на бытовых весах — это шум, а не «набрал мышцей».
    const c = compositionChange(log('2026-09-10', 85.0, 26.0), log('2026-09-15', 85.05, 26.0))!;
    expect(describeComposition(c)).toBe('Состав тела не изменился.');
  });
});

describe('вердикт по цели использует состав', () => {
  it('на наборе добавляет строку про жир', () => {
    const v = bodyWeightVerdict([FIVE_DAYS_AGO, NOW], 'bulk', new Date('2026-09-15T12:00:00'));
    // +2,1 за 5 дней = +2,94 кг/нед, это далеко за коридором 0,2…0,6.
    expect(v.kind).toBe('fast');
    expect(v.composition).toBe('Из них жир +1.6 кг, сухая +0.5 кг.');
  });

  it('без процента жира вердикт работает как раньше и молчит про состав', () => {
    const v = bodyWeightVerdict(
      [log('2026-09-10', 83.1), log('2026-09-15', 85.2)],
      'bulk',
      new Date('2026-09-15T12:00:00'),
    );
    expect(v.kind).toBe('fast');
    expect(v.composition).toBeUndefined();
  });

  it('состав считается по тем же двум взвешиваниям, что и скорость', () => {
    const v = bodyWeightVerdict(
      [log('2026-08-01', 80, 22), FIVE_DAYS_AGO, NOW],
      'bulk',
      new Date('2026-09-15T12:00:00'),
    );
    // Окно скорости — 30 дней, значит 01.08 выпадает, и раскладывается
    // ровно тот же промежуток 10.09 → 15.09.
    expect(v.composition).toBe('Из них жир +1.6 кг, сухая +0.5 кг.');
  });

  it('когда оценивать нечего, состава тоже нет', () => {
    const v = bodyWeightVerdict([NOW], 'bulk', new Date('2026-09-15T12:00:00'));
    expect(v.kind).toBe('not-enough');
    expect(v.composition).toBeUndefined();
  });
});
