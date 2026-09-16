'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { BigStepper } from '@/components/ui/inputs';
import {
  Button,
  Card,
  Eyebrow,
  LinkButton,
  SectionTitle,
  Stat,
  cx,
} from '@/components/ui/primitives';
import type { ProgressionRecommendation, Verdict } from '@/engine/progression';
import { DIFFICULTY_META, formatDuration, formatVolume, formatWeight } from '@/engine/format';
import { averageDifficulty, sessionExerciseCount } from '@/engine/analytics';
import { reviewSession } from '@/engine/progression';
import { detectPRs, personalRecords, primaryPR, sessionPRCount, type DetectedPR } from '@/engine/records';
import { sessionVolume, sessionWorkingSetCount } from '@/engine/volume';
import { todayString } from '@/domain/ids';
import { useStore } from '@/store/useStore';

/**
 * PROGRESSION REVIEW — the one moment the plan is allowed to change, and only
 * because the user said so. Accept / Edit / Ignore, per exercise; history is
 * never touched either way.
 */
export default function ReviewPage() {
  return (
    <Suspense fallback={<Screen />}>
      <Review />
    </Suspense>
  );
}

const VERDICT_META: Record<Verdict, { label: string; color: string; icon: string }> = {
  increase: { label: 'Можно прибавить', color: 'var(--status-progress)', icon: '🟢' },
  hold: { label: 'Держим вес', color: 'var(--status-warning)', icon: '🟡' },
  decrease: { label: 'Лучше снизить', color: 'var(--status-pain)', icon: '🔴' },
  none: { label: '', color: 'var(--color-dim)', icon: '' },
};

function Review() {
  const router = useRouter();
  const sessionId = useSearchParams().get('id');
  const sessions = useStore((s) => s.sessions);
  const programs = useStore((s) => s.programs);
  const exercises = useStore((s) => s.exercises);
  const acceptRecommendation = useStore((s) => s.acceptRecommendation);

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const recommendations = useMemo(
    () => (session ? reviewSession(session, programs, exercises, sessions) : []),
    [session, programs, exercises, sessions],
  );
  const prCount = useMemo(
    () => (session ? sessionPRCount(sessions, session) : 0),
    [sessions, session],
  );

  /**
   * §40: достижения по именам, а не только числом. «Новых рекордов: 2» не даёт
   * ощущения результата — «Жим ногами 72.5 × 12» даёт.
   *
   * Базой берём тренировки, завершённые ДО этой: рекорд считается относительно
   * того, что было, иначе сама тренировка попадёт в собственную базу и ни один
   * рекорд не определится.
   */
  const achievements = useMemo(() => {
    if (!session) return [];
    const before = sessions.filter(
      (s) => s.status === 'completed' && s.id !== session.id && s.date < session.date,
    );
    const rows: { name: string; pr: DetectedPR }[] = [];
    for (const entry of session.exercises) {
      const baseline = personalRecords(before, entry.exerciseId, entry.name);
      let best: DetectedPR | null = null;
      for (const set of entry.sets) {
        if (!set.actual) continue;
        const found = primaryPR(
          detectPRs(baseline, {
            weight: set.actual.weight,
            reps: set.actual.reps,
            setType: set.setType,
          }),
        );
        if (found) best = found;
      }
      if (best) rows.push({ name: entry.name, pr: best });
    }
    return rows;
  }, [session, sessions]);

  const avgDifficulty = useMemo(() => (session ? averageDifficulty(session) : null), [session]);

  /**
   * §44: вес тела предлагается, а не требуется.
   *
   * Только если сегодня ещё не взвешивались: иначе предложение появлялось бы
   * после каждой тренировки и стало бы шумом. И только предложение — блок
   * закрывается «Пропустить» и в тренировочный поток не влезает.
   */
  const bodyWeightLogs = useStore((st) => st.bodyWeightLogs);
  const addBodyWeight = useStore((st) => st.addBodyWeight);
  const today = todayString();
  const weighedToday = bodyWeightLogs.some((log) => log.date === today);
  const lastWeight = useMemo(
    () => [...bodyWeightLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? null,
    [bodyWeightLogs],
  );
  const [askWeight, setAskWeight] = useState(true);
  const [weightDraft, setWeightDraft] = useState<number | null>(null);

  const [handled, setHandled] = useState<Record<string, 'accepted' | 'ignored'>>({});
  const [editing, setEditing] = useState<ProgressionRecommendation | null>(null);
  const [editWeight, setEditWeight] = useState(0);

  if (!session) {
    return (
      <Screen>
        <ScreenHeader title="Итоги" back="/" />
        <Card className="p-5 text-[14px] text-dim">Тренировка не найдена.</Card>
      </Screen>
    );
  }

  const accept = (rec: ProgressionRecommendation, weight?: number) => {
    acceptRecommendation(rec, weight);
    setHandled((h) => ({ ...h, [rec.exerciseEntryId]: 'accepted' }));
  };

  return (
    <Screen>
      <ScreenHeader
        title="Тренировка завершена"
        subtitle={`${session.workoutDayName} · ${session.workoutDayTitle}`}
        back="/"
      />

      <Card className="grid grid-cols-2 gap-y-5 p-5">
        <Stat label="Длительность" value={formatDuration(session.durationSeconds)} />
        <Stat label="Упражнений" value={sessionExerciseCount(session)} />
        <Stat label="Рабочих подходов" value={sessionWorkingSetCount(session)} />
        <Stat label="Объём" value={formatVolume(sessionVolume(session))} unit="кг" />
        <Stat
          label="Средняя тяжесть"
          value={avgDifficulty ? DIFFICULTY_META[avgDifficulty].label : '—'}
        />
        <Stat
          label="Новых рекордов"
          value={prCount}
          tone={prCount > 0 ? 'accent' : 'default'}
        />
      </Card>

      {askWeight && !weighedToday ? (
        <Card className="mt-5 p-4">
          <p className="text-[14px] font-semibold">Вес тела сегодня?</p>
          <p className="mt-1 text-[12.5px] text-dim">
            {lastWeight !== null
              ? `В прошлый раз ${formatWeight(lastWeight)} кг.`
              : 'Первое взвешивание — дальше приложение само покажет динамику.'}
          </p>
          <div className="mt-3">
            <BigStepper
              label="Вес"
              unit="кг"
              value={weightDraft ?? lastWeight ?? 80}
              step={0.1}
              min={30}
              onChange={setWeightDraft}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="md" variant="ghost" className="flex-1" onClick={() => setAskWeight(false)}>
              ПРОПУСТИТЬ
            </Button>
            <Button
              size="md"
              variant="primary"
              className="flex-1"
              onClick={() => {
                addBodyWeight(weightDraft ?? lastWeight ?? 80, today);
                setAskWeight(false);
              }}
            >
              СОХРАНИТЬ
            </Button>
          </div>
        </Card>
      ) : null}

      {/* §40: что именно стало рекордом — это и даёт ощущение результата. */}
      {achievements.length ? (
        <section className="mt-5">
          <SectionTitle>Новые рекорды</SectionTitle>
          <div className="mt-2 flex flex-col gap-2">
            {achievements.map(({ name, pr }) => (
              <Card key={name} className="flex items-baseline justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold tracking-[0.12em] text-accent uppercase">
                    {pr.label}
                  </p>
                  <p className="mt-0.5 truncate text-[14.5px] font-semibold">{name}</p>
                </div>
                <p className="tnum shrink-0 text-[15px] font-semibold text-accent">
                  {formatWeight(pr.weight)} × {pr.reps}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-7">
        <SectionTitle>Что дальше с весами</SectionTitle>

        {recommendations.length ? (
          <ul className="mt-2 flex flex-col gap-2.5">
            {recommendations.map((rec) => {
              const meta = VERDICT_META[rec.verdict];
              const state = handled[rec.exerciseEntryId];
              const canApply = rec.programExerciseId !== null && rec.suggestedWeight !== null;

              return (
                <li key={rec.exerciseEntryId}>
                  <Card className={cx('p-4', state === 'ignored' && 'opacity-50')}>
                    <p className="text-[15px] leading-snug font-medium">{rec.exerciseName}</p>

                    <p className="tnum mt-2 text-[13.5px] text-dim">
                      {rec.currentWeight !== null ? `${formatWeight(rec.currentWeight)} кг · ` : ''}
                      {rec.performed.map((p) => p.reps).join(' · ') || '—'}
                    </p>

                    <p
                      className="mt-2.5 text-[12px] font-semibold tracking-[0.1em] uppercase"
                      style={{ color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-dim">{rec.reason}</p>

                    {canApply ? (
                      <div className="mt-3 rounded-[var(--radius-tile)] bg-surface2 px-3.5 py-3">
                        <Eyebrow>Рекомендация</Eyebrow>
                        <p className="tnum mt-1 text-[17px] font-semibold">
                          {rec.verdict === 'hold'
                            ? `Оставить ${formatWeight(rec.suggestedWeight)} кг`
                            : `Попробовать ${formatWeight(rec.suggestedWeight)} кг`}
                        </p>
                      </div>
                    ) : null}

                    {state ? (
                      <p
                        className="mt-3 text-[12px] font-semibold tracking-[0.08em] uppercase"
                        style={{ color: state === 'accepted' ? 'var(--color-accent)' : undefined }}
                      >
                        {state === 'accepted' ? '✓ План обновлён' : 'Оставлено без изменений'}
                      </p>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          className="flex-1"
                          disabled={!canApply}
                          onClick={() => accept(rec)}
                        >
                          ПРИНЯТЬ
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={!canApply}
                          onClick={() => {
                            setEditing(rec);
                            setEditWeight(rec.suggestedWeight ?? rec.currentWeight ?? 0);
                          }}
                        >
                          ИЗМЕНИТЬ
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1"
                          onClick={() =>
                            setHandled((h) => ({ ...h, [rec.exerciseEntryId]: 'ignored' }))
                          }
                        >
                          ОСТАВИТЬ
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card className="mt-2 p-5">
            <p className="text-[14px] leading-relaxed text-dim">
              Менять в программе нечего — план остаётся как есть.
            </p>
          </Card>
        )}
      </section>

      <div className="mt-7 flex flex-col gap-2">
        <LinkButton href={`/history/session?id=${session.id}`} size="lg" full>
          ПОСМОТРЕТЬ ТРЕНИРОВКУ
        </LinkButton>
        <Button variant="primary" size="xl" full onClick={() => router.replace('/')}>
          ГОТОВО
        </Button>
      </div>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Новый рабочий вес"
        subtitle={editing?.exerciseName}
        footer={
          <Button
            variant="primary"
            size="lg"
            full
            onClick={() => {
              if (editing) accept(editing, editWeight);
              setEditing(null);
            }}
          >
            ОБНОВИТЬ ПЛАН
          </Button>
        }
      >
        <div className="py-4">
          <BigStepper
            label="Вес"
            unit="кг"
            value={editWeight}
            step={0.5}
            onChange={setEditWeight}
          />
          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-dim">
            Изменится только план на следующие тренировки. История остаётся как есть.
          </p>
        </div>
      </Sheet>
    </Screen>
  );
}
