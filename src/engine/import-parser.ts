import type { Exercise } from '@/domain/types';
import { excelSerialToIso } from './xlsx';

/**
 * Bulk import: turns the user's existing plain-text notes (or a CSV) into
 * structured workouts. The parser is deliberately forgiving and *always*
 * reports what it guessed, because the import screen makes the user confirm a
 * preview before anything is written — a wrong guess costs a tap, never data.
 */

export interface ParsedSet {
  weight: number | null;
  reps: number;
  /** Source line, kept so the preview can show what it came from. */
  raw: string;
}

export interface ParsedExercise {
  rawName: string;
  /** Matched library exercise, or `null` when it needs to be created. */
  exerciseId: string | null;
  matchedName: string | null;
  /** 0–1. Below `MATCH_THRESHOLD` we refuse to guess. */
  matchScore: number;
  sets: ParsedSet[];
}

export interface ParsedWorkout {
  /** `YYYY-MM-DD`, or `null` when no date was found. */
  date: string | null;
  rawDate: string | null;
  dayName: string | null;
  exercises: ParsedExercise[];
  warnings: string[];
}

export interface ParseResult {
  workouts: ParsedWorkout[];
  warnings: string[];
}

/* ── Name matching ─────────────────────────────────────────────────── */

const NOISE = new Set([
  'на', 'в', 'с', 'из', 'за', 'к', 'по', 'и', 'the', 'a', 'of', 'with', 'to',
  'кг', 'kg', 'сет', 'сеты', 'подход', 'подходы', 'set', 'sets',
]);

export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(input: string): string[] {
  return normalizeName(input)
    .split(' ')
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

export const MATCH_THRESHOLD = 0.45;

/** Token-overlap score with a substring bonus; 1 = exact normalized match. */
export function scoreMatch(raw: string, candidate: string): number {
  const a = normalizeName(raw);
  const b = normalizeName(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = tokens(raw);
  const tb = tokens(candidate);
  if (!ta.length || !tb.length) return 0;

  /*
   * Совпадение по префиксу — только между ДЛИННЫМИ токенами, и каждый токен
   * кандидата расходуется один раз.
   *
   * Иначе «рукоятью» цеплялось за «рук» (проверка длины стояла только на
   * стороне запроса), и «Разгибание рук на блоке с прямой рукоятью»
   * совпадало с «...с прямой канатом» на единицу — то есть 34 подхода
   * прямой рукояти по 45–55 кг легли бы в рекорды канатной рукояти. Точное
   * совпадение имеет приоритет над префиксным, чтобы порядок библиотеки не
   * решал исход.
   */
  const LONG = 3;
  const used = new Set<number>();
  let hits = 0;
  for (const t of ta) {
    let found = -1;
    for (let i = 0; i < tb.length; i += 1) {
      if (used.has(i)) continue;
      const x = tb[i];
      if (x === t) {
        found = i;
        break;
      }
      if (
        found < 0 &&
        t.length > LONG &&
        x.length > LONG &&
        (x.startsWith(t) || t.startsWith(x))
      ) {
        found = i;
      }
    }
    if (found >= 0) {
      used.add(found);
      hits += 1;
    }
  }
  const overlap = hits / Math.max(ta.length, tb.length);
  const substring = b.includes(a) || a.includes(b) ? 0.25 : 0;
  return Math.min(1, overlap + substring);
}

export function matchExercise(
  raw: string,
  exercises: Exercise[],
): { exerciseId: string | null; matchedName: string | null; score: number } {
  let best: { exercise: Exercise; score: number } | null = null;
  for (const exercise of exercises) {
    const score = Math.max(
      scoreMatch(raw, exercise.name),
      exercise.alias ? scoreMatch(raw, exercise.alias) : 0,
      ...(exercise.aliases ?? []).map((a) => scoreMatch(raw, a)),
    );
    if (!best || score > best.score) best = { exercise, score };
  }
  if (!best || best.score < MATCH_THRESHOLD) {
    return { exerciseId: null, matchedName: null, score: best?.score ?? 0 };
  }
  return { exerciseId: best.exercise.id, matchedName: best.exercise.name, score: best.score };
}

/**
 * «День 1 - Грудь + Трицепс» → короткая метка и то, что тренируется.
 *
 * В выгрузке владельца день назван одной строкой, и без разделения в истории
 * выходило «День 1 - Грудь + Трицепс» дважды: и в метке, и в заголовке.
 * Разделитель — любое тире, окружённое пробелами; без него строка целиком
 * идёт в метку, как и было.
 */
export function splitDayName(raw: string): { name: string; title: string } {
  const match = raw.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (!match) return { name: raw.trim(), title: '' };
  return { name: match[1].trim(), title: match[2].trim() };
}

/* ── Dates ─────────────────────────────────────────────────────────── */

const RU_MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7,
  авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
};
const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function assemble(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${pad(m)}-${pad(d)}`;
}

/**
 * Recognises `01.08.2026`, `1/8/26`, `2026-08-01`, `14 сентября`, `SEP 14`.
 * A date with no year is assumed to be the most recent such date not in the
 * future, which is what "SEP 14" means in a notes file.
 */
export function parseDateLine(
  line: string,
  today: Date = new Date(),
  options: { allowExcelSerial?: boolean } = {},
): string | null {
  const text = line.trim();
  if (!text) return null;

  if (options.allowExcelSerial && /^\d{2,6}([.,]\d+)?$/.test(text)) {
    const iso = excelSerialToIso(parseFloat(text.replace(',', '.')));
    if (iso) return iso;
  }

  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return assemble(+m[1], +m[2], +m[3]);

  m = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) return assemble(+m[3], +m[2], +m[1]);

  m = text.match(/^(\d{1,2})[.\-/](\d{1,2})\.?$/);
  if (m) return backfillYear(+m[2], +m[1], today);

  m = normalizeName(text).match(/^(\d{1,2})\s+([а-яa-z]{3,})/u);
  if (m) {
    const month = monthFromWord(m[2]);
    if (month) return backfillYear(month, +m[1], today);
  }

  m = normalizeName(text).match(/^([а-яa-z]{3,})\s+(\d{1,2})$/u);
  if (m) {
    const month = monthFromWord(m[1]);
    if (month) return backfillYear(month, +m[2], today);
  }
  return null;
}

function monthFromWord(word: string): number | null {
  const key = word.slice(0, 3);
  return RU_MONTHS[key] ?? EN_MONTHS[key] ?? null;
}

function backfillYear(month: number, day: number, today: Date): string | null {
  const thisYear = assemble(today.getFullYear(), month, day);
  if (!thisYear) return null;
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (thisYear <= todayIso) return thisYear;
  return assemble(today.getFullYear() - 1, month, day);
}

/* ── Set lines ─────────────────────────────────────────────────────── */

const X = '[x×хχ*]';
const NUM = '\\d+(?:[.,]\\d+)?';
/** `\b` is ASCII-only in JS, so "50кг" needs an explicit unicode boundary. */
const END = '(?![\\p{L}\\p{N}])';

function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

export interface SetLineResult {
  sets: ParsedSet[];
  /** Text left over once the sets were removed — usually the exercise name. */
  remainder: string;
  warnings: string[];
}

/**
 * Pulls every set expression out of one line. Understands:
 *   `50 x 12`        `50кг × 12`     `50/12`
 *   `50 x 12 x 4`    (four sets)     `3 по 12 50кг`
 *   `50 x 12, 50 x 12, 60 x 8`       `12` (bodyweight, reps only)
 *   `50 x 10-12`     (takes the lower bound and warns)
 */
export function parseSetLine(line: string, previousReps: number | null = null): SetLineResult {
  const warnings: string[] = [];
  const sets: ParsedSet[] = [];
  let rest = ` ${line} `;

  const take = (pattern: RegExp, handler: (m: RegExpExecArray) => ParsedSet[] | null) => {
    let guard = 0;
    for (;;) {
      pattern.lastIndex = 0;
      const m = pattern.exec(rest);
      if (!m || guard > 40) break;
      guard += 1;
      const produced = handler(m);
      rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
      if (produced) sets.push(...produced);
    }
  };

  // `50 x 12 x 4` — weight, reps, then how many sets.
  take(
    new RegExp(`(${NUM})\\s*(?:кг|kg)?\\s*${X}\\s*(\\d+)(?:\\s*-\\s*(\\d+))?\\s*${X}\\s*(\\d{1,2})${END}`, 'iu'),
    (m) => {
      if (m[3]) warnings.push(`«${m[0].trim()}»: взят нижний край диапазона повторений.`);
      const count = Math.min(12, +m[4]);
      return Array.from({ length: count }, () => ({
        weight: num(m[1]),
        reps: +m[2],
        raw: m[0].trim(),
      }));
    },
  );

  // `3 по 12 50кг` / `4 x 10 на 45 кг` — set count first, weight elsewhere.
  take(
    new RegExp(`\\b(\\d{1,2})\\s*(?:по|${X})\\s*(\\d+)\\s*(?:повт\\w*|reps?)?\\s*(?:(?:по|на|at|@)\\s*)?(${NUM})\\s*(?:кг|kg)${END}`, 'iu'),
    (m) => {
      const count = Math.min(12, +m[1]);
      return Array.from({ length: count }, () => ({
        weight: num(m[3]),
        reps: +m[2],
        raw: m[0].trim(),
      }));
    },
  );

  // `50кг 3 по 12` — weight first, then set count.
  take(
    new RegExp(`(${NUM})\\s*(?:кг|kg)\\s*(\\d{1,2})\\s*(?:по|${X})\\s*(\\d+)${END}`, 'iu'),
    (m) => {
      const count = Math.min(12, +m[2]);
      return Array.from({ length: count }, () => ({
        weight: num(m[1]),
        reps: +m[3],
        raw: m[0].trim(),
      }));
    },
  );

  // `50 x 12` / `50кг × 12` / `50/12`
  take(
    new RegExp(`(${NUM})\\s*(?:кг|kg)?\\s*(?:${X}|/)\\s*(\\d+)(?:\\s*-\\s*(\\d+))?${END}`, 'iu'),
    (m) => {
      if (m[3]) warnings.push(`«${m[0].trim()}»: взят нижний край диапазона повторений.`);
      return [{ weight: num(m[1]), reps: +m[2], raw: m[0].trim() }];
    },
  );

  // `последний 60кг` — same reps as the previous set, heavier.
  take(new RegExp(`(?:последний|last)\\s*(?:подход)?\\s*(${NUM})\\s*(?:кг|kg)`, 'iu'), (m) => {
    const reps = previousReps ?? sets[sets.length - 1]?.reps ?? null;
    if (reps === null) {
      warnings.push(`«${m[0].trim()}»: не удалось определить повторения.`);
      return null;
    }
    return [{ weight: num(m[1]), reps, raw: m[0].trim() }];
  });

  const leftover = rest.replace(/\s+/g, ' ').trim();

  // A bare weight with a unit, once sets are known: "60кг" on its own line.
  if (!sets.length) {
    const bare = leftover.match(new RegExp(`^(${NUM})\\s*(?:кг|kg)$`, 'i'));
    if (bare && previousReps !== null) {
      return {
        sets: [{ weight: num(bare[1]), reps: previousReps, raw: leftover }],
        remainder: '',
        warnings,
      };
    }
    // Reps only — bodyweight work.
    const reps = leftover.match(/^(\d{1,3})(?:\s*(?:повт\w*|reps?|раз\w*))?$/i);
    if (reps && +reps[1] <= 100) {
      return { sets: [{ weight: null, reps: +reps[1], raw: leftover }], remainder: '', warnings };
    }
  }

  return { sets, remainder: leftover, warnings };
}

/** Lines that are structure, not data. */
function isSkippableLine(line: string): boolean {
  const n = normalizeName(line);
  if (!n) return true;
  return /^(день|day|тренировка|workout|программа|program)\s*\d*$/.test(n);
}

/** `ДЕНЬ 1 — ГРУДЬ + ТРИЦЕПС` style headers become the workout's day name. */
function dayHeader(line: string): string | null {
  const m = line.trim().match(/^(?:день|day)\s*(\d+)\s*[-—:.]?\s*(.*)$/i);
  if (!m) return null;
  return m[2] ? `DAY ${m[1]} — ${m[2].trim()}` : `DAY ${m[1]}`;
}

/* ── Text import ───────────────────────────────────────────────────── */

export function parseWorkoutText(
  text: string,
  exercises: Exercise[],
  today: Date = new Date(),
): ParseResult {
  const lines = text.split(/\r?\n/);
  const workouts: ParsedWorkout[] = [];
  const warnings: string[] = [];

  let current: ParsedWorkout | null = null;
  let currentExercise: ParsedExercise | null = null;

  const startWorkout = (date: string | null, raw: string | null) => {
    current = { date, rawDate: raw, dayName: null, exercises: [], warnings: [] };
    currentExercise = null;
    workouts.push(current);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const date = parseDateLine(line, today);
    if (date) {
      startWorkout(date, line);
      continue;
    }

    const header = dayHeader(line);
    if (header) {
      if (!current) startWorkout(null, null);
      current!.dayName = header;
      currentExercise = null;
      continue;
    }

    if (isSkippableLine(line)) continue;
    if (!current) startWorkout(null, null);

    const previousReps = currentExercise?.sets.at(-1)?.reps ?? null;
    const parsed = parseSetLine(line, previousReps);
    current!.warnings.push(...parsed.warnings);

    if (parsed.sets.length) {
      // A line like "Жим лежа 50 x 12" starts an exercise and records a set.
      if (parsed.remainder && parsed.remainder.length > 2) {
        currentExercise = makeExercise(parsed.remainder, exercises);
        current!.exercises.push(currentExercise);
      }
      if (!currentExercise) {
        currentExercise = makeExercise('Без названия', exercises);
        current!.exercises.push(currentExercise);
        current!.warnings.push(`Подходы «${line}» найдены до названия упражнения.`);
      }
      currentExercise.sets.push(...parsed.sets);
      continue;
    }

    // No sets on the line: it names an exercise.
    currentExercise = makeExercise(line, exercises);
    current!.exercises.push(currentExercise);
  }

  const cleaned = workouts
    .map((w) => ({ ...w, exercises: w.exercises.filter((e) => e.sets.length > 0) }))
    .filter((w) => w.exercises.length > 0);

  for (const workout of cleaned) {
    if (!workout.date) workout.warnings.push('Дата не найдена — укажите её вручную.');
    const unmatched = workout.exercises.filter((e) => !e.exerciseId).length;
    if (unmatched) {
      workout.warnings.push(
        `${unmatched} ${unmatched === 1 ? 'упражнение' : 'упражнения'} не найдено в библиотеке.`,
      );
    }
  }
  if (!cleaned.length) warnings.push('Не удалось распознать ни одной тренировки.');

  return { workouts: cleaned, warnings };
}

function makeExercise(rawName: string, exercises: Exercise[]): ParsedExercise {
  const name = rawName.replace(/^[\d]+[).\s]+/, '').trim();
  const match = matchExercise(name, exercises);
  return {
    rawName: name || rawName,
    exerciseId: match.exerciseId,
    matchedName: match.matchedName,
    matchScore: Math.round(match.score * 100) / 100,
    sets: [],
  };
}

/* ── CSV import ────────────────────────────────────────────────────── */

export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(value.trim());
      value = '';
    } else value += ch;
  }
  out.push(value.trim());
  return out;
}

/**
 * CSV columns per the spec: Date, Program, Workout, Exercise, Set, Weight, Reps.
 * Column order is read from the header, so any export order works; `,` and `;`
 * are both accepted as delimiters.
 */
export function parseWorkoutCsv(
  text: string,
  exercises: Exercise[],
  today: Date = new Date(),
): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { workouts: [], warnings: ['Файл пустой.'] };

  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(lines[0], delimiter).map((h) => normalizeName(h));

  /**
   * Заголовок распознаётся по ПЕРВОМУ слову, а не целиком.
   *
   * Настоящая выгрузка называет колонку «Вес, кг», а не «Вес». При сравнении
   * целиком это не совпадало ни с чем, колонка считалась отсутствующей, и
   * импорт молча записывал все подходы БЕЗ веса — 516 штук, и увидеть это можно
   * было только открыв историю потом. Первое слово совпадает и у «Вес», и у
   * «Вес, кг», и у «Weight (kg)», а ложных совпадений не даёт: у «повторения»
   * первое слово не «повт».
   */
  const col = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h === n || h.split(' ')[0] === n));

  const idx = {
    date: col('date', 'дата'),
    // «Программа» — так называет эту колонку выгрузка из прежнего приложения.
    workout: col('workout', 'day', 'тренировка', 'день', 'программа', 'program'),
    exercise: col('exercise', 'упражнение'),
    weight: col('weight', 'вес'),
    reps: col('reps', 'повторения', 'повт'),
  };

  if (idx.date < 0 || idx.exercise < 0 || idx.reps < 0) {
    return {
      workouts: [],
      warnings: ['Нужны колонки Date, Exercise и Reps (Weight — опционально).'],
    };
  }

  const warnings: string[] = [];
  const byDate = new Map<string, ParsedWorkout>();

  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line, delimiter);
    const date = parseDateLine(cells[idx.date] ?? '', today, { allowExcelSerial: true });
    if (!date) {
      warnings.push(`Строка ${i + 2}: не разобрана дата «${cells[idx.date] ?? ''}».`);
      return;
    }
    const reps = parseInt(cells[idx.reps] ?? '', 10);
    if (!Number.isFinite(reps) || reps <= 0) {
      warnings.push(`Строка ${i + 2}: не разобраны повторения.`);
      return;
    }
    const rawWeight = (cells[idx.weight] ?? '').replace(',', '.');
    const weight = rawWeight === '' ? null : parseFloat(rawWeight);

    let workout = byDate.get(date);
    if (!workout) {
      workout = {
        date,
        rawDate: cells[idx.date] ?? null,
        dayName: idx.workout >= 0 ? (cells[idx.workout] ?? null) : null,
        exercises: [],
        warnings: [],
      };
      byDate.set(date, workout);
    }

    const rawName = cells[idx.exercise] ?? '';
    let exercise = workout.exercises.find(
      (e) => normalizeName(e.rawName) === normalizeName(rawName),
    );
    if (!exercise) {
      exercise = makeExercise(rawName, exercises);
      workout.exercises.push(exercise);
    }
    exercise.sets.push({
      weight: weight !== null && Number.isFinite(weight) ? weight : null,
      reps,
      raw: line,
    });
  });

  const workouts = [...byDate.values()]
    .filter((w) => w.exercises.some((e) => e.sets.length))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  for (const workout of workouts) {
    const unmatched = workout.exercises.filter((e) => !e.exerciseId).length;
    if (unmatched) workout.warnings.push(`${unmatched} упражнений не найдено в библиотеке.`);
  }

  return { workouts, warnings };
}
