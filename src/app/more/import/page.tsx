'use client';

import { useMemo, useRef, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, Select, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  Eyebrow,
  LinkButton,
  Notice,
  SectionTitle,
  SegmentedControl,
  cx,
} from '@/components/ui/primitives';
import { formatWeight } from '@/engine/format';
import {
  parseWorkoutCsv,
  parseWorkoutText,
  type ParsedWorkout,
} from '@/engine/import-parser';
import { readXlsx, rowsToCsv, XlsxError } from '@/engine/xlsx';
import { useStore } from '@/store/useStore';

const EXAMPLE = `01.08.2026
Bench Press
50 x 12
50 x 12
50 x 12
60 x 8
Incline Dumbbell Press
16 x 12
16 x 12
18 x 10`;

/** Выгрузка владельца, положенная в приложение (см. `loadOwnExport`). */
const OWN_EXPORT = '/data/history-zveat.csv';

const CSV_EXAMPLE = `Date,Program,Workout,Exercise,Set,Weight,Reps
2026-08-01,Mass,Day 1,Жим штанги лежа,1,50,12
2026-08-01,Mass,Day 1,Жим штанги лежа,2,50,12`;

/**
 * BULK IMPORT — paste old notes or a CSV, check the preview, then write.
 *
 * Nothing is saved until the preview is confirmed, and every guess the parser
 * made is visible and editable there: a wrong date or an unmatched exercise
 * costs a tap, not a corrupted history.
 */
export default function ImportPage() {
  const exercises = useStore((s) => s.exercises);
  const programs = useStore((s) => s.programs);
  const activeProgramId = useStore((s) => s.settings.activeProgramId);
  const importSessions = useStore((s) => s.importSessions);
  const createExercise = useStore((s) => s.createExercise);

  const [source, setSource] = useState<'text' | 'csv'>('text');
  const [raw, setRaw] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedWorkout[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [programId, setProgramId] = useState<string>(activeProgramId ?? '');
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    duplicates: number;
  } | null>(null);

  /**
   * A file is just another way to get the same text: .xlsx is unpacked to CSV
   * in the browser, everything else is read as plain text. The preview step
   * afterwards is identical, so there is one place to check the result.
   */
  const loadFile = async (file: File) => {
    setFileError(null);
    setLoadedFile(null);
    try {
      const isExcel = /\.xlsx$/i.test(file.name);
      if (isExcel) {
        const rows = await readXlsx(await file.arrayBuffer());
        if (!rows.length) throw new XlsxError('В файле нет строк.');
        setRaw(rowsToCsv(rows));
        setSource('csv');
      } else {
        const text = await file.text();
        setRaw(text);
        // A header line with a Date column means it is tabular, not notes.
        setSource(/(^|[,;])\s*(date|дата)\s*([,;]|$)/im.test(text.split(/\r?\n/)[0] ?? '') ? 'csv' : 'text');
      }
      setLoadedFile(file.name);
      setPreview(null);
      setResult(null);
    } catch (e) {
      setFileError(
        e instanceof XlsxError ? e.message : 'Не удалось прочитать файл. Попробуйте CSV.',
      );
    }
  };

  /**
   * ГОТОВАЯ ВЫГРУЗКА ВЛАДЕЛЬЦА — один тап вместо файла.
   *
   * Файл лежит в приложении (`public/data/history-zveat.csv`, ровно те 516
   * строк из его Excel, без пустого хвоста), и названия упражнений в нём уже
   * сверены с библиотекой — все 26 совпадают точно. Разбор идёт тем же путём,
   * что и любой файл, и так же заканчивается предпросмотром: своя история
   * тоже проверяется перед записью.
   */
  const loadOwnExport = async () => {
    setFileError(null);
    try {
      const response = await fetch(`${OWN_EXPORT}?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? ''}`);
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      setRaw(text);
      setSource('csv');
      setLoadedFile('history-zveat.csv');
      // Разбираем сразу из текста: `raw` в этом тике ещё старый.
      const parsed = parseWorkoutCsv(text, exercises);
      setPreview(parsed.workouts);
      setWarnings(parsed.warnings);
      setResult(null);
    } catch {
      setFileError('Не удалось загрузить готовую выгрузку. Выберите файл вручную.');
    }
  };

  const parse = () => {
    const parsed =
      source === 'text' ? parseWorkoutText(raw, exercises) : parseWorkoutCsv(raw, exercises);
    setPreview(parsed.workouts);
    setWarnings(parsed.warnings);
    setResult(null);
  };

  const stats = useMemo(() => {
    if (!preview) return null;
    const sets = preview.reduce(
      (n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0),
      0,
    );
    const unmatched = preview.reduce(
      (n, w) => n + w.exercises.filter((e) => !e.exerciseId).length,
      0,
    );
    const undated = preview.filter((w) => !w.date).length;
    return { workouts: preview.length, sets, unmatched, undated };
  }, [preview]);

  const patchWorkout = (index: number, patch: Partial<ParsedWorkout>) =>
    setPreview((current) =>
      current ? current.map((w, i) => (i === index ? { ...w, ...patch } : w)) : current,
    );

  const patchExercise = (
    workoutIndex: number,
    exerciseIndex: number,
    patch: { exerciseId: string | null; matchedName: string | null },
  ) =>
    setPreview((current) =>
      current
        ? current.map((w, i) =>
            i !== workoutIndex
              ? w
              : {
                  ...w,
                  exercises: w.exercises.map((e, j) =>
                    j === exerciseIndex ? { ...e, ...patch, matchScore: 1 } : e,
                  ),
                },
          )
        : current,
    );

  const createAndLink = (workoutIndex: number, exerciseIndex: number, name: string) => {
    const exercise = createExercise({ name });
    patchExercise(workoutIndex, exerciseIndex, {
      exerciseId: exercise.id,
      matchedName: exercise.name,
    });
  };

  const commit = () => {
    if (!preview) return;
    const outcome = importSessions(preview, { programId: programId || null });
    setResult(outcome);
    setPreview(null);
    setRaw('');
  };

  if (result) {
    return (
      <Screen>
        <ScreenHeader title="Импорт завершён" back="/more" />
        <Notice tone="accent" title={`✓ Добавлено тренировок: ${result.created}`}>
          {/*
            «Уже были» и «пропущено» — разные вещи, и их нельзя складывать:
            первое значит «эта дата в истории есть, повторно не писали»,
            второе — «не смогли разобрать». Иначе повторный импорт выглядел бы
            как потеря данных.
          */}
          {result.duplicates
            ? `Уже были в истории и не добавлены повторно: ${result.duplicates}. `
            : ''}
          {result.skipped
            ? `Пропущено: ${result.skipped} (без даты или без распознанных упражнений).`
            : result.duplicates
              ? 'Остальное разобрано без потерь.'
              : 'Всё разобрано без потерь.'}
        </Notice>
        <div className="mt-5 flex flex-col gap-2">
          <LinkButton href="/history" size="lg" full>
            ОТКРЫТЬ ИСТОРИЮ
          </LinkButton>
          <LinkButton href="/progress" size="lg" full>
            ПОСМОТРЕТЬ ПРОГРЕСС
          </LinkButton>
          <Button variant="primary" size="lg" full onClick={() => setResult(null)}>
            ИМПОРТИРОВАТЬ ЕЩЁ
          </Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Импорт истории"
        subtitle="Вставьте старые заметки или CSV"
        back="/more"
      />

      {!preview ? (
        <>
          <SegmentedControl
            value={source}
            onChange={(next) => {
              setSource(next);
              setRaw('');
              setLoadedFile(null);
            }}
            options={[
              { value: 'text', label: 'Текст' },
              { value: 'csv', label: 'CSV' },
            ]}
          />

          {/*
            Своя история — первым делом: это то, ради чего экран открывают
            сейчас. Ручной файл остаётся ниже и работает как раньше.
          */}
          <Card className="mt-3 p-4">
            <Eyebrow>Моя выгрузка</Eyebrow>
            <p className="mt-1 text-[14.5px] leading-snug font-semibold">
              24 тренировки, 516 подходов
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-dim">
              07.08.2026 — 15.09.2026. Все 26 названий сверены с библиотекой. Даты, которые уже
              есть в истории, повторно не добавятся.
            </p>
            <Button
              variant="primary"
              size="md"
              full
              className="mt-3"
              onClick={() => void loadOwnExport()}
            >
              ВЗЯТЬ МОЮ ВЫГРУЗКУ
            </Button>
          </Card>

          <Card className="mt-3 p-4">
            <Eyebrow>Файл</Eyebrow>
            <Button size="md" full className="mt-2" onClick={() => fileInput.current?.click()}>
              ВЫБРАТЬ ФАЙЛ (CSV, XLSX, TXT)
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = '';
              }}
            />
            {loadedFile ? (
              <p className="mt-2 text-[12px] text-dim">
                Загружен: <span className="text-ink">{loadedFile}</span>
              </p>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
                Excel распаковывается прямо в приложении — ничего никуда не отправляется.
              </p>
            )}
            {fileError ? (
              <div className="mt-2">
                <Notice tone="warn">{fileError}</Notice>
              </div>
            ) : null}
          </Card>

          <Card className="mt-3 p-4">
            <Eyebrow>{source === 'text' ? 'Ваши заметки' : 'CSV'}</Eyebrow>
            <TextArea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={source === 'text' ? EXAMPLE : CSV_EXAMPLE}
              className="mt-2 min-h-56 font-mono text-[13px] leading-relaxed"
            />
            <div className="mt-3 flex gap-2">
              <Button size="md" className="flex-1" onClick={() => setRaw(source === 'text' ? EXAMPLE : CSV_EXAMPLE)}>
                ПРИМЕР
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-[2]"
                onClick={parse}
                disabled={!raw.trim()}
              >
                РАЗОБРАТЬ
              </Button>
            </div>
          </Card>

          <Card className="mt-4 p-4">
            <Eyebrow>Что понимает разбор</Eyebrow>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-dim">
              <li>
                Даты: <span className="text-ink">01.08.2026</span>,{' '}
                <span className="text-ink">2026-08-01</span>,{' '}
                <span className="text-ink">14 сентября</span>, <span className="text-ink">SEP 14</span>
              </li>
              <li>
                Подходы: <span className="text-ink">50 x 12</span>,{' '}
                <span className="text-ink">52,5кг × 10</span>,{' '}
                <span className="text-ink">22.5 x 12 x 4</span>,{' '}
                <span className="text-ink">50кг 3 по 12</span>
              </li>
              <li>
                Заголовки дней: <span className="text-ink">День 1 — Грудь + Трицепс</span>
              </li>
              <li>
                Отдельной строкой: <span className="text-ink">последний 60кг</span> — вес с теми же
                повторениями
              </li>
              <li>CSV и Excel: Date, Program, Workout, Exercise, Set, Weight, Reps</li>
              <li>
                Даты, которые Excel хранит числом (<span className="text-ink">46235</span>), тоже
                разбираются
              </li>
            </ul>
          </Card>
        </>
      ) : (
        <>
          {stats ? (
            <Card className="grid grid-cols-3 divide-x divide-line">
              <div className="px-3 py-3.5 text-center">
                <Eyebrow>Тренировок</Eyebrow>
                <p className="tnum mt-1 text-[20px] font-semibold">{stats.workouts}</p>
              </div>
              <div className="px-3 py-3.5 text-center">
                <Eyebrow>Подходов</Eyebrow>
                <p className="tnum mt-1 text-[20px] font-semibold">{stats.sets}</p>
              </div>
              <div className="px-3 py-3.5 text-center">
                <Eyebrow>Вопросов</Eyebrow>
                <p
                  className={cx(
                    'tnum mt-1 text-[20px] font-semibold',
                    stats.unmatched + stats.undated > 0 ? 'text-warn' : 'text-progress',
                  )}
                >
                  {stats.unmatched + stats.undated}
                </p>
              </div>
            </Card>
          ) : null}

          {warnings.length ? (
            <div className="mt-3">
              <Notice tone="warn" title="Замечания разбора">
                <ul className="flex flex-col gap-1">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          ) : null}

          {programs.length ? (
            <Field label="Привязать к программе" className="mt-4">
              <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">Без программы</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <section className="mt-5">
            <SectionTitle>Предпросмотр</SectionTitle>
            <ul className="mt-2 flex flex-col gap-3">
              {preview.map((workout, workoutIndex) => (
                <li key={workoutIndex}>
                  <Card className="p-4">
                    <div className="flex items-center gap-2">
                      <TextInput
                        type="date"
                        value={workout.date ?? ''}
                        onChange={(e) => patchWorkout(workoutIndex, { date: e.target.value || null })}
                        density="compact"
                        className={cx('flex-1', !workout.date && 'border-warn/60')}
                      />
                      {workout.dayName ? <Badge>{workout.dayName}</Badge> : null}
                    </div>

                    {workout.warnings.length ? (
                      <ul className="mt-2 flex flex-col gap-1 text-[11.5px] text-warn">
                        {workout.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}

                    <ul className="mt-3 flex flex-col gap-2.5">
                      {workout.exercises.map((exercise, exerciseIndex) => (
                        <li
                          key={exerciseIndex}
                          className={cx(
                            'rounded-[var(--radius-tile)] border p-3',
                            exercise.exerciseId
                              ? 'border-line bg-surface2'
                              : 'border-warn/40 bg-warn/[0.07]',
                          )}
                        >
                          <p className="text-[13.5px] font-medium">{exercise.rawName}</p>

                          {exercise.exerciseId ? (
                            <p className="mt-0.5 text-[11.5px] text-dim">
                              → {exercise.matchedName}
                              {exercise.matchScore < 1
                                ? ` (совпадение ${Math.round(exercise.matchScore * 100)}%)`
                                : ''}
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-col gap-2">
                              <Select
                                value=""
                                onChange={(e) => {
                                  const picked = exercises.find((x) => x.id === e.target.value);
                                  if (picked) {
                                    patchExercise(workoutIndex, exerciseIndex, {
                                      exerciseId: picked.id,
                                      matchedName: picked.name,
                                    });
                                  }
                                }}
                                density="compact"
                              >
                                <option value="">Выбрать упражнение…</option>
                                {exercises.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                size="sm"
                                onClick={() =>
                                  createAndLink(workoutIndex, exerciseIndex, exercise.rawName)
                                }
                              >
                                СОЗДАТЬ «{exercise.rawName}»
                              </Button>
                            </div>
                          )}

                          <p className="tnum mt-2 text-[12.5px] text-dim">
                            {exercise.sets
                              .map((s) => `${formatWeight(s.weight)}×${s.reps}`)
                              .join('  ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-6 flex flex-col gap-2">
            <Button
              variant="primary"
              size="xl"
              full
              onClick={commit}
              disabled={!preview.some((w) => w.date && w.exercises.some((e) => e.exerciseId))}
            >
              ИМПОРТИРОВАТЬ
            </Button>
            <Button size="md" full variant="ghost" onClick={() => setPreview(null)}>
              НАЗАД К ТЕКСТУ
            </Button>
            <p className="px-1 text-[11.5px] leading-relaxed text-dim">
              Тренировки без даты и упражнения без совпадения будут пропущены.
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
