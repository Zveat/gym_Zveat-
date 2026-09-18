import { describe, expect, it } from 'vitest';
import type { BodyWeightLog } from '@/domain/types';
import { bodyWeightVerdict } from './analytics';
import {
  compositionChange,
  compositionVerdict,
  describeComposition,
  fatMass,
  implausibleFatDrift,
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

/**
 * ДВА ПОРОГА ДОВЕРИЯ.
 *
 * Владелец сказал прямо: проценту жира он не верит — «сейчас взвесился и уже
 * данные 86,1 вес, жир 22,6 за 3 дня» против 26,0 тремя днями раньше. Это
 * −3,4 пункта, то есть 2,9 кг жира за три дня при РАСТУЩЕМ весе. Так не
 * бывает, и приложение теперь тоже это знает.
 */
describe('приложение не раскладывает шум', () => {
  it('ловит невозможный скачок процента жира', () => {
    const drift = implausibleFatDrift(log('2026-09-12', 85.2, 26.0), log('2026-09-15', 86.1, 22.6), 3)!;
    expect(drift.points).toBe(-3.4);
    // 3,4 пункта за 3 дня — это 7,9 пункта в неделю.
    expect(drift.perWeek).toBe(7.9);
  });

  it('не придирается к движению в пределах возможного', () => {
    // Пункт за две недели — полпункта в неделю, это реальный темп.
    expect(implausibleFatDrift(log('2026-09-01', 85, 26), log('2026-09-15', 84, 25), 14)).toBeNull();
  });

  it('на настоящих цифрах владельца говорит, что это разброс весов', () => {
    const v = compositionVerdict(log('2026-09-12', 85.2, 26.0), log('2026-09-15', 86.1, 22.6))!;
    expect(v.kind).toBe('noisy');
    const line = v.text;
    expect(line).toContain('26.0% → 22.6%');
    expect(line).toContain('−3.4 пункта');
    expect(line).toContain('7.9 в неделю');
    expect(line).toContain('разброс весов');
    // И главное: никакого расклада на жир и мышцы здесь нет.
    expect(line).not.toContain('Из них');
  });

  it('на коротком промежутке называет порог, а не выдумывает расклад', () => {
    // Движение по жиру нормальное (0,3 пункта за 5 дней), но пяти дней мало.
    const v = compositionVerdict(log('2026-09-10', 84.0, 25.7), log('2026-09-15', 85.2, 26.0))!;
    expect(v.kind).toBe('short-span');
    const line = v.text;
    expect(line).toContain('от 14 дней');
    expect(line).toContain('здесь 5 дней');
    expect(line).not.toContain('Из них');
  });

  it('с двух недель раскладывает как раньше', () => {
    const v = compositionVerdict(log('2026-09-01', 85, 26), log('2026-09-15', 83, 24))!;
    expect(v.kind).toBe('split');
    expect(v.text).toBe('Из них жир −2.2 кг, сухая +0.2 кг.');
  });

  it('без процента жира строки нет вообще', () => {
    expect(compositionVerdict(log('2026-09-01', 85), log('2026-09-15', 83))).toBeNull();
  });
});

describe('вердикт по цели использует состав', () => {
  it('на наборе с двух недель добавляет строку про жир', () => {
    const v = bodyWeightVerdict(
      [log('2026-09-01', 83.1, 25.7), log('2026-09-15', 85.2, 26.0)],
      'bulk',
      new Date('2026-09-15T12:00:00'),
    );
    // +2,1 за 14 дней = +1,05 кг/нед, это за коридором 0,2…0,6.
    expect(v.kind).toBe('fast');
    expect(v.composition).toBe('Из них жир +0.8 кг, сухая +1.3 кг.');
    expect(v.compositionKind).toBe('split');
  });

  it('за пять дней вердикт по скорости остаётся, а расклада нет', () => {
    const v = bodyWeightVerdict([FIVE_DAYS_AGO, NOW], 'bulk', new Date('2026-09-15T12:00:00'));
    // Скорость веса считается от 5 дней и по-прежнему считается.
    expect(v.kind).toBe('fast');
    expect(v.detail).toContain('+2.94 кг/нед');
    // А вот процент жира за эти пять дней прыгнул на 1,2 пункта — расклада не будет.
    expect(v.composition).not.toContain('Из них');
    expect(v.composition).toContain('разброс весов');
    expect(v.compositionKind).toBe('noisy');
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
      [log('2026-08-01', 80, 22), log('2026-09-01', 83.1, 25.7), log('2026-09-15', 85.2, 26.0)],
      'bulk',
      new Date('2026-09-15T12:00:00'),
    );
    // Окно скорости — 30 дней, значит 01.08 выпадает, и раскладывается
    // ровно тот же промежуток 01.09 → 15.09, а не весь август.
    expect(v.composition).toBe('Из них жир +0.8 кг, сухая +1.3 кг.');
  });

  it('когда оценивать нечего, состава тоже нет', () => {
    const v = bodyWeightVerdict([NOW], 'bulk', new Date('2026-09-15T12:00:00'));
    expect(v.kind).toBe('not-enough');
    expect(v.composition).toBeUndefined();
  });
});
