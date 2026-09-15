'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LineTrend } from '@/components/charts/LineTrend';
import { Sheet } from '@/components/ui/Sheet';
import { TextArea } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Chip,
  Eyebrow,
  EmptyState,
  Notice,
  SegmentedControl,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import type { ID, NoteType, ObservationTag } from '@/domain/types';
import { METRIC_LABEL, progressionDelta, progressionSeries, type ProgressionMetric } from '@/engine/analytics';
import {
  DIFFICULTY_META,
  formatDateShort,
  formatRelativeDate,
  formatVolume,
  formatWeight,
  MODE_LABEL,
} from '@/engine/format';
import { exerciseHistory, HISTORY_RANGE_LABEL, type HistoryRange } from '@/engine/history';
import { personalRecords } from '@/engine/records';
import { useExercise, useExerciseNotes, useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

export type DetailTab = 'technique' | 'notes' | 'history' | 'progression';

export const OBSERVATION_LABEL: Record<ObservationTag, string> = {
  too_easy: 'Слишком легко',
  increase_weight: 'Поднять вес',
  decrease_weight: 'Снизить вес',
  pain: 'Боль',
  bad_technique: 'Плохая техника',
  form_breakdown: 'Техника сломалась',
  good_pump: 'Хороший памп',
};

/**
 * Everything about one exercise that is *not* needed mid-set: technique,
 * notes, full history, charts. Progressive disclosure — one tap away, never
 * in the way.
 */
export function ExerciseDetailsSheet({
  open,
  onClose,
  exerciseId,
  initialTab = 'technique',
  personalSettings = [],
  instructions = [],
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: ID | null;
  initialTab?: DetailTab;
  personalSettings?: { label: string; value: string }[];
  instructions?: string[];
}) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const exercise = useExercise(exerciseId);

  return (
    <Sheet open={open} onClose={onClose} title={exercise?.name ?? 'Упражнение'} size="full">
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'technique', label: 'Техника' },
          { value: 'notes', label: 'Заметки' },
          { value: 'history', label: 'История' },
          { value: 'progression', label: 'Динамика' },
        ]}
      />

      <div className="mt-4 pb-4">
        {tab === 'technique' ? (
          <TechniqueTab
            exerciseId={exerciseId}
            instructions={instructions}
            personalSettings={personalSettings}
          />
        ) : null}
        {tab === 'notes' ? <NotesTab exerciseId={exerciseId} /> : null}
        {tab === 'history' ? <HistoryTab exerciseId={exerciseId} /> : null}
        {tab === 'progression' ? <ProgressionTab exerciseId={exerciseId} /> : null}
      </div>
    </Sheet>
  );
}

function TechniqueTab({
  exerciseId,
  instructions,
  personalSettings,
}: {
  exerciseId: ID | null;
  instructions: string[];
  personalSettings: { label: string; value: string }[];
}) {
  const exercise = useExercise(exerciseId);
  const points = instructions.length ? instructions : (exercise?.keyPoints ?? []);

  return (
    <div className="flex flex-col gap-5">
      {exercise?.mediaUrl ? (
        // Users add their own gym-machine photos; a plain img keeps any source working.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={exercise.mediaUrl}
          alt={exercise.name}
          className="w-full rounded-[var(--radius-tile)] border border-line object-cover"
        />
      ) : null}

      <section>
        <Eyebrow>Ключевые моменты</Eyebrow>
        {points.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {points.map((point) => (
              <li key={point} className="flex gap-2.5 text-[14px] leading-relaxed">
                <span className="mt-0.5 shrink-0 text-accent">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13.5px] text-dim">
            Техника не заполнена. Её можно добавить в редакторе программы или в библиотеке.
          </p>
        )}
      </section>

      {personalSettings.length ? (
        <section>
          <Eyebrow>Настройки тренажёра</Eyebrow>
          <dl className="mt-2 divide-y divide-line overflow-hidden rounded-[var(--radius-tile)] border border-line">
            {personalSettings.map((setting) => (
              <div key={setting.label} className="flex items-center justify-between px-3.5 py-2.5">
                <dt className="text-[13.5px] text-dim">{setting.label}</dt>
                <dd className="text-[14px] font-medium">{setting.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {exercise ? (
        <section>
          <Eyebrow>Об упражнении</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{exercise.equipment}</Chip>
            <Chip>{exercise.primaryMuscle}</Chip>
            {exercise.secondaryMuscles.map((m) => (
              <Chip key={m}>{m}</Chip>
            ))}
            <Chip>шаг {formatWeight(exercise.increment)} кг</Chip>
          </div>
          {exercise.description ? (
            <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{exercise.description}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function NotesTab({ exerciseId }: { exerciseId: ID | null }) {
  const { pinned, permanent, observations } = useExerciseNotes(exerciseId);
  const addNote = useStore((s) => s.addNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const updateNote = useStore((s) => s.updateNote);
  const [draft, setDraft] = useState('');
  const [type, setType] = useState<NoteType>('permanent');

  if (!exerciseId) return null;

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    addNote(exerciseId, type, content);
    setDraft('');
  };

  const groups: { label: string; items: typeof pinned; tone?: 'warn' }[] = [
    { label: 'Важное (всегда на виду)', items: pinned, tone: 'warn' },
    { label: 'Постоянные заметки', items: permanent },
    { label: 'Наблюдения', items: observations },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <Eyebrow>Новая заметка</Eyebrow>
        <div className="mt-2">
          <SegmentedControl
            value={type}
            onChange={setType}
            options={[
              { value: 'permanent', label: 'Постоянная' },
              { value: 'pinned', label: 'Важная' },
              { value: 'observation', label: 'Наблюдение' },
            ]}
          />
        </div>
        <TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Например: рукоятки должны быть на уровне груди."
          className="mt-2.5 min-h-20"
        />
        <Button variant="primary" size="md" full className="mt-2.5" onClick={submit} disabled={!draft.trim()}>
          СОХРАНИТЬ
        </Button>
      </section>

      {groups.map((group) =>
        group.items.length ? (
          <section key={group.label}>
            <Eyebrow>{group.label}</Eyebrow>
            <ul className="mt-2 flex flex-col gap-2">
              {group.items.map((note) => (
                <li
                  key={note.id}
                  className={cx(
                    'rounded-[var(--radius-tile)] border p-3.5',
                    note.type === 'pinned'
                      ? 'border-warn/40 bg-warn/[0.08]'
                      : 'border-line bg-surface2',
                  )}
                >
                  <p className="text-[14px] leading-relaxed">
                    {note.type === 'pinned' ? '⚠️ ' : ''}
                    {note.content}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-[11px] text-faint">
                      {formatRelativeDate(note.createdAt.slice(0, 10))}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateNote(note.id, {
                          type: note.type === 'pinned' ? 'permanent' : 'pinned',
                        })
                      }
                      className="text-[11px] tracking-wide text-dim uppercase active:text-ink"
                    >
                      {note.type === 'pinned' ? 'Снять важность' : 'Сделать важной'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      aria-label="Удалить"
                      className="ml-auto text-dim active:text-pain"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function HistoryTab({ exerciseId }: { exerciseId: ID | null }) {
  const sessions = useStore((s) => s.sessions);
  const programs = useStore((s) => s.programs);
  const activeProgramId = useStore((s) => s.settings.activeProgramId);
  const [range, setRange] = useState<HistoryRange>('3m');
  /** `''` = every program, otherwise a specific one. */
  const [programFilter, setProgramFilter] = useState<string>('');

  const entries = useMemo(
    () =>
      exerciseId
        ? exerciseHistory(sessions, exerciseId, {
            range,
            programId: programFilter || null,
          })
        : [],
    [sessions, exerciseId, range, programFilter],
  );

  // Only offer programs this exercise was actually trained under.
  const trainedUnder = useMemo(() => {
    if (!exerciseId) return [];
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.status !== 'completed' || !session.programId) continue;
      if (session.exercises.some((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.actual))) {
        ids.add(session.programId);
      }
    }
    return programs.filter((p) => ids.has(p.id));
  }, [sessions, programs, exerciseId]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(HISTORY_RANGE_LABEL) as HistoryRange[]).map((key) => (
          <Chip key={key} selected={range === key} onClick={() => setRange(key)}>
            {HISTORY_RANGE_LABEL[key]}
          </Chip>
        ))}
      </div>

      {trainedUnder.length > 1 || (trainedUnder.length === 1 && trainedUnder[0].id !== activeProgramId) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip selected={programFilter === ''} onClick={() => setProgramFilter('')}>
            Все программы
          </Chip>
          {trainedUnder.map((program) => (
            <Chip
              key={program.id}
              selected={programFilter === program.id}
              onClick={() => setProgramFilter(program.id)}
            >
              {program.id === activeProgramId ? 'Текущая программа' : program.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {entries.length ? (
        <ul className="mt-4 flex flex-col gap-2.5">
          {entries.map((entry) => (
            <li
              key={`${entry.sessionId}-${entry.entry.id}`}
              className="rounded-[var(--radius-tile)] border border-line bg-surface2 p-3.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/history/session?id=${entry.sessionId}`}
                  className="text-[12px] font-semibold tracking-[0.1em] text-dim uppercase active:text-ink"
                >
                  {formatDateShort(entry.date)}
                </Link>
                <div className="flex items-center gap-2">
                  {entry.mode !== 'normal' ? <Badge>{MODE_LABEL[entry.mode]}</Badge> : null}
                  <span className="tnum text-[11.5px] text-dim">
                    {formatVolume(entry.volume)} кг
                  </span>
                </div>
              </div>

              <ul className="tnum mt-2 flex flex-col gap-1">
                {entry.entry.sets
                  .filter((set) => set.actual)
                  .map((set) => (
                    <li key={set.id} className="flex items-center gap-2 text-[14.5px]">
                      <span className="w-4 text-[11px] text-faint">{set.setNumber}</span>
                      <span>
                        {formatWeight(set.actual!.weight)} × {set.actual!.reps}
                      </span>
                      {set.actual!.difficulty ? (
                        <span className="text-[13px]">
                          {DIFFICULTY_META[set.actual!.difficulty].emoji}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>

              {entry.entry.note ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-dim">{entry.entry.note}</p>
              ) : null}
              {entry.entry.observations.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.entry.observations.map((tag) => (
                    <Badge key={tag} color={tag === 'pain' ? 'var(--status-pain)' : undefined}>
                      {OBSERVATION_LABEL[tag]}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Пока нет данных"
          description="Выполните первую тренировку, чтобы начать отслеживать прогресс."
        />
      )}
    </div>
  );
}

function ProgressionTab({ exerciseId }: { exerciseId: ID | null }) {
  const history = useHistory();
  const exercise = useExercise(exerciseId);
  const [metric, setMetric] = useState<ProgressionMetric>('weight');

  const series = useMemo(
    () => (exerciseId ? progressionSeries(history, exerciseId, metric) : []),
    [history, exerciseId, metric],
  );
  const change = useMemo(() => progressionDelta(series, 30), [series]);
  const records = useMemo(
    () => (exerciseId ? personalRecords(history, exerciseId, exercise?.name ?? '') : null),
    [history, exerciseId, exercise],
  );

  const unit = metric === 'reps' ? 'повт.' : 'кг';

  return (
    <div>
      <SegmentedControl
        value={metric}
        onChange={setMetric}
        options={(['weight', 'reps', 'volume', 'performance'] as ProgressionMetric[]).map((m) => ({
          value: m,
          label: METRIC_LABEL[m],
        }))}
      />

      <div className="mt-4">
        <LineTrend data={series} unit={unit} />
      </div>

      {change.percent !== null ? (
        <p className="mt-2 text-[13px]">
          <span
            className={cx(
              'tnum font-semibold',
              change.percent >= 0 ? 'text-progress' : 'text-warn',
            )}
          >
            {change.percent >= 0 ? '+' : ''}
            {Math.round(change.percent)}%
          </span>
          <span className="ml-2 text-dim">за последние 30 дней</span>
        </p>
      ) : null}

      {records?.bestPerformance ? (
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <RecordTile
            label="Максимальный вес"
            value={`${formatWeight(records.maxWeight!.value)} кг`}
            hint={`× ${records.maxWeight!.reps} · ${formatDateShort(records.maxWeight!.date)}`}
          />
          <RecordTile
            label="Максимум повторений"
            value={String(records.maxReps!.value)}
            hint={`${formatWeight(records.maxReps!.weight)} кг · ${formatDateShort(records.maxReps!.date)}`}
          />
          <RecordTile
            label="Лучший подход"
            value={`${formatVolume(records.maxSetVolume!.value)} кг`}
            hint={`${formatWeight(records.maxSetVolume!.weight)} × ${records.maxSetVolume!.reps}`}
          />
          <RecordTile
            label="Лучший результат"
            value={`${formatWeight(Math.round(records.bestPerformance.value * 10) / 10)} кг`}
            hint={`${formatWeight(records.bestPerformance.weight)} × ${records.bestPerformance.reps}`}
          />
        </div>
      ) : (
        <div className="mt-4">
          <Notice tone="info">Рекорды появятся после второй тренировки этого упражнения.</Notice>
        </div>
      )}
    </div>
  );
}

function RecordTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-line bg-surface2 p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <p className="tnum mt-1 text-[19px] leading-none font-semibold">{value}</p>
      {hint ? <p className="tnum mt-1 text-[11.5px] text-dim">{hint}</p> : null}
    </div>
  );
}
