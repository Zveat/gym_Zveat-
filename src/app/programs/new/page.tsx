'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, TextArea, TextInput } from '@/components/ui/inputs';
import { Button, Card, SectionTitle, TrashIcon } from '@/components/ui/primitives';
import { useStore } from '@/store/useStore';

/**
 * CREATE PROGRAM — name, description, then the training days. Exercises are
 * added in the editor, so this stays a 30-second step.
 */
export default function NewProgramPage() {
  const router = useRouter();
  const createProgram = useStore((s) => s.createProgram);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<string[]>(['']);

  const cleanDays = days.map((d) => d.trim()).filter(Boolean);
  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const program = createProgram({
      name: name.trim(),
      description: description.trim() || undefined,
      dayTitles: cleanDays.length ? cleanDays : ['Тренировка A'],
    });
    router.replace(`/programs/editor?id=${program.id}`);
  };

  return (
    <Screen>
      <ScreenHeader title="Новая программа" back="/programs" />

      <Card className="flex flex-col gap-4 p-4">
        <Field label="Название">
          <TextInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Сплит 3 дня"
          />
        </Field>
        <Field label="Описание" hint="Необязательно">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Цель, частота, особенности"
            className="min-h-20"
          />
        </Field>
      </Card>

      <section className="mt-6">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setDays((d) => [...d, ''])}
              className="text-[12px] text-accent active:opacity-70"
            >
              + день
            </button>
          }
        >
          Тренировочные дни
        </SectionTitle>

        <div className="mt-2 flex flex-col gap-2">
          {days.map((day, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-[54px] shrink-0 text-[12px] font-semibold tracking-[0.08em] text-dim">
                DAY {index + 1}
              </span>
              <TextInput
                value={day}
                onChange={(e) =>
                  setDays((list) => list.map((d, i) => (i === index ? e.target.value : d)))
                }
                placeholder="Например: ГРУДЬ + ТРИЦЕПС"
              />
              {days.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setDays((list) => list.filter((_, i) => i !== index))}
                  aria-label={`Удалить день ${index + 1}`}
                  className="touch flex shrink-0 items-center justify-center rounded-xl text-dim active:text-pain"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-3 px-1 text-[12px] leading-relaxed text-dim">
          Количество дней не ограничено. Упражнения добавите на следующем шаге.
        </p>
      </section>

      <Button variant="primary" size="xl" full className="mt-7" onClick={submit} disabled={!canSubmit}>
        СОЗДАТЬ И ОТКРЫТЬ
      </Button>
    </Screen>
  );
}
