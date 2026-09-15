'use client';

import { useMemo, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  Notice,
  SectionTitle,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { todayString } from '@/domain/ids';
import type { BodyPart } from '@/domain/types';
import { formatRelativeDate } from '@/engine/format';
import { useStore } from '@/store/useStore';

const BODY_PARTS: { id: BodyPart; label: string }[] = [
  { id: 'shoulder', label: 'Плечо' },
  { id: 'elbow', label: 'Локоть' },
  { id: 'knee', label: 'Колено' },
  { id: 'back', label: 'Спина' },
  { id: 'wrist', label: 'Кисть' },
  { id: 'hip', label: 'Бедро' },
  { id: 'neck', label: 'Шея' },
  { id: 'other', label: 'Другое' },
];

const PART_LABEL = Object.fromEntries(BODY_PARTS.map((p) => [p.id, p.label])) as Record<
  BodyPart,
  string
>;

function severityColor(severity: number): string {
  if (severity <= 3) return 'var(--status-warning)';
  if (severity <= 6) return '#ff7a1a';
  return 'var(--status-pain)';
}

/**
 * PAIN TRACKING — the log that makes the app refuse to add weight. Entries stay
 * "active" until the user clears them, and an active entry is surfaced on Home
 * and before a workout.
 */
export default function PainPage() {
  const painLogs = useStore((s) => s.painLogs);
  const addPainLog = useStore((s) => s.addPainLog);
  const resolvePainLog = useStore((s) => s.resolvePainLog);
  const deletePainLog = useStore((s) => s.deletePainLog);

  const [part, setPart] = useState<BodyPart>('shoulder');
  const [severity, setSeverity] = useState(4);
  const [date, setDate] = useState(todayString());
  const [notes, setNotes] = useState('');

  const { active, resolved } = useMemo(() => {
    const sorted = painLogs.slice().sort((a, b) => b.date.localeCompare(a.date));
    return {
      active: sorted.filter((l) => !l.resolvedAt),
      resolved: sorted.filter((l) => l.resolvedAt),
    };
  }, [painLogs]);

  const submit = () => {
    addPainLog({
      bodyPart: part,
      severity,
      date,
      notes: notes.trim() || undefined,
      resolvedAt: null,
    });
    setNotes('');
    setSeverity(4);
  };

  return (
    <Screen>
      <ScreenHeader title="Боль и дискомфорт" back="/more" />

      {active.length ? (
        <Notice tone="warn" title="⚠️ Активные отметки">
          Перед тренировкой приложение напомнит о них и не будет предлагать прибавку веса.
        </Notice>
      ) : null}

      <Card className="mt-4 p-4">
        <Eyebrow>Новая отметка</Eyebrow>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {BODY_PARTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPart(option.id)}
              className={cx(
                'rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                part === option.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line-strong text-dim active:bg-surface2',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[13.5px]">Интенсивность</p>
            <p className="tnum text-[15px] font-semibold" style={{ color: severityColor(severity) }}>
              {severity}/10
            </p>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeverity(n)}
                aria-label={`${n} из 10`}
                className={cx(
                  'tnum h-10 flex-1 rounded-lg border text-[12px] transition-colors',
                  // The unpicked numbers are still tap targets, so they stay
                  // legible: `faint` on `surface2` measures only 4.3:1.
                  n <= severity ? 'border-transparent text-bg' : 'border-line bg-surface2 text-dim',
                )}
                style={n <= severity ? { background: severityColor(severity) } : undefined}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <Field label="Дата" className="mt-4">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Комментарий" className="mt-3">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Например: тянет при жиме над головой."
            className="min-h-20"
          />
        </Field>

        <Button variant="primary" size="lg" full className="mt-4" onClick={submit}>
          СОХРАНИТЬ
        </Button>
      </Card>

      {active.length ? (
        <section className="mt-6">
          <SectionTitle>Активные</SectionTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {active.map((log) => (
              <li key={log.id}>
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge color={severityColor(log.severity)}>
                      {log.severity}/10
                    </Badge>
                    <span className="text-[14.5px] font-medium">{PART_LABEL[log.bodyPart]}</span>
                    <span className="ml-auto text-[11.5px] text-dim">
                      {formatRelativeDate(log.date)}
                    </span>
                  </div>
                  {log.notes ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-dim">{log.notes}</p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => resolvePainLog(log.id)}>
                      БОЛЬШЕ НЕ БОЛИТ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deletePainLog(log.id)}>
                      <TrashIcon />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Card className="mt-6">
          <EmptyState title="Ничего не болит" description="Активных отметок нет." />
        </Card>
      )}

      {resolved.length ? (
        <section className="mt-6">
          <SectionTitle>История</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1.5">
            {resolved.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-3 rounded-[var(--radius-tile)] border border-line bg-surface/50 px-3.5 py-2.5"
              >
                <span className="tnum w-[70px] shrink-0 text-[11.5px] text-dim">
                  {formatRelativeDate(log.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-dim">
                  {PART_LABEL[log.bodyPart]} · {log.severity}/10
                </span>
                <button
                  type="button"
                  onClick={() => resolvePainLog(log.id)}
                  className="shrink-0 text-[11px] tracking-[0.06em] text-faint uppercase active:text-ink"
                >
                  Вернуть
                </button>
                <button
                  type="button"
                  onClick={() => deletePainLog(log.id)}
                  aria-label="Удалить"
                  className="shrink-0 text-faint active:text-pain"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
