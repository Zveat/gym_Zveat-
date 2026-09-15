'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { TextInput } from '@/components/ui/inputs';
import {
  Card,
  Chevron,
  EmptyState,
  LinkButton,
  SegmentedControl,
  cx,
} from '@/components/ui/primitives';
import { allPersonalRecords } from '@/engine/analytics';
import { formatDateShort, formatVolume, formatWeight } from '@/engine/format';
import { normalizeName } from '@/engine/import-parser';
import { useExerciseMap, useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

type RecordKind = 'weight' | 'reps' | 'volume' | 'performance';

const KIND_LABEL: Record<RecordKind, string> = {
  weight: 'Max weight',
  reps: 'Max reps',
  volume: 'Max volume',
  performance: 'Best',
};

/** PERSONAL RECORDS — one line per exercise, sorted by the chosen record. */
export default function RecordsPage() {
  const history = useHistory();
  const exercises = useStore((s) => s.exercises);
  const library = useExerciseMap();
  const [kind, setKind] = useState<RecordKind>('weight');
  const [query, setQuery] = useState('');

  const records = useMemo(() => allPersonalRecords(history, exercises), [history, exercises]);

  const rows = useMemo(() => {
    const q = normalizeName(query);
    return records
      .filter((r) => (q ? normalizeName(r.exerciseName).includes(q) : true))
      .map((r) => {
        const value =
          kind === 'weight'
            ? r.maxWeight
              ? `${formatWeight(r.maxWeight.value)} kg × ${r.maxWeight.reps}`
              : '—'
            : kind === 'reps'
              ? r.maxReps
                ? `${r.maxReps.value} × ${formatWeight(r.maxReps.weight)} kg`
                : '—'
              : kind === 'volume'
                ? r.maxSessionVolume
                  ? `${formatVolume(r.maxSessionVolume.value)} kg`
                  : '—'
                : r.bestPerformance
                  ? `${formatWeight(Math.round(r.bestPerformance.value * 10) / 10)} kg`
                  : '—';

        const date =
          kind === 'weight'
            ? r.maxWeight?.date
            : kind === 'reps'
              ? r.maxReps?.date
              : kind === 'volume'
                ? r.maxSessionVolume?.date
                : r.bestPerformance?.date;

        const sortValue =
          kind === 'weight'
            ? (r.maxWeight?.value ?? 0)
            : kind === 'reps'
              ? (r.maxReps?.value ?? 0)
              : kind === 'volume'
                ? (r.maxSessionVolume?.value ?? 0)
                : (r.bestPerformance?.value ?? 0);

        return { ...r, value, date, sortValue, muscle: library.get(r.exerciseId)?.primaryMuscle };
      })
      .sort((a, b) => b.sortValue - a.sortValue);
  }, [records, kind, query, library]);

  return (
    <Screen>
      <ScreenHeader title="Личные рекорды" back="/progress" />

      {records.length ? (
        <>
          <SegmentedControl
            value={kind}
            onChange={setKind}
            options={(Object.keys(KIND_LABEL) as RecordKind[]).map((k) => ({
              value: k,
              label: KIND_LABEL[k],
            }))}
          />

          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск упражнения"
            inputMode="search"
            className="mt-3"
          />

          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((row, index) => (
              <li key={row.exerciseId}>
                <Link href={`/progress/exercise?id=${row.exerciseId}`}>
                  <Card className="flex items-center gap-3 p-4 active:bg-surface2">
                    <span
                      className={cx(
                        'tnum w-6 shrink-0 text-[12px] font-semibold',
                        index === 0 ? 'text-accent' : 'text-faint',
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{row.exerciseName}</p>
                      <p className="tnum mt-0.5 text-[11.5px] text-dim">
                        {row.date ? formatDateShort(row.date) : '—'}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-[15px] font-semibold">{row.value}</span>
                    <Chevron />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-dim">
            «Best» — оценка одноповторного максимума по формуле Эпли: она позволяет сравнить
            60×8 и 50×12. Разминочные подходы в рекорды не попадают.
          </p>
        </>
      ) : (
        <Card>
          <EmptyState
            title="No records yet"
            description="Рекорды появляются со второй тренировки упражнения — первой не с чем сравнивать."
            action={
              <LinkButton href="/" variant="primary" size="lg">
                НА ГЛАВНУЮ
              </LinkButton>
            }
          />
        </Card>
      )}
    </Screen>
  );
}
