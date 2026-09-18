import type { BodyWeightLog } from '@/domain/types';
import { count, WORDS } from './format';

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

/**
 * СКОЛЬКО ДНЕЙ НУЖНО, ЧТОБЫ РАСКЛАД ЧТО-ТО ЗНАЧИЛ.
 *
 * Вес весы меряют точно, ±100 г. Процент жира — нет: погрешность
 * биоимпеданса около ±3 процентных пунктов, и суточные колебания от воды,
 * еды и времени замера дают ещё 1–3. За три дня реальный состав тела
 * меняется на десятые доли процента — то есть шум больше сигнала в
 * несколько раз.
 *
 * У владельца это вышло в чистом виде: 26,0% и через три дня 22,6%. Это
 * −3,4 пункта, то есть якобы 2,9 кг жира за три дня при РАСТУЩЕМ весе.
 * Разложение такой разницы на «жир» и «сухую массу» — разложение шума.
 *
 * Поэтому у скорости веса свой порог (5 дней), а у расклада свой, больше.
 */
export const MIN_COMPOSITION_SPAN_DAYS = 14;

/**
 * Быстрее этого процент жира не меняется — значит это шум весов.
 *
 * Пункт в неделю уже очень быстро; всё, что выше, объясняется гидратацией и
 * условиями замера, а не жиром.
 */
export const MAX_PLAUSIBLE_FAT_DRIFT_PER_WEEK = 1;

/**
 * Скачок процента жира, которого не бывает. `null` — всё в пределах
 * возможного, говорить не о чем.
 */
export function implausibleFatDrift(
  from: BodyWeightLog,
  to: BodyWeightLog,
  days: number,
): { points: number; perWeek: number } | null {
  const a = from.bodyFatPercent;
  const b = to.bodyFatPercent;
  if (a == null || b == null || days <= 0) return null;

  const points = Math.round((b - a) * 10) / 10;
  const perWeek = (Math.abs(b - a) / days) * 7;
  if (perWeek <= MAX_PLAUSIBLE_FAT_DRIFT_PER_WEEK) return null;
  return { points, perWeek: Math.round(perWeek * 10) / 10 };
}

export function describeComposition(change: CompositionChange): string {
  const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;
  const fat = `жир ${signed(change.fat)} кг`;
  const lean = `сухая ${signed(change.lean)} кг`;

  if (Math.abs(change.fat) < COMPOSITION_NOISE_KG && Math.abs(change.lean) < COMPOSITION_NOISE_KG) {
    return 'Состав тела не изменился.';
  }
  return `Из них ${fat}, ${lean}.`;
}


/**
 * ОДНА СТРОКА ПОД ВЕРДИКТОМ: либо расклад, либо честная причина, почему его
 * здесь нет. `null` — процента жира нет хотя бы на одном конце, тогда и
 * говорить не о чем: строка не появляется вовсе.
 *
 * Порядок проверок именно такой. Сначала — не врут ли сами весы: скачок в
 * три пункта за три дня остаётся скачком и на промежутке в месяц, и
 * раскладывать его нельзя ни при каком числе дней. Потом — хватает ли
 * промежутка. И только после этого считается сам расклад.
 */
export interface CompositionVerdict {
  /**
   * `split` — расклад посчитан, ему можно верить.
   * `noisy` — весы дали скачок по жиру, которого не бывает.
   * `short-span` — промежутка мало, чтобы разложение что-то значило.
   *
   * Экрану это нужно, чтобы не набирать причину тем же жирным шрифтом, что
   * и сам расклад: одно — вывод, другое — объяснение, почему вывода нет.
   */
  kind: 'split' | 'noisy' | 'short-span';
  text: string;
}

export function compositionVerdict(from: BodyWeightLog, to: BodyWeightLog): CompositionVerdict | null {
  const change = compositionChange(from, to);
  if (!change) return null;

  const drift = implausibleFatDrift(from, to, change.days);
  if (drift) {
    const a = (from.bodyFatPercent as number).toFixed(1);
    const b = (to.bodyFatPercent as number).toFixed(1);
    const moved = `${drift.points > 0 ? '+' : '−'}${Math.abs(drift.points).toFixed(1)}`;
    return {
      kind: 'noisy',
      text:
        `Жир по весам ${a}% → ${b}% за ${count(change.days, WORDS.day)}: ${moved} пункта, ` +
        `${drift.perWeek.toFixed(1)} в неделю. Так быстро жир не меняется — это разброс весов, ` +
        'а не состав тела, и раскладывать по нему нечего.',
    };
  }

  if (change.days < MIN_COMPOSITION_SPAN_DAYS) {
    return {
      kind: 'short-span',
      text:
        `Расклад на жир и мышцы считается от ${MIN_COMPOSITION_SPAN_DAYS} дней между ` +
        `взвешиваниями, здесь ${count(change.days, WORDS.day)}: процент жира гуляет сильнее, ` +
        'чем за это время меняется состав.',
    };
  }

  return { kind: 'split', text: describeComposition(change) };
}
