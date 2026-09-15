'use client';

import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Card, Eyebrow, Row, RowGroup, SectionTitle } from '@/components/ui/primitives';
import {
  count,
  formatVolume,
  formatWeight,
  WORDS,
} from '@/engine/format';
import { bodyWeightStats } from '@/engine/analytics';
import { sessionVolume } from '@/engine/volume';
import { useActivePain, useHistory } from '@/store/selectors';
import { useStore } from '@/store/useStore';

const STORAGE_LABEL: Record<string, string> = {
  indexeddb: 'IndexedDB (на устройстве)',
  localstorage: 'localStorage (резервный режим)',
  memory: 'Только память — данные не сохранятся',
};

/** MORE — everything that is not the workout loop. */
export default function MorePage() {
  const history = useHistory();
  const exercises = useStore((s) => s.exercises);
  const bodyWeightLogs = useStore((s) => s.bodyWeightLogs);
  const storage = useStore((s) => s.storage);
  const pain = useActivePain();

  const totalVolume = history.reduce((sum, s) => sum + sessionVolume(s), 0);
  const weight = bodyWeightStats(bodyWeightLogs);

  return (
    <Screen>
      <ScreenHeader title="Ещё" large />

      <Card className="grid grid-cols-2 gap-y-4 p-4">
        <div>
          <Eyebrow>Тренировок</Eyebrow>
          <p className="tnum mt-1 text-[22px] leading-none font-semibold">{history.length}</p>
        </div>
        <div>
          <Eyebrow>Всего поднято</Eyebrow>
          <p className="tnum mt-1 text-[22px] leading-none font-semibold">
            {formatVolume(totalVolume)}
            <span className="ml-1 text-[12px] font-medium text-dim">кг</span>
          </p>
        </div>
      </Card>

      <section className="mt-6">
        <SectionTitle>Данные</SectionTitle>
        <RowGroup className="mt-2">
          <Row
            label="Библиотека упражнений"
            value={count(exercises.length, WORDS.exercise)}
            href="/more/exercises"
          />
          <Row label="Импорт истории" href="/more/import" />
          <Row label="Внести тренировку вручную" href="/history/add" />
        </RowGroup>
      </section>

      <section className="mt-6">
        <SectionTitle>Тело и состояние</SectionTitle>
        <RowGroup className="mt-2">
          <Row
            label="Вес тела"
            value={weight.latest ? `${formatWeight(weight.latest.weight)} кг` : '—'}
            href="/more/body-weight"
          />
          <Row
            label="Боль и дискомфорт"
            value={pain.length ? `${pain.length} активных` : 'нет'}
            href="/more/pain"
          />
        </RowGroup>
      </section>

      <section className="mt-6">
        <SectionTitle>Приложение</SectionTitle>
        <RowGroup className="mt-2">
          <Row label="Настройки" href="/more/settings" />
          <Row label="Режимы тренировок" href="/more/settings#modes" />
        </RowGroup>
        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
          Хранилище: {storage ? (STORAGE_LABEL[storage] ?? storage) : '—'}. Все данные лежат на
          этом устройстве — приложение работает без интернета.
        </p>
      </section>
    </Screen>
  );
}
