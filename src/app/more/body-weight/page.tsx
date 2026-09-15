'use client';

import { useMemo, useState } from 'react';
import { LineTrend } from '@/components/charts/LineTrend';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, TextInput } from '@/components/ui/inputs';
import {
  Button,
  Card,
  EmptyState,
  SectionTitle,
  SegmentedControl,
  Stat,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { todayString } from '@/domain/ids';
import type { BodyWeightGoal } from '@/domain/types';
import { bodyWeightStats } from '@/engine/analytics';
import { formatDateShort, formatWeight } from '@/engine/format';
import { useStore } from '@/store/useStore';

type Range = 'week' | 'month' | '3m' | 'year' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  week: 7,
  month: 30,
  '3m': 90,
  year: 365,
  all: null,
};

const GOAL_LABEL: Record<BodyWeightGoal, string> = {
  bulk: 'Набор',
  maintain: 'Поддержание',
  cut: 'Сушка',
};

/** BODY WEIGHT — one number a day, and whether it is moving the right way. */
export default function BodyWeightPage() {
  const logs = useStore((s) => s.bodyWeightLogs);
  const goal = useStore((s) => s.settings.bodyWeightGoal);
  const addBodyWeight = useStore((s) => s.addBodyWeight);
  const deleteBodyWeight = useStore((s) => s.deleteBodyWeight);
  const updateSettings = useStore((s) => s.updateSettings);

  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayString());
  const [range, setRange] = useState<Range>('month');

  const stats = useMemo(() => bodyWeightStats(logs), [logs]);

  const sorted = useMemo(
    () => logs.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [logs],
  );

  const series = useMemo(() => {
    const days = RANGE_DAYS[range];
    const cutoff = days
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - days);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : null;

    return sorted
      .filter((log) => (cutoff ? log.date >= cutoff : true))
      .slice()
      .reverse()
      .map((log) => ({
        label: formatDateShort(log.date),
        value: log.weight,
        date: log.date,
      }));
  }, [sorted, range]);

  const submit = () => {
    const value = parseFloat(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    addBodyWeight(Math.round(value * 10) / 10, date);
    setWeight('');
  };

  const changeTone = (value: number | null) => {
    if (value === null || value === 0) return 'default' as const;
    if (goal === 'cut') return value < 0 ? ('progress' as const) : ('warn' as const);
    if (goal === 'bulk') return value > 0 ? ('progress' as const) : ('warn' as const);
    return 'default' as const;
  };

  return (
    <Screen>
      <ScreenHeader title="Вес тела" back="/more" />

      <Card className="p-4">
        <div className="flex items-end gap-2">
          <Field label="Вес, кг" className="flex-1">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="80.2"
              className="tnum text-[20px]"
            />
          </Field>
          <Field label="Дата" className="flex-1">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="primary"
          size="lg"
          full
          className="mt-3"
          onClick={submit}
          disabled={!weight.trim()}
        >
          ДОБАВИТЬ
        </Button>
      </Card>

      <section className="mt-6">
        <SectionTitle>Цель</SectionTitle>
        <div className="mt-2">
          <SegmentedControl
            value={goal}
            onChange={(bodyWeightGoal) => updateSettings({ bodyWeightGoal })}
            options={(Object.keys(GOAL_LABEL) as BodyWeightGoal[]).map((g) => ({
              value: g,
              label: GOAL_LABEL[g],
            }))}
          />
        </div>
      </section>

      {stats.latest ? (
        <>
          <Card className="mt-6 grid grid-cols-3 divide-x divide-line">
            <div className="px-3 py-4">
              <Stat label="Сейчас" value={formatWeight(stats.latest.weight)} unit="kg" />
            </div>
            <div className="px-3 py-4">
              <Stat
                label="7 дней"
                value={
                  stats.change7d === null
                    ? '—'
                    : `${stats.change7d > 0 ? '+' : ''}${formatWeight(stats.change7d)}`
                }
                tone={changeTone(stats.change7d)}
              />
            </div>
            <div className="px-3 py-4">
              <Stat
                label="30 дней"
                value={
                  stats.change30d === null
                    ? '—'
                    : `${stats.change30d > 0 ? '+' : ''}${formatWeight(stats.change30d)}`
                }
                tone={changeTone(stats.change30d)}
              />
            </div>
          </Card>

          <section className="mt-6">
            <SectionTitle>Динамика</SectionTitle>
            <div className="mt-2">
              <SegmentedControl
                value={range}
                onChange={setRange}
                options={[
                  { value: 'week', label: 'Нед' },
                  { value: 'month', label: 'Мес' },
                  { value: '3m', label: '3 мес' },
                  { value: 'year', label: 'Год' },
                  { value: 'all', label: 'Всё' },
                ]}
              />
            </div>
            <Card className="mt-2 p-4">
              <LineTrend data={series} unit="kg" height={200} color="var(--status-info)" />
            </Card>
          </section>

          <section className="mt-6">
            <SectionTitle>Записи</SectionTitle>
            <ul className="mt-2 flex flex-col gap-1.5">
              {sorted.map((log, index) => {
                const previous = sorted[index + 1];
                const diff = previous ? Math.round((log.weight - previous.weight) * 10) / 10 : null;
                return (
                  <li
                    key={log.id}
                    className="flex items-center gap-3 rounded-[var(--radius-tile)] border border-line bg-surface px-3.5 py-2.5"
                  >
                    <span className="tnum w-[70px] shrink-0 text-[12px] text-dim">
                      {formatDateShort(log.date)}
                    </span>
                    <span className="tnum flex-1 text-[15px] font-medium">
                      {formatWeight(log.weight)} kg
                    </span>
                    {diff !== null && diff !== 0 ? (
                      <span
                        className={cx(
                          'tnum shrink-0 text-[12px]',
                          diff > 0 ? 'text-progress' : 'text-warn',
                        )}
                      >
                        {diff > 0 ? '+' : ''}
                        {formatWeight(diff)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteBodyWeight(log.id)}
                      aria-label="Удалить запись"
                      className="touch flex shrink-0 items-center justify-center text-dim active:text-pain"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <Card className="mt-6">
          <EmptyState
            title="No data yet"
            description="Добавьте первое измерение — дальше приложение само покажет динамику."
          />
        </Card>
      )}
    </Screen>
  );
}
