import type { BodyWeightLog } from '@/domain/types';

/**
 * СОСТАВ ТЕЛА ИЗ ДВУХ ЦИФР.
 *
 * Весы показывают двадцать значений, но почти все они выводятся друг из
 * друга. На настоящем отчёте владельца это видно точно:
 *
 *   масса жира      = 85,2 × 26,0%        = 22,2 кг   (весы: 22,2)
 *   сухая масса     = 85,2 − 22,2         = 63,0 кг   (весы: 63)
 *   мышечная масса  = 63,0 − 3,4 (кости)  = 59,6 кг   (весы: 59,6)
 *
 * Поэтому руками вводятся ВЕС и ПРОЦЕНТ ЖИРА, остальное считается. Вводить
 * то, что выводится, — это лишняя работа на каждом взвешивании и ещё один
 * источник расхождений.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Вода, белок, минералы и скелетные мышцы приходят
 * из той же одной модели биоимпеданса, что и процент жира: у владельца вода
 * «упала» на 2,1% за пять дней — это не вода ушла, это состояние на момент
 * замера. Добавлять ещё три цифры из одного шумного измерения значит
 * добавлять шум, а не точность. ИМТ врёт на человеке с 60 кг мышц,
 * «рекомендуемый вес» советует сбросить 19 кг во время набора, «оценка тела»
 * считается по неопубликованной формуле — ни одно из этих чисел не отвечает
 * ни на один вопрос.
 */

/** Масса жира, кг. `null` — процент жира не записан. */
export function fatMass(log: BodyWeightLog): number | null {
  const pct = log.bodyFatPercent;
  if (pct === null || pct === undefined) return null;
  return Math.round(log.weight * (pct / 100) * 10) / 10;
}

/** Сухая масса (всё, кроме жира), кг. `null` — процент жира не записан. */
export function leanMass(log: BodyWeightLog): number | null {
  const fat = fatMass(log);
  if (fat === null) return null;
  return Math.round((log.weight - fat) * 10) / 10;
}

export interface CompositionChange {
  days: number;
  /** Насколько изменился вес, кг. */
  weight: number;
  /** Сколько из этого пришло жиром, кг. */
  fat: number;
  /** Сколько сухой массой, кг. */
  lean: number;
}

/**
 * ГЛАВНОЕ ЧИСЛО: чем именно набран или сброшен вес.
 *
 * «+2,1 кг» ничего не говорит о том, правильно ли идёт набор. «+2,1 кг, из
 * них жир +1,6» — говорит всё. Считается только когда процент жира есть на
 * ОБОИХ концах: с одним замером разложить изменение не на что.
 */
export function compositionChange(
  from: BodyWeightLog,
  to: BodyWeightLog,
): CompositionChange | null {
  const fromFat = fatMass(from);
  const toFat = fatMass(to);
  const fromLean = leanMass(from);
  const toLean = leanMass(to);
  if (fromFat === null || toFat === null || fromLean === null || toLean === null) return null;

  const days = Math.round(
    (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
  );

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    days,
    weight: round(to.weight - from.weight),
    fat: round(toFat - fromFat),
    lean: round(toLean - fromLean),
  };
}

/**
 * Словами: чем набран вес. Ровно одна фраза, потому что она встаёт под
 * вердикт по скорости и вторая строка там уже не читается.
 *
 * ПОРОГ ШУМА. 200 граммов, а не 100: сами величины округлены до 0,1 кг,
 * поэтому порог в 0,1 равен шагу округления и не отсекает ничего — любое
 * шевеление весов даёт ровно 0,1 и проходит проверку. Плюс процент жира с
 * биоимпедансных весов гуляет сильнее этого сам по себе: у владельца «вода»
 * за пять дней изменилась на 2,1%, и тот же шум сидит в проценте жира.
 * Объявлять «набрано сухой массой» из-за 100 граммов нельзя.
 */
export const COMPOSITION_NOISE_KG = 0.2;

export function describeComposition(change: CompositionChange): string {
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
  const fat = `жир ${signed(change.fat)} кг`;
  const lean = `сухая ${signed(change.lean)} кг`;

  if (Math.abs(change.fat) < COMPOSITION_NOISE_KG && Math.abs(change.lean) < COMPOSITION_NOISE_KG) {
    return 'Состав тела не изменился.';
  }
  return `Из них ${fat}, ${lean}.`;
}
