'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import {
  Button,
  Card,
  Eyebrow,
  Notice,
  SectionTitle,
  cx,
} from '@/components/ui/primitives';
import { ScalePicker } from '@/components/ui/inputs';
import { MODE_COLOR, MODE_ORDER } from '@/domain/modes';
import type { ConditionCheckIn, WorkoutDay, WorkoutMode } from '@/domain/types';
import { formatRepRange, formatWeight, MUSCLE_LABEL, pluralize } from '@/engine/format';
import { planExerciseSets } from '@/engine/session';
import { daySummary, useActivePain, useActiveProgram, useExerciseMap } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/**
 * Pre-workout: which day, how hard, and how you feel.
 *
 * The mode preview is the point of this screen — the user sees exactly what
 * LIGHT will change before committing, instead of discovering it set by set.
 */
export default function StartWorkoutPage() {
  return (
    <Suspense fallback={<Screen />}>
      <StartWorkout />
    </Suspense>
  );
}

function StartWorkout() {
  const router = useRouter();
  const params = useSearchParams();
  const program = useActiveProgram();
  const modes = useStore((s) => s.settings.modes);
  const startWorkout = useStore((s) => s.startWorkout);
  const pain = useActivePain();

  const days = useMemo(
    () => (program ? [...program.days].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [program],
  );
  const initialDay = params.get('day') ?? days[0]?.id ?? '';
  const [dayId, setDayId] = useState(initialDay);
  const [mode, setMode] = useState<WorkoutMode>('normal');
  const [checkIn, setCheckIn] = useState<ConditionCheckIn>({});
  const [showCheckIn, setShowCheckIn] = useState(false);

  const day = days.find((d) => d.id === dayId) ?? days[0] ?? null;

  if (!program || !day) {
    return (
      <Screen>
        <ScreenHeader title="Начать тренировку" back="/" />
        <Card className="p-5 text-[14px] text-dim">
          В активной программе нет тренировочных дней.
        </Card>
      </Screen>
    );
  }

  const hasCheckIn = Object.values(checkIn).some((v) => v !== undefined && v !== '');

  const begin = () => {
    const session = startWorkout({
      programId: program.id,
      dayId: day.id,
      mode,
      checkIn: hasCheckIn ? checkIn : undefined,
    });
    if (session) router.replace('/workout');
  };

  return (
    <Screen>
      <ScreenHeader title="Начать тренировку" subtitle={program.name} back="/" />

      <SectionTitle>Тренировочный день</SectionTitle>
      <div className="mt-2 flex flex-col gap-2">
        {days.map((d) => {
          const summary = daySummary(d);
          const selected = d.id === day.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDayId(d.id)}
              className={cx(
                'flex items-center gap-3 rounded-[var(--radius-tile)] border px-4 py-3 text-left transition-colors',
                selected ? 'border-accent bg-accent/[0.07]' : 'border-line bg-surface active:bg-surface2',
              )}
            >
              <span
                className={cx(
                  'text-[12px] font-semibold tracking-[0.1em]',
                  selected ? 'text-accent' : 'text-dim',
                )}
              >
                {d.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px]">{d.title}</span>
              <span className="tnum shrink-0 text-[11.5px] text-dim">
                {summary.exercises} / {summary.sets}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7">
        <SectionTitle>Режим на сегодня</SectionTitle>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {MODE_ORDER.map((id) => {
            const config = modes[id];
            const selected = id === mode;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                style={selected ? { borderColor: MODE_COLOR[id] } : undefined}
                className={cx(
                  'rounded-[var(--radius-tile)] border px-3.5 py-3 text-left transition-colors',
                  selected ? 'bg-surface2' : 'border-line bg-surface active:bg-surface2',
                )}
              >
                <span
                  className="text-[13px] font-semibold tracking-[0.06em] uppercase"
                  style={{ color: selected ? MODE_COLOR[id] : undefined }}
                >
                  {config.label}
                </span>
                <span className="mt-1 block text-[11.5px] leading-snug text-dim">
                  {config.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {mode !== 'normal' ? <ModePreview day={day} mode={mode} /> : null}

      {pain.length ? (
        <div className="mt-5">
          <Notice tone="warn" title="⚠️ Активная заметка">
            {pain[0].bodyPart} {pain[0].severity}/10. Возможно, стоит выбрать LIGHT или RECOVERY.
          </Notice>
        </div>
      ) : null}

      <div className="mt-7">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setShowCheckIn((v) => !v)}
              className="text-[12px] text-dim active:text-ink"
            >
              {showCheckIn ? 'Скрыть' : 'Заполнить'}
            </button>
          }
        >
          Как самочувствие (необязательно)
        </SectionTitle>

        {showCheckIn ? (
          <Card className="mt-2 flex flex-col gap-4 p-4">
            <ScalePicker
              label="Сон"
              hint="1 — плохо, 5 — отлично"
              value={checkIn.sleep}
              onChange={(sleep) => setCheckIn((c) => ({ ...c, sleep }))}
            />
            <ScalePicker
              label="Энергия"
              value={checkIn.energy}
              onChange={(energy) => setCheckIn((c) => ({ ...c, energy }))}
            />
            <ScalePicker
              label="Усталость"
              hint="1 — свежий, 5 — разбит"
              value={checkIn.fatigue}
              onChange={(fatigue) => setCheckIn((c) => ({ ...c, fatigue }))}
            />
            <ScalePicker
              label="Восстановление мышц"
              value={checkIn.recovery}
              onChange={(recovery) => setCheckIn((c) => ({ ...c, recovery }))}
            />
          </Card>
        ) : null}
      </div>

      <div className="mt-8">
        <Button variant="primary" size="xl" full onClick={begin}>
          START WORKOUT
        </Button>
      </div>
    </Screen>
  );
}

/** NORMAL vs the chosen mode, exercise by exercise. */
function ModePreview({ day, mode }: { day: WorkoutDay; mode: WorkoutMode }) {
  const modes = useStore((s) => s.settings.modes);
  const library = useExerciseMap();

  const rows = useMemo(() => {
    return day.exercises
      .filter((pe) => pe.isEnabled)
      .map((pe) => {
        const normal = planExerciseSets(pe, modes.normal);
        const modified = planExerciseSets(pe, modes[mode]);
        const describe = (sets: typeof normal) => {
          if (!sets.length) return '—';
          const working = sets.filter((s) => s.setType !== 'warmup');
          const first = working[0] ?? sets[0];
          return `${formatWeight(first.plan.weight)} kg × ${formatRepRange(
            first.plan.repsMin,
            first.plan.repsMax,
          )} × ${working.length}`;
        };
        return {
          id: pe.id,
          name: library.get(pe.exerciseId)?.name ?? '—',
          muscle: library.get(pe.exerciseId)?.primaryMuscle,
          normal: describe(normal),
          modified: describe(modified),
          changed: describe(normal) !== describe(modified),
        };
      });
  }, [day, mode, modes, library]);

  const changedCount = rows.filter((r) => r.changed).length;

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <Eyebrow>Что изменится</Eyebrow>
        <span className="text-[11.5px] text-dim">
          {pluralize(changedCount, 'exercise')} из {rows.length}
        </span>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <p className="truncate text-[14px] font-medium">{row.name}</p>
            {row.muscle ? (
              <p className="mt-0.5 text-[11px] text-faint">{MUSCLE_LABEL[row.muscle]}</p>
            ) : null}
            <div className="tnum mt-2 flex items-center gap-2 text-[13px]">
              <span className={cx('text-dim', row.changed && 'line-through decoration-faint')}>
                {row.normal}
              </span>
              {row.changed ? (
                <>
                  <span className="text-faint">→</span>
                  <span className="font-semibold" style={{ color: MODE_COLOR[mode] }}>
                    {row.modified}
                  </span>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
