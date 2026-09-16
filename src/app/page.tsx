'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Screen } from '@/components/layout/Screen';
import { InstallHint } from '@/components/layout/DisplayMode';
import {
  Badge,
  Card,
  Chevron,
  Eyebrow,
  LinkButton,
  Notice,
  ProgressBar,
  SectionTitle,
  Stat,
  cx,
} from '@/components/ui/primitives';
import { MODE_COLOR } from '@/domain/modes';
import {
  count,
  formatDateLong,
  formatDuration,
  formatRelativeDate,
  formatVolume,
  greeting,
  MODE_LABEL,
  WORDS,
} from '@/engine/format';
import { overviewStats, weekWindow } from '@/engine/analytics';
import { goalStatus } from '@/engine/goal';
import { sessionProgress } from '@/engine/session';
import { sessionVolume, sessionWorkingSetCount } from '@/engine/volume';
import { workoutStreak } from '@/engine/history';
import {
  daySummary,
  useActivePain,
  useActiveProgram,
  useActiveSession,
  useHistory,
  useSuggestedDay,
} from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * HOME — the answer to "what am I doing today?" in one screen, above the fold:
 * the next workout, one button to start it, and whether the week is on track.
 */
export default function HomePage() {
  const userName = useStore((s) => s.settings.userName);
  const program = useActiveProgram();
  const suggestedDay = useSuggestedDay(program);
  const activeWorkout = useActiveSession();
  const history = useHistory();
  const pain = useActivePain();

  const now = useMemo(() => new Date(), []);
  const week = useMemo(() => overviewStats(history, weekWindow(now, 0), now), [history, now]);
  const streak = useMemo(() => workoutStreak(history, now), [history, now]);
  const goal = useStore((s) => s.settings.workoutGoal ?? null);
  const goalProgress = useMemo(
    () => (goal ? goalStatus(goal, history, now) : null),
    [goal, history, now],
  );
  const lastWorkout = history[0] ?? null;

  return (
    <Screen>
      <header className="mb-6">
        <Eyebrow>
          {greeting(now)}, {userName}
        </Eyebrow>
        <p className="mt-1 text-[13px] text-dim">{formatDateLong(now)}</p>
      </header>

      <div className="mb-4 empty:mb-0">
        <InstallHint />
      </div>

      {activeWorkout ? (
        <ResumeCard session={activeWorkout} />
      ) : program && suggestedDay ? (
        <NextWorkoutCard
          programName={program.name}
          dayId={suggestedDay.id}
          dayName={suggestedDay.name}
          dayTitle={suggestedDay.title}
          {...daySummary(suggestedDay)}
        />
      ) : (
        <Card className="p-5">
          <Eyebrow>Нет активной программы</Eyebrow>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">
            Создайте программу, и она появится здесь вместе с кнопкой запуска тренировки.
          </p>
          <LinkButton href="/programs" variant="primary" size="lg" full className="mt-4">
            К ПРОГРАММАМ
          </LinkButton>
        </Card>
      )}

      {pain.length ? (
        <div className="mt-4">
          <Notice tone="warn" title="⚠️ Активная заметка">
            Ранее вы отмечали дискомфорт:{' '}
            <span className="font-medium text-ink">
              {pain[0].bodyPart} {pain[0].severity}/10
            </span>{' '}
            ({formatRelativeDate(pain[0].date, now).toLowerCase()}). Будьте внимательнее с нагрузкой.
          </Notice>
        </div>
      ) : null}

      {/*
        Цель одной строкой: сколько сделано, на сколько опережение или
        отставание. Подробности — на «Прогрессе», сюда они не влезают и не
        нужны каждый день.
      */}
      {goal ? (
        <Link href="/progress" className="mt-4 block">
          <Card className="flex items-center gap-3 p-4 active:bg-surface2">
            <div className="min-w-0 flex-1">
              <Eyebrow>Цель</Eyebrow>
              <p className="tnum mt-1 text-[15px] font-semibold">
                {goalProgress!.done} / {goalProgress!.target}
                <span className="ml-2 text-[12.5px] font-medium text-dim">
                  день {Math.min(goalProgress!.dayNumber, goalProgress!.totalDays)} из{' '}
                  {goalProgress!.totalDays}
                </span>
              </p>
              <ProgressBar value={goalProgress!.ratio} className="mt-2" />
            </div>
            <Chevron />
          </Card>
        </Link>
      ) : null}

      <section className="mt-6">
        <SectionTitle>Эта неделя</SectionTitle>
        <Card className="mt-2 grid grid-cols-3 divide-x divide-line">
          <div className="px-4 py-4">
            <Stat label="Тренировок" value={week.workouts} />
          </div>
          <div className="px-4 py-4">
            <Stat label="Объём" value={formatVolume(week.totalVolume)} unit="кг" />
          </div>
          <div className="px-4 py-4">
            <Stat label="Серия" value={streak} tone={streak > 0 ? 'accent' : 'default'} />
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle
          action={
            history.length ? (
              <Link href="/history" className="text-[12px] text-dim active:text-ink">
                Вся история
              </Link>
            ) : null
          }
        >
          Последняя тренировка
        </SectionTitle>

        {lastWorkout ? (
          <Link href={`/history/session?id=${lastWorkout.id}`} className="mt-2 block">
            <Card className="flex items-center gap-3 p-4 active:bg-surface2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="eyebrow">{lastWorkout.workoutDayName}</span>
                  <Badge color={MODE_COLOR[lastWorkout.mode]}>{MODE_LABEL[lastWorkout.mode]}</Badge>
                </div>
                <p className="mt-1 truncate text-[15px] font-medium">
                  {lastWorkout.workoutDayTitle || lastWorkout.programName}
                </p>
                <p className="tnum mt-1 text-[12px] text-dim">
                  {formatRelativeDate(lastWorkout.date, now)}
                  {lastWorkout.durationSeconds
                    ? ` · ${formatDuration(lastWorkout.durationSeconds)}`
                    : ''}
                  {` · ${count(sessionWorkingSetCount(lastWorkout), WORDS.set)}`}
                  {` · ${formatVolume(sessionVolume(lastWorkout))} кг`}
                </p>
              </div>
              <Chevron />
            </Card>
          </Link>
        ) : (
          <Card className="mt-2 p-5">
            <p className="text-[14px] leading-relaxed text-dim">
              Истории пока нет. Проведите первую тренировку — или внесите прошлые из заметок.
            </p>
            <LinkButton href="/more/import" size="md" full className="mt-4">
              ИМПОРТ ИСТОРИИ
            </LinkButton>
          </Card>
        )}
      </section>
    </Screen>
  );
}

function NextWorkoutCard({
  programName,
  dayId,
  dayName,
  dayTitle,
  exercises,
  sets,
}: {
  programName: string;
  dayId: string;
  dayName: string;
  dayTitle: string;
  exercises: number;
  sets: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>Активная программа</Eyebrow>
            <p className="mt-1 truncate text-[15px] font-medium text-dim">{programName}</p>
          </div>
          <Link href="/programs" aria-label="Программы" className="-mr-1 -mt-1 p-1 text-dim">
            <Chevron />
          </Link>
        </div>

        <div className="mt-6">
          <Eyebrow>Следующая тренировка</Eyebrow>
          <p className="mt-1.5 text-[13px] font-semibold tracking-[0.1em] text-accent">{dayName}</p>
          <h2 className="mt-1 text-[27px] leading-[1.1] font-semibold tracking-tight">{dayTitle}</h2>
          <p className="tnum mt-2 text-[13px] text-dim">
            {count(exercises, WORDS.exercise)} · {count(sets, WORDS.workingSet)}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <LinkButton
          href={`/workout/start?day=${dayId}`}
          variant="primary"
          size="xl"
          full
        >
          НАЧАТЬ ТРЕНИРОВКУ
        </LinkButton>
      </div>
    </Card>
  );
}

function ResumeCard({ session }: { session: ReturnType<typeof useActiveSession> }) {
  if (!session) return null;
  const progress = sessionProgress(session);

  return (
    <Card className={cx('overflow-hidden border-accent/40 bg-accent/[0.06]')}>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <Eyebrow className="text-accent">Тренировка идёт</Eyebrow>
        </div>

        <p className="mt-3 text-[13px] font-semibold tracking-[0.1em] text-dim">
          {session.workoutDayName}
        </p>
        <h2 className="mt-1 text-[25px] leading-tight font-semibold tracking-tight">
          {session.workoutDayTitle}
        </h2>

        <div className="mt-4">
          <div className="tnum flex items-baseline justify-between text-[12px] text-dim">
            <span>
              {progress.completedExercises} / {progress.totalExercises} упражнений
            </span>
            <span>
              {progress.completedSets} / {progress.totalSets} подходов
            </span>
          </div>
          <ProgressBar value={progress.ratio} className="mt-2" />
        </div>
      </div>

      <div className="px-5 pb-5">
        <LinkButton href="/workout" variant="primary" size="xl" full>
          ПРОДОЛЖИТЬ
        </LinkButton>
      </div>
    </Card>
  );
}
