import { compositionVerdict, type CompositionVerdict } from './body-composition';
import type {
  BodyWeightGoal,
  Difficulty,
  BodyWeightLog,
  Exercise,
  ID,
  MuscleGroup,
  WorkoutSession,
} from '@/domain/types';
import { completedSessions, exerciseHistory, workoutStreak } from './history';
import { personalRecords } from './records';
import { DIFFICULTY_META, WORDS, count } from './format';
import { estimated1RM, isWorkingSet, sessionVolume, sessionWorkingSetCount, workingWeight } from './volume';

/** Inclusive `[start, end]` calendar window. */
export interface DateWindow {
  start: string;
  end: string;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-based week containing `now`. */
export function weekWindow(now: Date = new Date(), offsetWeeks = 0): DateWindow {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow + offsetWeeks * 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { start: iso(start), end: iso(end) };
}

export function inWindow(date: string, window: DateWindow): boolean {
  return date >= window.start && date <= window.end;
}

export function sessionsInWindow(
  sessions: WorkoutSession[],
  window: DateWindow,
): WorkoutSession[] {
  return completedSessions(sessions).filter((s) => inWindow(s.date, window));
}

export interface OverviewStats {
  workouts: number;
  totalVolume: number;
  totalSets: number;
  avgDurationSeconds: number;
  prCount: number;
  streak: number;
}

export function overviewStats(
  sessions: WorkoutSession[],
  window?: DateWindow,
  now: Date = new Date(),
): OverviewStats {
  const scope = window ? sessionsInWindow(sessions, window) : completedSessions(sessions);
  const totalVolume = scope.reduce((sum, s) => sum + sessionVolume(s), 0);
  const totalSets = scope.reduce((sum, s) => sum + sessionWorkingSetCount(s), 0);
  const withDuration = scope.filter((s) => s.durationSeconds > 0);
  const avg = withDuration.length
    ? withDuration.reduce((sum, s) => sum + s.durationSeconds, 0) / withDuration.length
    : 0;

  return {
    workouts: scope.length,
    totalVolume,
    totalSets,
    avgDurationSeconds: avg,
    prCount: countPRs(sessions, window),
    streak: workoutStreak(sessions, now),
  };
}

/**
 * PR count, walked forward in time so each record is only counted once, the
 * session it was actually set in. One per exercise per session: three
 * escalating sets in one workout are one new best, not three.
 */
export function countPRs(sessions: WorkoutSession[], window?: DateWindow): number {
  const chronological = completedSessions(sessions).slice().reverse();
  const best = new Map<ID, number>();
  let count = 0;

  for (const session of chronological) {
    const sessionBest = new Map<ID, number>();
    for (const entry of session.exercises) {
      for (const set of entry.sets) {
        if (!set.actual || set.setType === 'warmup') continue;
        const e1rm = estimated1RM(set.actual.weight, set.actual.reps);
        if (e1rm > (sessionBest.get(entry.exerciseId) ?? 0)) {
          sessionBest.set(entry.exerciseId, e1rm);
        }
      }
    }

    for (const [exerciseId, e1rm] of sessionBest) {
      const prior = best.get(exerciseId);
      if (prior === undefined) {
        // First time this exercise was ever trained: a baseline, not a record.
        best.set(exerciseId, e1rm);
        continue;
      }
      if (e1rm > prior) {
        best.set(exerciseId, e1rm);
        if (e1rm > prior + 0.01 && (!window || inWindow(session.date, window))) count += 1;
      }
    }
  }
  return count;
}

export interface MuscleGroupStat {
  muscle: MuscleGroup;
  workingSets: number;
  volume: number;
}

/**
 * Working sets per muscle group. Secondary muscles count as half a set, which
 * is the convention that keeps "back" from looking untrained on a row day.
 */
export function muscleGroupStats(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  window?: DateWindow,
): MuscleGroupStat[] {
  const library = new Map(exercises.map((e) => [e.id, e]));
  const scope = window ? sessionsInWindow(sessions, window) : completedSessions(sessions);
  const acc = new Map<MuscleGroup, MuscleGroupStat>();

  const bump = (muscle: MuscleGroup, sets: number, volume: number) => {
    const cur = acc.get(muscle) ?? { muscle, workingSets: 0, volume: 0 };
    cur.workingSets += sets;
    cur.volume += volume;
    acc.set(muscle, cur);
  };

  for (const session of scope) {
    for (const entry of session.exercises) {
      const sets = entry.sets.filter(isWorkingSet);
      if (!sets.length) continue;
      const volume = sets.reduce((v, s) => v + s.actual!.weight * s.actual!.reps, 0);
      bump(entry.primaryMuscle, sets.length, volume);
      const secondary = library.get(entry.exerciseId)?.secondaryMuscles ?? [];
      for (const muscle of secondary) bump(muscle, sets.length * 0.5, volume * 0.5);
    }
  }

  return [...acc.values()]
    .map((s) => ({ ...s, workingSets: Math.round(s.workingSets * 10) / 10 }))
    .sort((a, b) => b.workingSets - a.workingSets);
}

export interface VolumePoint {
  label: string;
  start: string;
  end: string;
  volume: number;
  workouts: number;
  sets: number;
}

/** Weekly volume series, oldest first — the Progress screen's main chart. */
export function weeklyVolumeSeries(
  sessions: WorkoutSession[],
  weeks = 8,
  now: Date = new Date(),
): VolumePoint[] {
  const out: VolumePoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const window = weekWindow(now, -i);
    const scope = sessionsInWindow(sessions, window);
    const d = new Date(window.start);
    out.push({
      label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      start: window.start,
      end: window.end,
      volume: scope.reduce((sum, s) => sum + sessionVolume(s), 0),
      workouts: scope.length,
      sets: scope.reduce((sum, s) => sum + sessionWorkingSetCount(s), 0),
    });
  }
  return out;
}

export interface Delta {
  current: number;
  previous: number;
  /** Percent change, `null` when there is no baseline to compare against. */
  percent: number | null;
}

export function delta(current: number, previous: number): Delta {
  if (previous <= 0) return { current, previous, percent: null };
  return { current, previous, percent: ((current - previous) / previous) * 100 };
}

export function weeklyVolumeDelta(sessions: WorkoutSession[], now: Date = new Date()): Delta {
  const thisWeek = sessionsInWindow(sessions, weekWindow(now, 0)).reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  const lastWeek = sessionsInWindow(sessions, weekWindow(now, -1)).reduce(
    (sum, s) => sum + sessionVolume(s),
    0,
  );
  return delta(thisWeek, lastWeek);
}

/* ── Per-exercise progression series ───────────────────────────────── */

export type ProgressionMetric = 'weight' | 'reps' | 'volume' | 'performance';

export const METRIC_LABEL: Record<ProgressionMetric, string> = {
  weight: 'Вес',
  reps: 'Повторения',
  volume: 'Объём',
  performance: 'Результат',
};

export interface ProgressionPoint {
  date: string;
  label: string;
  value: number;
}

export function progressionSeries(
  sessions: WorkoutSession[],
  exerciseId: ID,
  metric: ProgressionMetric,
): ProgressionPoint[] {
  const history = exerciseHistory(sessions, exerciseId).slice().reverse();
  return history.map((h) => {
    const d = new Date(h.date);
    const label = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    let value = 0;
    switch (metric) {
      case 'weight':
        value = workingWeight(h.entry) ?? h.topWeight;
        break;
      case 'reps':
        value = h.totalReps;
        break;
      case 'volume':
        value = h.volume;
        break;
      case 'performance':
        value = Math.round(h.bestEstimated1RM * 10) / 10;
        break;
    }
    return { date: h.date, label, value };
  });
}

/** Change over the last N days, for the "+20% LAST 30 DAYS" line. */
export function progressionDelta(
  points: ProgressionPoint[],
  days = 30,
  now: Date = new Date(),
): Delta {
  if (!points.length) return { current: 0, previous: 0, percent: null };
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = iso(cutoff);

  const recent = points.filter((p) => p.date >= cutoffIso);
  const current = recent.length ? recent[recent.length - 1].value : points[points.length - 1].value;
  const before = points.filter((p) => p.date < cutoffIso);
  const previous = before.length ? before[before.length - 1].value : (recent[0]?.value ?? current);
  return delta(current, previous);
}

/* ── Records overview & body weight ────────────────────────────────── */

export function allPersonalRecords(sessions: WorkoutSession[], exercises: Exercise[]) {
  const trained = new Set<ID>();
  for (const session of completedSessions(sessions)) {
    for (const entry of session.exercises) {
      if (entry.sets.some((s) => s.actual)) trained.add(entry.exerciseId);
    }
  }
  return [...trained]
    .map((id) => {
      const name = exercises.find((e) => e.id === id)?.name ?? id;
      return personalRecords(sessions, id, name);
    })
    .sort((a, b) => (b.bestPerformance?.value ?? 0) - (a.bestPerformance?.value ?? 0));
}

export interface BodyWeightStats {
  latest: BodyWeightLog | null;
  change7d: number | null;
  change30d: number | null;
}

/**
 * Скорость изменения веса — кг в неделю, посчитанная по РЕАЛЬНОМУ промежутку
 * между двумя взвешиваниями, а не по номинальным «7 дней».
 *
 * Это не придирка. Взвешиваются нерегулярно: если считать разницу с ближайшей
 * записью старше недели, а она окажется месячной давности, то «+2 кг» выдадутся
 * за недельный прирост, хотя это 0,5 кг в неделю. Вердикт на таком числе
 * сказал бы «слишком быстро» там, где всё в норме.
 *
 * Берём самую старую запись внутри окна и делим на фактические дни. Меньше
 * пяти дней — не считаем: дневные колебания воды дают ±1 кг, и на коротком
 * промежутке это шум, а не динамика.
 */
export interface BodyWeightRate {
  /** кг в неделю; отрицательное — вес падает. */
  perWeek: number;
  spanDays: number;
  from: BodyWeightLog;
  to: BodyWeightLog;
}

export const MIN_RATE_SPAN_DAYS = 5;

/**
 * Дальше этого промежутка «килограммы в неделю» уже не про текущую динамику:
 * между замерами полгода — это средняя по совершенно разным периодам. Нижний
 * порог отсекает воду, верхний — усреднение.
 */
export const MAX_RATE_SPAN_DAYS = 90;

export function bodyWeightRate(
  logs: BodyWeightLog[],
  now: Date = new Date(),
  windowDays = 30,
): BodyWeightRate | null {
  if (logs.length < 2) return null;

  const sorted = logs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const to = sorted[sorted.length - 1];

  const span = (from: BodyWeightLog) =>
    Math.round(
      (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
    );

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const earliest = iso(cutoff);

  /*
   * Окно в 30 дней — ПРЕДПОЧТЕНИЕ, а не условие.
   *
   * Раньше замер старше окна просто выбрасывался, и у человека, который
   * взвешивается редко, скорость не считалась вообще: 1 августа 81 кг и 16
   * сентября 84 кг давали «взвешиваний меньше двух» и подпись «между
   * взвешиваниями меньше 5 дней» — при фактическом промежутке 46 дней. То
   * есть приложение отказывалось считать по данным, которые у него есть, и
   * объясняло это неправдой.
   *
   * ТУ ЗАПЛАТКУ Я СДЕЛАЛ НА ДВА КАНДИДАТА — И ЭТОГО НЕ ХВАТИЛО. Кандидатами
   * были «самый старый в окне» и «предпоследний замер»; когда оба оказались
   * одним и тем же свежим замером, всё остальное не рассматривалось вообще.
   * На экране владельца это выглядело так: 1 августа 81 кг, 15 сентября
   * 85,2, сегодня 86,1 — и вердикт «Пока нечего оценивать, между
   * взвешиваниями 3 дня», при том что 48 дней и +5,1 кг лежат в той же
   * базе. Та же неправда, просто с третьим замером.
   *
   * Поэтому теперь рассматриваются ВСЕ замеры, а не два. Годным считается
   * любой, до которого от сегодняшнего от 5 до 90 дней; из годных берётся
   * самый старый ВНУТРИ окна (самый длинный свежий период — он точнее), а
   * если в окне годных нет — самый старый из оставшихся. Отказ считать
   * остаётся только там, где считать действительно не из чего.
   */
  const eligible = sorted.filter((l) => {
    if (l.date === to.date) return false;
    const days = span(l);
    return days >= MIN_RATE_SPAN_DAYS && days <= MAX_RATE_SPAN_DAYS;
  });

  const from = eligible.find((l) => l.date >= earliest) ?? eligible[0];
  if (!from) return null;

  const spanDays = span(from);
  return {
    perWeek: Math.round(((to.weight - from.weight) / spanDays) * 7 * 100) / 100,
    spanDays,
    from,
    to,
  };
}

/**
 * Фактический промежуток между двумя последними замерами, дней. Нужен
 * подписи «нечего оценивать», чтобы она называла настоящее число, а не
 * порог.
 */
export function lastWeighInGap(logs: BodyWeightLog[]): number | null {
  if (logs.length < 2) return null;
  const sorted = logs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const to = sorted[sorted.length - 1];
  const from = sorted[sorted.length - 2];
  return Math.round(
    (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Что цель означает на практике.
 *
 * Без этого переключатель «Набор / Поддержание / Сушка» ничего не делал:
 * он подкрашивал две цифры изменения, а при одном взвешивании там прочерки,
 * то есть цель не влияла ни на что видимое вообще.
 *
 * Границы — общепринятые ориентиры, не медицинская норма: набор быстрее
 * ~0,6 кг в неделю идёт в основном не в мышцы, сушка быстрее ~1,2 кг в неделю
 * забирает силу. Они здесь, чтобы приложение говорило «быстро» или «мало»
 * числом, а не молчало.
 */
export interface BodyWeightBand {
  /** Нижняя и верхняя границы разумной недельной скорости, кг. */
  min: number;
  max: number;
}

export const GOAL_BANDS: Record<BodyWeightGoal, BodyWeightBand> = {
  bulk: { min: 0.2, max: 0.6 },
  cut: { min: -1.2, max: -0.4 },
  // Поддержание — это коридор вокруг нуля, а не направление.
  maintain: { min: -0.3, max: 0.3 },
};

export type BodyWeightVerdictKind = 'ok' | 'fast' | 'slow' | 'wrong-way' | 'not-enough';

export interface BodyWeightVerdict {
  kind: BodyWeightVerdictKind;
  headline: string;
  detail: string;
  /**
   * Чем набран или сброшен вес — отдельной строкой, когда процент жира есть
   * на обоих взвешиваниях. Если промежутка мало или весы дали невозможный
   * скачок по жиру, в этой же строке стоит причина, а не выдуманный расклад.
   *
   * Отдельным полем, а не внутри `detail`: вердикт по скорости верен и без
   * состава, и подмешивать одно в другое значило бы, что при отсутствии
   * процента жира текст пришлось бы собирать иначе.
   */
  composition?: string;
  /**
   * Что именно стоит в `composition`: вывод (`split`) или причина, по которой
   * вывода нет. Экран набирает их по-разному.
   */
  compositionKind?: CompositionVerdict['kind'];
}

export function bodyWeightVerdict(
  logs: BodyWeightLog[],
  goal: BodyWeightGoal,
  now: Date = new Date(),
): BodyWeightVerdict {
  const rate = bodyWeightRate(logs, now);

  /*
   * Состав считается по ТЕМ ЖЕ двум взвешиваниям, что и скорость, — иначе
   * строки под одним вердиктом говорили бы о разных промежутках.
   *
   * Но порог у состава СВОЙ и больше: вес весы меряют точно, процент жира —
   * нет. Поэтому скорость считается от 5 дней, а расклад — от 14, и решает
   * это `compositionVerdict`, а не этот файл.
   */
  const split = rate ? compositionVerdict(rate.from, rate.to) : null;
  const composition = split ? { composition: split.text, compositionKind: split.kind } : {};

  if (!rate) {
    return {
      kind: 'not-enough',
      headline: 'Пока нечего оценивать',
      detail:
        logs.length < 2
          ? 'Нужно второе взвешивание — хотя бы через пять дней после первого. Тогда цель начнёт показывать, идёте вы по плану или нет.'
          : (() => {
              /*
               * Подпись называет НАСТОЯЩИЙ промежуток и настоящую причину.
               * Раньше здесь всегда стояло «меньше 5 дней», и при 46 днях
               * между взвешиваниями это была прямая неправда.
               */
              const gap = lastWeighInGap(logs) ?? 0;
              return gap > MAX_RATE_SPAN_DAYS
                ? `Между взвешиваниями ${count(gap, WORDS.day)} — это средняя по слишком разным периодам. Взвесьтесь ещё раз, и цель начнёт считать.`
                : `Между взвешиваниями ${count(gap, WORDS.day)}. На таком промежутке видна вода, а не динамика — нужно хотя бы ${MIN_RATE_SPAN_DAYS} дней.`;
            })(),
    };
  }

  const band = GOAL_BANDS[goal];
  const perWeek = rate.perWeek;
  const signed = `${perWeek > 0 ? '+' : ''}${perWeek.toFixed(2)} кг/нед`;
  // Без точки на конце: дальше она добавляется по месту, и выходило «дн..».
  const span = `за ${count(rate.spanDays, WORDS.day)}`;

  if (goal === 'maintain') {
    if (perWeek >= band.min && perWeek <= band.max) {
      return {
        kind: 'ok',
        headline: 'Вес держится',
        detail: `${signed} ${span} — это и есть поддержание.`,
        ...composition,
      };
    }
    return {
      kind: perWeek > 0 ? 'fast' : 'wrong-way',
      headline: perWeek > 0 ? 'Вес ползёт вверх' : 'Вес ползёт вниз',
      detail: `${signed} ${span}. Для поддержания это много: цель — остаться в пределах ±${band.max} кг в неделю.`,
      ...composition,
    };
  }

  const wantsUp = goal === 'bulk';
  // Движение в обратную сторону — отдельный случай: «мало» тут неверное слово.
  if ((wantsUp && perWeek < 0) || (!wantsUp && perWeek > 0)) {
    return {
      kind: 'wrong-way',
      headline: wantsUp ? 'Вес падает, а цель — набор' : 'Вес растёт, а цель — сушка',
      detail: `${signed} ${span}. Либо еды не хватает под ${wantsUp ? 'набор' : 'дефицит'}, либо цель пора сменить.`,
      ...composition,
    };
  }

  if (perWeek >= band.min && perWeek <= band.max) {
    return {
      kind: 'ok',
      headline: 'Идёте по плану',
      detail: `${signed} ${span} — в разумном коридоре ${band.min}…${band.max} кг в неделю.`,
      ...composition,
    };
  }

  const tooFast = wantsUp ? perWeek > band.max : perWeek < band.min;
  if (tooFast) {
    return {
      kind: 'fast',
      headline: 'Слишком быстро',
      detail: wantsUp
        ? `${signed} ${span}. Быстрее ${band.max} кг в неделю прибавляется в основном не мышцами.`
        : `${signed} ${span}. Быстрее ${Math.abs(band.min)} кг в неделю сушка забирает силу — на тренировках это видно сразу.`,
      ...composition,
    };
  }

  return {
    kind: 'slow',
    headline: wantsUp ? 'Для набора мало' : 'Для сушки мало',
    detail: `${signed} ${span}. Ожидаемо ${wantsUp ? `${band.min}…${band.max}` : `${band.min}…${band.max}`} кг в неделю — вес почти стоит.`,
    ...composition,
  };
}

/**
 * Средняя тяжесть тренировки (§39) — по оценкам, которые человек поставил.
 *
 * Средним считаем RPE, а не порядковый номер варианта: между «легко» и
 * «норма» по ощущениям два шага RPE, а между «тяжело» и «отказом» — один, и
 * усреднение по номерам сместило бы результат в тяжёлую сторону.
 *
 * Возвращаем ближайшую из четырёх оценок, а не число: «средняя 8.3 RPE» в
 * итогах ничего не говорит, «норма» говорит.
 */
export function averageDifficulty(session: WorkoutSession): Difficulty | null {
  const rated = session.exercises
    .flatMap((ex) => ex.sets)
    .map((set) => set.actual?.difficulty)
    .filter((d): d is Difficulty => Boolean(d));
  if (!rated.length) return null;

  const mean = rated.reduce((sum, d) => sum + DIFFICULTY_META[d].rpe, 0) / rated.length;
  const options = Object.keys(DIFFICULTY_META) as Difficulty[];
  return options.reduce((best, option) =>
    Math.abs(DIFFICULTY_META[option].rpe - mean) < Math.abs(DIFFICULTY_META[best].rpe - mean)
      ? option
      : best,
  );
}

/** Сколько упражнений реально сделано (пропущенные не считаются). */
export function sessionExerciseCount(session: WorkoutSession): number {
  return session.exercises.filter(
    (ex) => ex.status !== 'skipped' && ex.sets.some((set) => set.actual),
  ).length;
}

export function bodyWeightStats(logs: BodyWeightLog[], now: Date = new Date()): BodyWeightStats {
  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0] ?? null;
  if (!latest) return { latest: null, change7d: null, change30d: null };

  /*
   * ИЗМЕНЕНИЕ ЗА ПЕРИОД — ТОЛЬКО ПО ЗАМЕРАМ ВНУТРИ ПЕРИОДА.
   *
   * Раньше бралась первая запись СТАРШЕ отсечки, без ограничения по
   * давности: у владельца с замерами 1 августа (81 кг) и 15 сентября (85,2)
   * плитка «7 дней» показывала +4,2 — разницу за сорок пять дней. Число
   * выглядело как ответ, а отвечало на другой вопрос.
   *
   * Берём самый ранний замер ВНУТРИ окна и сравниваем с последним. Если в
   * окне только сам последний замер, сравнивать не с чем — прочерк, а не
   * подстановка чего попало. «Прочерк» здесь честнее любого числа: за
   * неделю человек просто не взвешивался.
   */
  const at = (days: number) => {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const target = iso(cutoff);
    const inWindow = sorted.filter((l) => l.date >= target);
    const oldest = inWindow[inWindow.length - 1];
    if (!oldest || oldest.date === latest.date) return null;
    return Math.round((latest.weight - oldest.weight) * 10) / 10;
  };

  return { latest, change7d: at(7), change30d: at(30) };
}
