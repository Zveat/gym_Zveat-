'use client';

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Select, TextArea, TextInput, Toggle } from '@/components/ui/inputs';
import {
  Button,
  Chip,
  PlusIcon,
  SectionTitle,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { newId } from '@/domain/ids';
import type {
  Exercise,
  ProgramExercise,
  ProgramSet,
  ProgressionType,
  SetType,
} from '@/domain/types';
import { formatWeight, SET_TYPE_LABEL } from '@/engine/format';

const SET_TYPES: SetType[] = ['normal', 'warmup', 'top_set', 'drop_set', 'failure', 'burnout'];

const PROGRESSION_LABEL: Record<ProgressionType, string> = {
  manual: 'Вручную',
  double: 'Двойная прогрессия',
  fixed: 'Линейная',
  custom: 'Своё правило',
};

const PROGRESSION_HINT: Record<ProgressionType, string> = {
  manual: 'Приложение не предлагает менять вес — решаете сами.',
  double: 'Когда все подходы закрыты на верхнем краю повторений, предлагается прибавить вес.',
  fixed: 'Вес растёт на заданный шаг каждую тренировку.',
  custom: 'Прибавка после N тренировок подряд с закрытой целью.',
};

/**
 * Edits one exercise inside a program: the sets table plus everything the user
 * needs to reproduce it (rest, machine settings, technique, progression rule).
 */
export function ProgramExerciseEditor({
  open,
  onClose,
  programExercise,
  exercise,
  onChange,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  programExercise: ProgramExercise | null;
  exercise: Exercise | null;
  onChange: (next: ProgramExercise) => void;
  onRemove: () => void;
}) {
  if (!programExercise) return null;
  const pe = programExercise;

  const patch = (changes: Partial<ProgramExercise>) => onChange({ ...pe, ...changes });

  const patchSet = (setId: string, changes: Partial<ProgramSet>) =>
    patch({ sets: pe.sets.map((s) => (s.id === setId ? { ...s, ...changes } : s)) });

  const addSet = () => {
    const last = pe.sets[pe.sets.length - 1];
    patch({
      sets: [
        ...pe.sets,
        {
          id: newId('pset'),
          setNumber: pe.sets.length + 1,
          targetWeight: last?.targetWeight ?? null,
          targetRepsMin: last?.targetRepsMin ?? 10,
          targetRepsMax: last?.targetRepsMax ?? 12,
          setType: 'normal',
        },
      ],
    });
  };

  const removeSet = (setId: string) =>
    patch({
      sets: pe.sets.filter((s) => s.id !== setId).map((s, i) => ({ ...s, setNumber: i + 1 })),
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exercise?.name ?? 'Упражнение'}
      subtitle={pe.section || undefined}
      size="full"
      footer={
        <Button variant="primary" size="lg" full onClick={onClose}>
          ГОТОВО
        </Button>
      }
    >
      <div className="flex flex-col gap-6 pb-4">
        <section>
          <SectionTitle
            action={
              <button
                type="button"
                onClick={addSet}
                className="text-[12px] text-accent active:opacity-70"
              >
                + подход
              </button>
            }
          >
            Подходы
          </SectionTitle>

          {/* Column labels once, not per row: four sets have to fit on screen. */}
          <div className="mt-2 flex items-end gap-2 px-1">
            <span className="w-6 shrink-0" />
            <span className="eyebrow flex-1 text-center">Вес, кг</span>
            <span className="eyebrow flex-1 text-center">Повт. от</span>
            <span className="eyebrow flex-1 text-center">Повт. до</span>
            <span className="w-7 shrink-0" />
          </div>

          <div className="mt-1.5 flex flex-col gap-2">
            {pe.sets.map((set) => (
              <SetEditorRow
                key={set.id}
                set={set}
                canRemove={pe.sets.length > 1}
                onChange={(changes) => patchSet(set.id, changes)}
                onRemove={() => removeSet(set.id)}
              />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Отдых</SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[45, 60, 75, 90, 120, 150, 180].map((seconds) => (
              <Chip
                key={seconds}
                selected={pe.restSeconds === seconds}
                onClick={() => patch({ restSeconds: seconds })}
              >
                {seconds >= 60
                  ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                  : `${seconds}с`}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Прогрессия</SectionTitle>
          <div className="mt-2 flex flex-col gap-2.5">
            <Select
              value={pe.progression.type}
              onChange={(e) =>
                patch({
                  progression: { ...pe.progression, type: e.target.value as ProgressionType },
                })
              }
            >
              {(Object.keys(PROGRESSION_LABEL) as ProgressionType[]).map((t) => (
                <option key={t} value={t}>
                  {PROGRESSION_LABEL[t]}
                </option>
              ))}
            </Select>
            <p className="px-1 text-[12px] leading-relaxed text-dim">
              {PROGRESSION_HINT[pe.progression.type]}
            </p>

            {pe.progression.type !== 'manual' ? (
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Шаг, кг"
                  hint={`По умолчанию ${formatWeight(exercise?.increment ?? 2.5)}`}
                >
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={pe.progression.increment ?? ''}
                    placeholder={String(exercise?.increment ?? 2.5)}
                    onChange={(e) =>
                      patch({
                        progression: {
                          ...pe.progression,
                          increment:
                            e.target.value === '' ? undefined : parseFloat(e.target.value),
                        },
                      })
                    }
                    density="compact"
                    className="tnum text-center"
                  />
                </Field>
                {pe.progression.type !== 'fixed' ? (
                  <Field label="Цель повторений">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={pe.progression.repTarget ?? ''}
                      onChange={(e) =>
                        patch({
                          progression: {
                            ...pe.progression,
                            repTarget:
                              e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                          },
                        })
                      }
                      density="compact"
                    className="tnum text-center"
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {pe.progression.type === 'custom' ? (
              <>
                <Field label="Тренировок подряд">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    value={pe.progression.consecutiveSessions ?? 2}
                    onChange={(e) =>
                      patch({
                        progression: {
                          ...pe.progression,
                          consecutiveSessions: parseInt(e.target.value, 10) || 1,
                        },
                      })
                    }
                    density="compact"
                    className="tnum text-center"
                  />
                </Field>
                <Field label="Правило своими словами">
                  <TextInput
                    value={pe.progression.note ?? ''}
                    onChange={(e) =>
                      patch({ progression: { ...pe.progression, note: e.target.value } })
                    }
                    placeholder="Не прибавлять, пока не 12 во всех подходах"
                  />
                </Field>
              </>
            ) : null}
          </div>
        </section>

        <PersonalSettingsEditor
          settings={pe.personalSettings}
          onChange={(personalSettings) => patch({ personalSettings })}
        />

        <InstructionsEditor
          instructions={pe.instructions}
          fallback={exercise?.keyPoints ?? []}
          onChange={(instructions) => patch({ instructions })}
        />

        <section>
          <SectionTitle>Заметка к упражнению</SectionTitle>
          <TextArea
            value={pe.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value || undefined })}
            placeholder="Например: текущий рабочий диапазон 40-45 кг"
            className="mt-2 min-h-20"
          />
        </section>

        <section className="overflow-hidden rounded-[var(--radius-card)] border border-line">
          <Toggle
            label="Упражнение включено"
            description="Отключённое остаётся в программе, но пропускается на тренировке."
            checked={pe.isEnabled}
            onChange={(isEnabled) => patch({ isEnabled })}
          />
        </section>

        <Button variant="danger" size="md" full onClick={onRemove}>
          УДАЛИТЬ ИЗ ПРОГРАММЫ
        </Button>
      </div>
    </Sheet>
  );
}

function SetEditorRow({
  set,
  canRemove,
  onChange,
  onRemove,
}: {
  set: ProgramSet;
  canRemove: boolean;
  onChange: (changes: Partial<ProgramSet>) => void;
  onRemove: () => void;
}) {
  const [showNote, setShowNote] = useState(Boolean(set.note));

  return (
    <div className="rounded-[var(--radius-tile)] border border-line bg-surface2 p-2.5">
      <div className="flex items-center gap-2">
        <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface3 text-[11px] font-semibold">
          {set.setNumber}
        </span>
        <TextInput
          density="compact"
          type="number"
          inputMode="decimal"
          step="0.5"
          value={set.targetWeight ?? ''}
          placeholder="—"
          onChange={(e) =>
            onChange({ targetWeight: e.target.value === '' ? null : parseFloat(e.target.value) })
          }
          className="tnum flex-1 text-center"
          aria-label={`Вес, подход ${set.setNumber}`}
        />
        <TextInput
          density="compact"
          type="number"
          inputMode="numeric"
          value={set.targetRepsMin ?? ''}
          onChange={(e) =>
            onChange({ targetRepsMin: e.target.value === '' ? null : parseInt(e.target.value, 10) })
          }
          className="tnum flex-1 text-center"
          aria-label={`Повторений от, подход ${set.setNumber}`}
        />
        <TextInput
          density="compact"
          type="number"
          inputMode="numeric"
          value={set.targetRepsMax ?? ''}
          onChange={(e) =>
            onChange({ targetRepsMax: e.target.value === '' ? null : parseInt(e.target.value, 10) })
          }
          className="tnum flex-1 text-center"
          aria-label={`Повторений до, подход ${set.setNumber}`}
        />
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Удалить подход ${set.setNumber}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-dim active:text-pain"
          >
            <TrashIcon />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Select
          density="compact"
          value={set.setType}
          onChange={(e) => onChange({ setType: e.target.value as SetType })}
          className="flex-1"
          aria-label={`Тип подхода ${set.setNumber}`}
        >
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>
              {SET_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        {!showNote ? (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="shrink-0 px-1 text-[11.5px] whitespace-nowrap text-dim active:text-ink"
          >
            + пометка
          </button>
        ) : null}
      </div>

      {showNote ? (
        <TextInput
          density="compact"
          value={set.note ?? ''}
          onChange={(e) => onChange({ note: e.target.value || undefined })}
          placeholder="Сбросить вес и до отказа"
          className="mt-2"
          aria-label={`Пометка к подходу ${set.setNumber}`}
        />
      ) : null}
    </div>
  );
}

function PersonalSettingsEditor({
  settings,
  onChange,
}: {
  settings: { label: string; value: string }[];
  onChange: (next: { label: string; value: string }[]) => void;
}) {
  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => onChange([...settings, { label: '', value: '' }])}
            className="text-[12px] text-accent active:opacity-70"
          >
            + настройка
          </button>
        }
      >
        Настройки тренажёра
      </SectionTitle>

      {settings.length ? (
        <div className="mt-2 flex flex-col gap-2">
          {settings.map((setting, index) => (
            <div key={index} className="flex items-center gap-2">
              <TextInput
                value={setting.label}
                onChange={(e) =>
                  onChange(settings.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))
                }
                placeholder="Спинка"
                density="compact"
                className="flex-1"
              />
              <TextInput
                value={setting.value}
                onChange={(e) =>
                  onChange(settings.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)))
                }
                placeholder="2 отверстия"
                density="compact"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => onChange(settings.filter((_, i) => i !== index))}
                aria-label="Удалить настройку"
                className="touch flex shrink-0 items-center justify-center text-dim active:text-pain"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 px-1 text-[12px] text-dim">
          Положение сиденья, номер тренажёра, хват — то, что нужно воспроизвести.
        </p>
      )}
    </section>
  );
}

function InstructionsEditor({
  instructions,
  fallback,
  onChange,
}: {
  instructions: string[];
  fallback: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const shown = instructions.length ? instructions : fallback;
  const usingFallback = instructions.length === 0 && fallback.length > 0;

  return (
    <section>
      <SectionTitle>Техника</SectionTitle>

      {shown.length ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {shown.map((point, index) => (
            <li
              key={`${point}-${index}`}
              className={cx(
                'flex items-start gap-2 rounded-[var(--radius-tile)] border border-line bg-surface2 px-3 py-2.5 text-[13.5px]',
                usingFallback && 'opacity-70',
              )}
            >
              <span className="mt-0.5 text-accent">✓</span>
              <span className="min-w-0 flex-1">{point}</span>
              {!usingFallback ? (
                <button
                  type="button"
                  onClick={() => onChange(instructions.filter((_, i) => i !== index))}
                  aria-label="Удалить пункт"
                  className="shrink-0 text-dim active:text-pain"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {usingFallback ? (
        <p className="mt-1.5 px-1 text-[11.5px] text-faint">
          Взято из библиотеки. Добавьте свой пункт, чтобы переопределить.
        </p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Новый пункт техники"
          density="compact"
                className="flex-1"
        />
        <Button
          size="md"
          onClick={() => {
            const value = draft.trim();
            if (!value) return;
            onChange([...(usingFallback ? fallback : instructions), value]);
            setDraft('');
          }}
          aria-label="Добавить пункт"
        >
          <PlusIcon />
        </Button>
      </div>
    </section>
  );
}
