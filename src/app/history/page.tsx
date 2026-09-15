'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import {
  Badge,
  Card,
  Chevron,
  EmptyState,
  Eyebrow,
  LinkButton,
  SegmentedControl,
  cx,
} from '@/components/ui/primitives';
import { MODE_COLOR, MODE_ORDER } from '@/domain/modes';
import type { WorkoutSession } from '@/domain/types';
import {
  count,
  formatDuration,
  formatRelativeDate,
  formatVolume,
  MODE_LABEL,
  parseDate,
  WORDS,
} from '@/engine/format';
import { sessionVolume, sessionWorkingSetCount } from '@/engine/volume';
import { useHistory } from '@/store/selectors';

/** WORKOUT HISTORY — a list, or a calendar colour-coded by mode. */
export default function HistoryPage() {
  const history = useHistory();
  const [view, setView] = useState<'list' | 'calendar'>('list');

  return (
    <Screen>
      <ScreenHeader
        title="История"
        large
        subtitle={history.length ? count(history.length, WORDS.workout) : undefined}
        right={
          <LinkButton href="/history/add" size="sm">
            + ВНЕСТИ
          </LinkButton>
        }
      />

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: 'Список' },
          { value: 'calendar', label: 'Календарь' },
        ]}
      />

      {!history.length ? (
        <Card className="mt-4">
          <EmptyState
            title="Истории пока нет"
            description="Проведите первую тренировку или внесите прошлые из заметок — приложение сразу начнёт строить прогресс."
            action={
              <LinkButton href="/more/import" variant="primary" size="lg">
                ИМПОРТ ИСТОРИИ
              </LinkButton>
            }
          />
        </Card>
      ) : view === 'list' ? (
        <SessionList sessions={history} />
      ) : (
        <CalendarView sessions={history} />
      )}
    </Screen>
  );
}

function SessionList({ sessions }: { sessions: WorkoutSession[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    for (const session of sessions) {
      const d = parseDate(session.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, [...(map.get(key) ?? []), session]);
    }
    return [...map.entries()];
  }, [sessions]);

  const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];

  return (
    <div className="mt-5 flex flex-col gap-6">
      {groups.map(([key, group]) => {
        const [year, month] = key.split('-').map(Number);
        const volume = group.reduce((sum, s) => sum + sessionVolume(s), 0);
        return (
          <section key={key}>
            <div className="flex items-baseline justify-between px-1">
              <Eyebrow>
                {MONTH_NAMES[month - 1]} {year}
              </Eyebrow>
              <span className="tnum text-[11.5px] text-dim">
                {group.length} · {formatVolume(volume)} кг
              </span>
            </div>

            <ul className="mt-2 flex flex-col gap-2">
              {group.map((session) => (
                <li key={session.id}>
                  <Link href={`/history/session?id=${session.id}`}>
                    <Card className="flex items-center gap-3 p-4 active:bg-surface2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="eyebrow">{session.workoutDayName}</span>
                          <Badge color={MODE_COLOR[session.mode]}>
                            {MODE_LABEL[session.mode]}
                          </Badge>
                          {session.isImported ? <Badge>Внесено вручную</Badge> : null}
                        </div>
                        <p className="mt-1 truncate text-[15px] font-medium">
                          {session.workoutDayTitle || session.programName}
                        </p>
                        <p className="tnum mt-1 text-[12px] text-dim">
                          {formatRelativeDate(session.date)}
                          {session.durationSeconds
                            ? ` · ${formatDuration(session.durationSeconds)}`
                            : ''}
                          {` · ${count(sessionWorkingSetCount(session), WORDS.set)}`}
                          {` · ${formatVolume(sessionVolume(session))} кг`}
                        </p>
                      </div>
                      <Chevron />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function CalendarView({ sessions }: { sessions: WorkoutSession[] }) {
  const [offset, setOffset] = useState(0);

  const { label, cells, monthSessions } = useMemo(() => {
    const base = new Date();
    const view = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const year = view.getFullYear();
    const month = view.getMonth();

    const byDate = new Map<string, WorkoutSession[]>();
    for (const session of sessions) {
      byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
    }

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const list: { key: string; day: number | null; sessions: WorkoutSession[] }[] = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push({ key: `pad-${i}`, day: null, sessions: [] });
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      list.push({ key: iso, day: d, sessions: byDate.get(iso) ?? [] });
    }

    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(view);
    const inMonth = sessions.filter((s) => {
      const d = parseDate(s.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    return { label: monthName, cells: list, monthSessions: inMonth };
  }, [offset, sessions]);

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          className="touch flex items-center justify-center rounded-xl px-3 text-dim active:bg-surface2"
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <p className="text-[15px] font-semibold capitalize">{label}</p>
        <button
          type="button"
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset >= 0}
          className="touch flex items-center justify-center rounded-xl px-3 text-dim disabled:opacity-30 active:bg-surface2"
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10.5px] text-faint">
            {w}
          </div>
        ))}

        {cells.map((cell) => {
          if (cell.day === null) return <div key={cell.key} />;
          const session = cell.sessions[0];
          const isToday = cell.key === todayIso;

          const content = (
            <div
              className={cx(
                'flex aspect-square flex-col items-center justify-center rounded-xl border text-[13px]',
                session
                  ? 'border-transparent'
                  : isToday
                    ? 'border-line-strong bg-surface'
                    : 'border-line bg-surface/40 text-dim',
              )}
              style={
                session
                  ? {
                      background: `${MODE_COLOR[session.mode]}22`,
                      borderColor: `${MODE_COLOR[session.mode]}66`,
                      color: MODE_COLOR[session.mode],
                    }
                  : undefined
              }
            >
              <span className="tnum font-medium">{cell.day}</span>
              {cell.sessions.length > 1 ? (
                <span className="text-[9px] opacity-80">×{cell.sessions.length}</span>
              ) : null}
            </div>
          );

          return session ? (
            <Link key={cell.key} href={`/history/session?id=${session.id}`}>
              {content}
            </Link>
          ) : (
            <div key={cell.key}>{content}</div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 px-1">
        {MODE_ORDER.map((mode) => (
          <span key={mode} className="flex items-center gap-1.5 text-[11.5px] text-dim">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: MODE_COLOR[mode] }}
            />
            {MODE_LABEL[mode]}
          </span>
        ))}
      </div>

      <p className="tnum mt-4 px-1 text-[12px] text-dim">
        В этом месяце: {monthSessions.length} тренировок ·{' '}
        {formatVolume(monthSessions.reduce((sum, s) => sum + sessionVolume(s), 0))} кг
      </p>
    </div>
  );
}
