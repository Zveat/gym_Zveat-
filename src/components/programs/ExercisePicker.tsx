'use client';

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Field, TextInput } from '@/components/ui/inputs';
import { Button, Chip, cx } from '@/components/ui/primitives';
import type { Exercise, MuscleGroup } from '@/domain/types';
import { MUSCLE_LABEL } from '@/engine/format';
import { normalizeName } from '@/engine/import-parser';
import { useStore } from '@/store/useStore';

/** Pick an exercise from the library, or create one on the spot. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = 'Добавить упражнение',
  /** Prefilled muscle-group heading for the new exercise. */
  defaultSection,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise, section: string) => void;
  title?: string;
  defaultSection?: string;
}) {
  const exercises = useStore((s) => s.exercises);
  const createExercise = useStore((s) => s.createExercise);

  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [section, setSection] = useState(defaultSection ?? '');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const muscles = useMemo(() => {
    const set = new Set<MuscleGroup>(exercises.map((e) => e.primaryMuscle));
    return [...set];
  }, [exercises]);

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return exercises
      .filter((e) => (muscle === 'all' ? true : e.primaryMuscle === muscle))
      .filter((e) =>
        q
          ? normalizeName(e.name).includes(q) || normalizeName(e.alias ?? '').includes(q)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [exercises, query, muscle]);

  const pick = (exercise: Exercise) => {
    onPick(exercise, section.trim());
    setQuery('');
    onClose();
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const exercise = createExercise({
      name,
      primaryMuscle: muscle === 'all' ? 'other' : muscle,
    });
    setNewName('');
    setCreating(false);
    pick(exercise);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} size="full">
      <div className="flex flex-col gap-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          inputMode="search"
        />

        {defaultSection !== undefined ? (
          <Field label="Группа мышц (заголовок в дне)">
            <TextInput
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="Например: ГРУДЬ"
            />
          </Field>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <Chip selected={muscle === 'all'} onClick={() => setMuscle('all')}>
            Все
          </Chip>
          {muscles.map((m) => (
            <Chip key={m} selected={muscle === m} onClick={() => setMuscle(m)}>
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5 pb-4">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              onClick={() => pick(exercise)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-tile)] bg-surface2 px-3.5 py-3 text-left active:bg-surface3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]">{exercise.name}</span>
                <span className="mt-0.5 block text-[11px] text-dim">
                  {MUSCLE_LABEL[exercise.primaryMuscle]} · {exercise.equipment}
                  {exercise.isCustom ? ' · своё' : ''}
                </span>
              </span>
            </button>
          </li>
        ))}

        {!filtered.length ? (
          <li className="px-1 py-6 text-center text-[13px] text-dim">
            Ничего не найдено. Создайте своё упражнение.
          </li>
        ) : null}
      </ul>

      <div className={cx('border-t border-line pt-4', creating && 'pb-2')}>
        {creating ? (
          <div className="flex flex-col gap-2">
            <Field label="Название упражнения">
              <TextInput
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Например: Тяга верхнего блока — тренажёр №2"
              />
            </Field>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setCreating(false)}>
                ОТМЕНА
              </Button>
              <Button variant="primary" className="flex-1" onClick={create} disabled={!newName.trim()}>
                СОЗДАТЬ
              </Button>
            </div>
          </div>
        ) : (
          <Button size="md" full onClick={() => setCreating(true)}>
            + СВОЁ УПРАЖНЕНИЕ
          </Button>
        )}
      </div>
    </Sheet>
  );
}
