'use client';

import { useMemo, useState } from 'react';
import { BarList } from '@/components/charts/BarList';
import { LineTrend } from '@/components/charts/LineTrend';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import {
  Card,
  EmptyState,
  Eyebrow,
  LinkButton,
  Row,
  RowGroup,
  SectionTitle,
  SegmentedControl,
  Stat,
  cx,
} from '@/components/ui/primitives';
import {
  bodyWeightStats,
  muscleGroupStats,
  overviewStats,
  weekWindow,
  weeklyVolumeDelta,
  weeklyVolumeSeries,
  type DateWindow,
} from '@/engine/analytics';
import { formatDuration, formatVolume, formatWeight, MUSCLE_LABEL, pluralize } from '@/engine/format';
import { useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

type Scope = 'week' | 'month' | 'all';

/** PROGRESS — is the training actually going anywhere? */
export default function ProgressPage() {
  const history = useHistory();
  const exercises = useStore((s) => s.exercises);
  const bodyWeightLogs = useStore((s) => s.bodyWeightLogs);
  const [scope, setScope] = useState<Scope>('month');

  const now = useMemo(() => new Date(), []);

  const window: DateWindow | undefined = useMemo(() => {
    if (scope === 'all') return undefined;
    if (scope === 'week') return weekWindow(now, 0);
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: iso(start), end: iso(now) };
  }, [scope, now]);

  const stats = useMemo(() => overviewStats(history, window, now), [history, window, now]);
  const muscles = useMemo(
    () => muscleGroupStats(history, exercises, window),
    [history, exercises, window],
  );
  const volumeSeries = useMemo(() => weeklyVolumeSeries(history, 8, now), [history, now]);
  const volumeDelta = useMemo(() => weeklyVolumeDelta(history, now), [history, now]);
  const weight = useMemo(() => bodyWeightStats(bodyWeightLogs, now), [bodyWeightLogs, now]);

  if (!history.length) {
    return (
      <Screen>
        <ScreenHeader title="Прогресс" large />
        <Card>
          <EmptyState
            title="No data yet"
            description="Complete your first workout to start tracking progress."
            action={
              <LinkButton href="/" variant="primary" size="lg">
                НА ГЛАВНУЮ
              </LinkButton>
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Прогресс" large />

      <SegmentedControl
        value={scope}
        onChange={setScope}
        options={[
          { value: 'week', label: 'Неделя' },
          { value: 'month', label: '30 дней' },
          { value: 'all', label: 'Всё время' },
        ]}
      />

      <section className="mt-4">
        <Eyebrow className="px-1">Overview</Eyebrow>
        <Card className="mt-2 grid grid-cols-2 gap-y-5 p-5">
          <Stat label="Workouts" value={stats.workouts} />
          <Stat label="Total volume" value={formatVolume(stats.totalVolume)} unit="kg" />
          <Stat
            label="Avg workout"
            value={stats.avgDurationSeconds ? formatDuration(stats.avgDurationSeconds) : '—'}
          />
          <Stat label="PRs" value={stats.prCount} tone={stats.prCount ? 'accent' : 'default'} />
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Объём по неделям</SectionTitle>
        <Card className="mt-2 p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <Eyebrow>This week</Eyebrow>
              <p className="tnum mt-1 text-[26px] leading-none font-semibold">
                {formatVolume(volumeDelta.current)}
                <span className="ml-1.5 text-[13px] font-medium text-dim">kg</span>
              </p>
            </div>
            {volumeDelta.percent !== null ? (
              <div className="text-right">
                <p
                  className={cx(
                    'tnum text-[16px] font-semibold',
                    volumeDelta.percent >= 0 ? 'text-progress' : 'text-warn',
                  )}
                >
                  {volumeDelta.percent >= 0 ? '+' : ''}
                  {Math.round(volumeDelta.percent)}%
                </p>
                <p className="text-[10.5px] tracking-[0.08em] text-dim uppercase">vs last week</p>
              </div>
            ) : null}
          </div>

          <div className="mt-3">
            <LineTrend
              data={volumeSeries.map((p) => ({ label: p.label, value: Math.round(p.volume) }))}
              unit="kg"
              height={170}
            />
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Рабочие подходы по группам</SectionTitle>
        <Card className="mt-2 p-4">
          {muscles.length ? (
            <BarList
              items={muscles.map((m) => ({
                label: MUSCLE_LABEL[m.muscle],
                value: m.workingSets,
                hint: `${formatVolume(m.volume)} kg`,
              }))}
            />
          ) : (
            <p className="text-[13px] text-dim">Нет данных за выбранный период.</p>
          )}
          <p className="mt-3.5 border-t border-line pt-3 text-[11.5px] leading-relaxed text-dim">
            Вторичные группы мышц считаются как половина подхода.
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Дальше</SectionTitle>
        <RowGroup className="mt-2">
          <Row label="Личные рекорды" value={pluralize(stats.prCount, 'PR')} href="/records" />
          <Row
            label="Вес тела"
            value={weight.latest ? `${formatWeight(weight.latest.weight)} kg` : '—'}
            href="/more/body-weight"
          />
          <Row label="Прогресс по упражнениям" href="/progress/exercise" />
        </RowGroup>
      </section>
    </Screen>
  );
}
