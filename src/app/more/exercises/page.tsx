'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Select, TextArea, TextInput } from '@/components/ui/inputs';
import {
  Badge,
  Button,
  Card,
  Chevron,
  Chip,
  Eyebrow,
  Notice,
  PlusIcon,
  TrashIcon,
} from '@/components/ui/primitives';
import type { Equipment, Exercise, MuscleGroup } from '@/domain/types';
import { exerciseFrequency } from '@/engine/history';
import { formatWeight, MUSCLE_LABEL } from '@/engine/format';
import { formatBytes, PhotoError, preparePhoto } from '@/engine/image';
import { normalizeName } from '@/engine/import-parser';
import { useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

const MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs',
  'glutes', 'calves', 'core', 'forearms', 'other',
];

const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'ez_bar', 'other'];

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Штанга',
  dumbbell: 'Гантели',
  machine: 'Тренажёр',
  cable: 'Блок',
  bodyweight: 'Свой вес',
  ez_bar: 'EZ-гриф',
  other: 'Другое',
};

/**
 * EXERCISE LIBRARY. Custom exercises matter most here: a specific machine in a
 * specific gym is a different exercise, with its own history and its own photo.
 */
export default function ExerciseLibraryPage() {
  const exercises = useStore((s) => s.exercises);
  const history = useHistory();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const q = normalizeName(query);
    return exercises
      .filter((e) => (muscle === 'all' ? true : e.primaryMuscle === muscle))
      .filter((e) =>
        q ? normalizeName(e.name).includes(q) || normalizeName(e.alias ?? '').includes(q) : true,
      )
      .map((e) => ({ exercise: e, sessions: exerciseFrequency(history, e.id) }))
      .sort((a, b) => a.exercise.name.localeCompare(b.exercise.name, 'ru'));
  }, [exercises, query, muscle, history]);

  return (
    <Screen>
      <ScreenHeader
        title="Упражнения"
        subtitle={`${exercises.length} в библиотеке`}
        back="/more"
        right={
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon />
          </Button>
        }
      />

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск"
        inputMode="search"
      />

      <div className="mt-3 -mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          <Chip selected={muscle === 'all'} onClick={() => setMuscle('all')}>
            Все
          </Chip>
          {MUSCLES.filter((m) => exercises.some((e) => e.primaryMuscle === m)).map((m) => (
            <Chip key={m} selected={muscle === m} onClick={() => setMuscle(m)}>
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map(({ exercise, sessions }) => (
          <li key={exercise.id}>
            <Card className="flex items-center gap-2 p-0">
              <button
                type="button"
                onClick={() => setEditing(exercise)}
                className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left active:bg-surface2"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                      {exercise.name}
                    </span>
                    {exercise.isCustom ? <Badge>Своё</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-dim">
                    {MUSCLE_LABEL[exercise.primaryMuscle]} ·{' '}
                    {EQUIPMENT_LABEL[exercise.equipment]}
                    {sessions ? ` · ${sessions} тренировок` : ''}
                  </span>
                </span>
                <Chevron />
              </button>
              {sessions ? (
                <Link
                  href={`/progress/exercise?id=${exercise.id}`}
                  className="shrink-0 px-3 py-4 text-[11px] font-semibold tracking-[0.06em] text-dim uppercase active:text-ink"
                >
                  График
                </Link>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {!rows.length ? (
        <Card className="mt-3 p-5 text-center text-[13.5px] text-dim">
          Ничего не найдено.
        </Card>
      ) : null}

      <ExerciseForm
        open={creating}
        onClose={() => setCreating(false)}
        exercise={null}
      />
      <ExerciseForm
        open={editing !== null}
        onClose={() => setEditing(null)}
        exercise={editing}
      />
    </Screen>
  );
}

/**
 * A photo of the actual machine in the actual gym: the fastest way to remember
 * which of three lat pulldowns this exercise means. Taken with the camera or
 * picked from the library; a URL still works for a GIF of the movement.
 */
function PhotoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const storage = useStore((s) => s.storage);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isLocalPhoto = value.startsWith('data:');

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const photo = await preparePhoto(file);
      onChange(photo.dataUrl);
      setInfo(`${photo.width}×${photo.height}, ${formatBytes(photo.bytes)}`);
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Не удалось обработать фото.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Eyebrow>Фото тренажёра</Eyebrow>

      {value ? (
        // Any source the user pastes must load, so a plain img is right here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Фото упражнения"
          className="mt-2 max-h-56 w-full rounded-[var(--radius-tile)] border border-line object-cover"
        />
      ) : null}

      <div className="mt-2 flex gap-2">
        <Button size="md" className="flex-1" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'ОБРАБОТКА…' : value ? 'ЗАМЕНИТЬ' : 'ВЫБРАТЬ ФОТО'}
        </Button>
        {value ? (
          <Button size="md" variant="ghost" onClick={() => { onChange(''); setInfo(null); }}>
            УБРАТЬ
          </Button>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = '';
        }}
      />

      <Field label="Или ссылка" className="mt-3">
        <TextInput
          value={isLocalPhoto ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… (GIF или изображение)"
          inputMode="url"
          disabled={isLocalPhoto}
        />
      </Field>

      {info ? <p className="mt-1.5 text-[11.5px] text-dim">Сохранено: {info}</p> : null}
      {isLocalPhoto && !info ? (
        <p className="mt-1.5 text-[11.5px] text-dim">
          Фото хранится в приложении. Чтобы вставить ссылку, сначала уберите его.
        </p>
      ) : null}
      {error ? (
        <div className="mt-2">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      {isLocalPhoto && storage !== 'indexeddb' ? (
        <div className="mt-2">
          <Notice tone="warn">
            Браузер не дал приложению постоянное хранилище — фото может не сохраниться после
            закрытия. Проверьте раздел «Настройки → Данные».
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

function ExerciseForm({
  open,
  onClose,
  exercise,
}: {
  open: boolean;
  onClose: () => void;
  exercise: Exercise | null;
}) {
  const createExercise = useStore((s) => s.createExercise);
  const updateExercise = useStore((s) => s.updateExercise);
  const deleteExercise = useStore((s) => s.deleteExercise);

  const [name, setName] = useState(exercise?.name ?? '');
  const [alias, setAlias] = useState(exercise?.alias ?? '');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>(exercise?.primaryMuscle ?? 'chest');
  const [secondary, setSecondary] = useState<MuscleGroup[]>(exercise?.secondaryMuscles ?? []);
  const [equipment, setEquipment] = useState<Equipment>(exercise?.equipment ?? 'machine');
  const [increment, setIncrement] = useState(String(exercise?.increment ?? 2.5));
  const [keyPoints, setKeyPoints] = useState((exercise?.keyPoints ?? []).join('\n'));
  const [mediaUrl, setMediaUrl] = useState(exercise?.mediaUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  // The sheet is mounted per exercise, so reset when the target changes.
  const key = exercise?.id ?? 'new';
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setName(exercise?.name ?? '');
    setAlias(exercise?.alias ?? '');
    setPrimaryMuscle(exercise?.primaryMuscle ?? 'chest');
    setSecondary(exercise?.secondaryMuscles ?? []);
    setEquipment(exercise?.equipment ?? 'machine');
    setIncrement(String(exercise?.increment ?? 2.5));
    setKeyPoints((exercise?.keyPoints ?? []).join('\n'));
    setMediaUrl(exercise?.mediaUrl ?? '');
    setError(null);
  }

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload = {
      name: trimmed,
      alias: alias.trim() || undefined,
      primaryMuscle,
      secondaryMuscles: secondary,
      equipment,
      increment: parseFloat(increment.replace(',', '.')) || 2.5,
      keyPoints: keyPoints
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      mediaUrl: mediaUrl.trim() || undefined,
    };

    if (exercise) updateExercise(exercise.id, payload);
    else createExercise(payload);
    onClose();
  };

  const remove = () => {
    if (!exercise) return;
    const outcome = deleteExercise(exercise.id);
    if (!outcome.ok) setError(outcome.reason ?? 'Не удалось удалить.');
    else onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exercise ? 'Упражнение' : 'Новое упражнение'}
      size="full"
      footer={
        <Button variant="primary" size="lg" full onClick={submit} disabled={!name.trim()}>
          {exercise ? 'СОХРАНИТЬ' : 'СОЗДАТЬ'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        <Field label="Название">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Тяга верхнего блока — тренажёр №2"
          />
        </Field>

        <Field label="Латиницей" hint="Помогает при импорте заметок">
          <TextInput
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Lat Pulldown"
          />
        </Field>

        <Field label="Основная группа мышц">
          <Select
            value={primaryMuscle}
            onChange={(e) => setPrimaryMuscle(e.target.value as MuscleGroup)}
          >
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                {MUSCLE_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <Eyebrow>Вторичные группы</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MUSCLES.filter((m) => m !== primaryMuscle).map((m) => (
              <Chip
                key={m}
                selected={secondary.includes(m)}
                onClick={() =>
                  setSecondary((current) =>
                    current.includes(m) ? current.filter((x) => x !== m) : [...current, m],
                  )
                }
              >
                {MUSCLE_LABEL[m]}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Оборудование">
          <Select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
            {EQUIPMENT.map((eq) => (
              <option key={eq} value={eq}>
                {EQUIPMENT_LABEL[eq]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Шаг прибавки, кг"
          hint={`Сейчас ${formatWeight(parseFloat(increment.replace(',', '.')) || 0)} кг`}
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.5"
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
            className="tnum"
          />
        </Field>

        <Field label="Техника" hint="По одному пункту на строку">
          <TextArea
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            placeholder={'Лопатки сведены\nОпускать к нижней части груди'}
            className="min-h-24"
          />
        </Field>

        <PhotoField value={mediaUrl} onChange={setMediaUrl} />

        {error ? <Notice tone="warn">{error}</Notice> : null}

        {exercise ? (
          <Button variant="danger" size="md" full onClick={remove}>
            <TrashIcon />
            УДАЛИТЬ ИЗ БИБЛИОТЕКИ
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
