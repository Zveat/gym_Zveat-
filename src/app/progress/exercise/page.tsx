'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { LineTrend } from '@/components/charts/LineTrend';
import { Sparkline } from '@/components/charts/Sparkline';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Card,
  Chevron,
  EmptyState,
  Eyebrow,
  SectionTitle,
  SegmentedControl,
  cx,
} from '@/components/ui/primitives';
import type { ID } from '@/domain/types';
import {
  METRIC_LABEL,
  progressionDelta,
  progressionSeries,
  type ProgressionMetric,
} from '@/engine/analytics';
import {
  DIFFICULTY_META,
  formatDateShort,
  formatVolume,
  formatWeight,
  MODE_LABEL,
  MUSCLE_LABEL,
} from '@/engine/format';
import { exerciseFrequency, exerciseHistory, HISTORY_RANGE_LABEL, type HistoryRange } from '@/engine/history';
import { normalizeName } from '@/engine/import-parser';
import { personalRecords } from '@/engine/records';
import { useExerciseMap, useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * Exercise progression: the chart, the records, and the full set-by-set
 * history. With no `id` it lists every exercise that has data.
 */
export default function ExerciseProgressPage() {
  return (
    <Suspense fallback={<Screen />}>
      <ExerciseProgress />
    </Suspense>
  );
}

function ExerciseProgress() {
  const exerciseId = useSearchParams().get('id');
  return exerciseId ? <SingleExercise exerciseId={exerciseId} /> : <ExerciseIndex />;
}

function ExerciseIndex() {
  const history = useHistory();
  const library = useExerciseMap();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const ids = new Set<ID>();
    for (const session of history) {
      for (const entry of session.exercises) {
        if (entry.sets.some((s) => s.actual)) ids.add(entry.exerciseId);
      }
    }
    const q = normalizeName(query);
    return [...ids]
      .map((id) => {
        const series = progressionSeries(history, id, 'weight');
        const name = library.get(id)?.name ?? id;
        return {
          id,
          name,
          muscle: library.get(id)?.primaryMuscle,
          sessions: exerciseFrequency(history, id),
          latest: series.at(-1)?.value ?? 0,
          change: progressionDelta(series, 90).percent,
          spark: series.map((p) => p.value),
        };
      })
      .filter((row) => (q ? normalizeName(row.name).includes(q) : true))
      .sort((a, b) => b.sessions - a.sessions);
  }, [history, library, query]);

  return (
    <Screen>
      <ScreenHeader title="Прогресс по упражнениям" back="/progress" />

      {rows.length ? (
        <>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск упражнения"
            inputMode="search"
          />

          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/progress/exercise?id=${row.id}`}>
                  <Card className="flex items-center gap-3 p-4 active:bg-surface2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{row.name}</p>
                      <p className="tnum mt-1 text-[12px] text-dim">
                        {row.muscle ? `${MUSCLE_LABEL[row.muscle]} · ` : ''}
                        {row.sessions} тренировок · {formatWeight(row.latest)} kg
                      </p>
                    </div>

                    {row.spark.length > 1 ? (
                      <Sparkline
                        values={row.spark}
                        color={
                          (row.change ?? 0) >= 0 ? 'var(--color-accent)' : 'var(--status-warning)'
                        }
                      />
                    ) : null}

                    {row.change !== null ? (
                      <span
                        className={cx(
                          'tnum shrink-0 text-[12.5px] font-semibold',
                          row.change >= 0 ? 'text-progress' : 'text-warn',
                        )}
                      >
                        {row.change >= 0 ? '+' : ''}
                        {Math.round(row.change)}%
                      </span>
                    ) : null}
                    <Chevron />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Card>
          <EmptyState
            title="No data yet"
            description="Complete your first workout to start tracking progress."
          />
        </Card>
      )}
    </Screen>
  );
}

function SingleExercise({ exerciseId }: { exerciseId: ID }) {
  const sessions = useStore((s) => s.sessions);
  const history = useHistory();
  const library = useExerciseMap();
  const activeProgramId = useStore((s) => s.settings.activeProgramId);
  const exercise = library.get(exerciseId) ?? null;

  const [metric, setMetric] = useState<ProgressionMetric>('weight');
  const [range, setRange] = useState<HistoryRange>('3m');

  const series = useMemo(() => progressionSeries(history, exerciseId, metric), [history, exerciseId, metric]);
  const change30 = useMemo(() => progressionDelta(series, 30), [series]);
  const records = useMemo(
    () => personalRecords(history, exerciseId, exercise?.name ?? ''),
    [history, exerciseId, exercise],
  );
  const entries = useMemo(
    () => exerciseHistory(sessions, exerciseId, { range }),
    [sessions, exerciseId, range],
  );

  return (
    <Screen>
      <ScreenHeader
        title={exercise?.name ?? 'Упражнение'}
        subtitle={exercise ? MUSCLE_LABEL[exercise.primaryMuscle] : undefined}
        back="/progress/exercise"
      />

      <SegmentedControl
        value={metric}
        onChange={setMetric}
        options={(['weight', 'reps', 'volume', 'performance'] as ProgressionMetric[]).map((m) => ({
          value: m,
          label: METRIC_LABEL[m],
        }))}
      />

      <Card className="mt-3 p-4">
        <Eyebrow>{metric === 'weight' ? 'Working weight' : METRIC_LABEL[metric]}</Eyebrow>
        <div className="mt-2">
          <LineTrend data={series} unit={metric === 'reps' ? 'reps' : 'kg'} height={200} />
        </div>
        {change30.percent !== null ? (
          <p className="mt-2 text-[13px]">
            <span
              className={cx(
                'tnum font-semibold',
                change30.percent >= 0 ? 'text-progress' : 'text-warn',
              )}
            >
              {change30.percent >= 0 ? '+' : ''}
              {Math.round(change30.percent)}%
            </span>
            <span className="ml-2 text-dim">LAST 30 DAYS</span>
          </p>
        ) : null}
      </Card>

      {records.maxWeight ? (
        <section className="mt-6">
          <SectionTitle>Personal records</SectionTitle>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <RecordTile
              label="Max weight"
              value={`${formatWeight(records.maxWeight.value)} kg`}
              hint={`× ${records.maxWeight.reps} · ${formatDateShort(records.maxWeight.date)}`}
            />
            <RecordTile
              label="Max reps"
              value={String(records.maxReps!.value)}
              hint={`${formatWeight(records.maxReps!.weight)} kg · ${formatDateShort(records.maxReps!.date)}`}
            />
            <RecordTile
              label="Best set"
              value={`${formatVolume(records.maxSetVolume!.value)} kg`}
              hint={`${formatWeight(records.maxSetVolume!.weight)} × ${records.maxSetVolume!.reps}`}
            />
            <RecordTile
              label="Best performance"
              value={`${formatWeight(Math.round(records.bestPerformance!.value * 10) / 10)} kg`}
              hint={`${formatWeight(records.bestPerformance!.weight)} × ${records.bestPerformance!.reps}`}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <SectionTitle>История</SectionTitle>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(HISTORY_RANGE_LABEL) as HistoryRange[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={cx(
                'rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                range === key
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line-strong text-dim active:bg-surface2',
              )}
            >
              {HISTORY_RANGE_LABEL[key]}
            </button>
          ))}
        </div>

        {entries.length ? (
          <ul className="mt-3 flex flex-col gap-2.5">
            {entries.map((entry) => (
              <li key={`${entry.sessionId}-${entry.entry.id}`}>
                <Card className="p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      href={`/history/session?id=${entry.sessionId}`}
                      className="eyebrow active:text-ink"
                    >
                      {formatDateShort(entry.date)}
                    </Link>
                    <span className="flex items-center gap-2">
                      {entry.mode !== 'normal' ? <Badge>{MODE_LABEL[entry.mode]}</Badge> : null}
                      {entry.programId && entry.programId !== activeProgramId ? (
                        <Badge>{entry.programName}</Badge>
                      ) : null}
                      <span className="tnum text-[11.5px] text-dim">
                        {formatVolume(entry.volume)} kg
                      </span>
                    </span>
                  </div>

                  <ul className="tnum mt-2 flex flex-col gap-0.5">
                    {entry.entry.sets
                      .filter((s) => s.actual)
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
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="mt-3">
            <EmptyState title="No data yet" description="За выбранный период данных нет." />
          </Card>
        )}
      </section>
    </Screen>
  );
}

function RecordTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-tile)] border border-line bg-surface p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <p className="tnum mt-1 text-[19px] leading-none font-semibold">{value}</p>
      {hint ? <p className="tnum mt-1 text-[11.5px] text-dim">{hint}</p> : null}
    </div>
  );
}
