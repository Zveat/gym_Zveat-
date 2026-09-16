'use client';

import { useRef, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { useDisplayMode } from '@/components/layout/DisplayMode';
import { BUILD_ID } from '@/engine/app-version';
import { readStats, readTotals } from '@/data/read-meter';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { Field, TextInput, Toggle } from '@/components/ui/inputs';
import {
  Button,
  Card,
  Chip,
  Eyebrow,
  Notice,
  Row,
  RowGroup,
  SectionTitle,
  cx,
} from '@/components/ui/primitives';
import { signOutAccount } from '@/data/firebase-app';
import { MODE_COLOR, MODE_ORDER } from '@/domain/modes';
import type { DatabaseSnapshot, ModeConfig, WorkoutMode } from '@/domain/types';
import { MODE_LABEL, WORDS, count } from '@/engine/format';
import { useStore } from '@/store/useStore';

/**
 * SETTINGS — the knobs that change how the app behaves in the gym, plus the
 * mode modifiers, which are settings rather than hard-coded behaviour.
 */
export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const storage = useStore((s) => s.storage);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateMode = useStore((s) => s.updateMode);
  const resetModes = useStore((s) => s.resetModes);
  const exportSnapshot = useStore((s) => s.exportSnapshot);
  const importSnapshot = useStore((s) => s.importSnapshot);
  const resetEverything = useStore((s) => s.resetEverything);

  const cloud = useStore((s) => s.cloud);
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = () => {
    const snapshot = exportSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Резервная копия сохранена.');
  };

  const importFile = async (file: File) => {
    try {
      const snapshot = JSON.parse(await file.text()) as DatabaseSnapshot;
      if (!snapshot.settings || !Array.isArray(snapshot.programs)) {
        setMessage('Файл не похож на резервную копию Gym OS.');
        return;
      }
      importSnapshot(snapshot);
      setMessage('Данные восстановлены из копии.');
    } catch {
      setMessage('Не удалось прочитать файл.');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Настройки" back="/more" />

      {cloud.configured ? (
        <section className="mb-6">
          <SectionTitle>Аккаунт</SectionTitle>
          <Card className="mt-2 p-4">
            <Eyebrow>Вход выполнен</Eyebrow>
            <p className="mt-1 text-[15px] font-medium">{cloud.account?.email ?? '—'}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-dim">
              Тренировки хранятся на сервере и доступны с любого устройства. В зале приложение
              работает без связи, записи уходят при первой возможности.
            </p>
            <Button size="md" full className="mt-3" onClick={() => setConfirmSignOut(true)}>
              ВЫЙТИ ИЗ АККАУНТА
            </Button>
          </Card>
        </section>
      ) : null}

      <Card className="p-4">
        <Field label="Имя" hint="Показывается на главном экране">
          <TextInput
            value={settings.userName}
            onChange={(e) => updateSettings({ userName: e.target.value })}
          />
        </Field>
      </Card>

      <section className="mt-6">
        <SectionTitle>Во время тренировки</SectionTitle>

        <Card className="mt-2 p-4">
          <Eyebrow>Шаг изменения веса</Eyebrow>
          <div className="mt-2 flex gap-1.5">
            {[1, 2.5, 5].map((step) => (
              <Chip
                key={step}
                selected={settings.weightStep === step}
                onClick={() => updateSettings({ weightStep: step })}
              >
                ± {step} кг
              </Chip>
            ))}
          </div>

          <Eyebrow className="mt-5">Отдых по умолчанию</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[60, 75, 90, 120, 150, 180].map((seconds) => (
              <Chip
                key={seconds}
                selected={settings.defaultRestSeconds === seconds}
                onClick={() => updateSettings({ defaultRestSeconds: seconds })}
              >
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
            Используется, если у упражнения не задано своё время отдыха.
          </p>
        </Card>

        <RowGroup className="mt-3">
          <Toggle
            label="Таймер отдыха автоматически"
            description="Запускается сразу после сохранения подхода."
            checked={settings.restTimerAutoStart}
            onChange={(restTimerAutoStart) => updateSettings({ restTimerAutoStart })}
          />
          <Toggle
            label="Автопереход к упражнению"
            description="После последнего подхода сразу открывается следующее упражнение."
            checked={settings.autoAdvanceExercise}
            onChange={(autoAdvanceExercise) => updateSettings({ autoAdvanceExercise })}
          />
          <Toggle
            label="Вибрация"
            description="Подход сохранён, новый рекорд, конец отдыха."
            checked={settings.hapticsEnabled}
            onChange={(hapticsEnabled) => updateSettings({ hapticsEnabled })}
          />
        </RowGroup>
      </section>

      <section id="modes" className="mt-7">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={resetModes}
              className="text-[12px] text-dim active:text-ink"
            >
              Сбросить
            </button>
          }
        >
          Режимы тренировок
        </SectionTitle>
        <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-dim">
          Режимы — это модификаторы поверх активной программы. Отдельные программы создавать не
          нужно.
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          {MODE_ORDER.map((mode) => (
            <ModeCard key={mode} mode={mode} onChange={updateMode} />
          ))}
        </div>
      </section>

      <section className="mt-7">
        <SectionTitle>Данные</SectionTitle>
        {message ? (
          <div className="mt-2">
            <Notice tone="accent">{message}</Notice>
          </div>
        ) : null}

        <RowGroup className="mt-2">
          <Row label="Сохранить резервную копию" onClick={exportData} />
          <Row label="Восстановить из копии" onClick={() => fileInput.current?.click()} />
          <Row label="Сбросить всё и вернуть программу" tone="danger" onClick={() => setConfirmReset(true)} />
        </RowGroup>

        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />

        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-dim">
          {storage === 'firestore'
            ? 'Данные хранятся на сервере (Firestore) и кэшируются на устройстве для работы без связи. Резервная копия нужна разве что для переноса в другое место.'
            : storage === 'indexeddb'
              ? 'Данные хранятся только на этом устройстве (IndexedDB). Делайте резервную копию перед сменой устройства.'
              : storage === 'localstorage'
                ? 'Данные хранятся только на этом устройстве (localStorage — браузер ограничил доступ к IndexedDB). Делайте резервную копию перед сменой устройства.'
                : storage === 'memory'
                  ? 'Внимание: браузер запретил сохранение — данные исчезнут после закрытия. Сохраните резервную копию.'
                  : 'Хранилище определяется.'}
        </p>
      </section>

      <section className="mt-6">
        <SectionTitle>Как открыто</SectionTitle>
        <DisplayModeCard />
      </section>

      {storage === 'firestore' ? (
        <section className="mt-6">
          <SectionTitle>Чтений из базы</SectionTitle>
          <ReadMeterCard />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmSignOut}
        title="Выйти из аккаунта?"
        message="Тренировки останутся на сервере — войдёте снова и всё будет на месте."
        confirmLabel="Выйти"
        onConfirm={() => {
          void signOutAccount();
          setConfirmSignOut(false);
        }}
        onCancel={() => setConfirmSignOut(false)}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить все данные?"
        message={
          storage === 'firestore'
            ? 'Будут удалены все тренировки, программы, заметки и рекорды — в том числе на сервере и на других устройствах. Вернётся предустановленная программа. Это нельзя отменить.'
            : 'Будут удалены все тренировки, программы, заметки и рекорды. Вернётся предустановленная программа. Это нельзя отменить.'
        }
        confirmLabel="Сбросить"
        danger
        requireWord="СБРОСИТЬ"
        onConfirm={() => {
          void resetEverything();
          setConfirmReset(false);
          setMessage('Данные сброшены.');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </Screen>
  );
}

/**
 * The numbers behind "меню висит высоко". In a browser tab the viewport ends
 * above the screen and the browser's toolbar fills the rest, tinted with our
 * own `theme-color` — so it looks like the app left a gap. Showing the
 * measurement makes the difference visible instead of arguable.
 */
function DisplayModeCard() {
  const info = useDisplayMode();

  if (!info) {
    return (
      <Card className="mt-2 p-4">
        <p className="text-[13px] text-dim">Определяется…</p>
      </Card>
    );
  }

  const rows: [string, string][] = [
    // Сборка стоит первой строкой: по скриншоту иначе не видно, какая версия
    // открыта, и разбор любой жалобы начинается с угадывания.
    ['Сборка', BUILD_ID],
    ['Режим', info.standalone ? 'Как приложение' : 'В браузере'],
    ['Высота экрана', `${info.screenHeight} pt`],
    ['Высота окна', `${info.viewportHeight} pt`],
    ['Занято браузером', `${info.chrome} pt`],
    ['Отступ снизу (iOS)', `${info.safeBottom} pt`],
  ];

  const explanation = info.standalone
    ? 'Приложение запущено с домашнего экрана — нижнее меню стоит вплотную к краю окна, над индикатором home.'
    : info.phone && info.chrome >= 24
      ? `Браузер занимает ${info.chrome} pt внизу экрана. Меню приложения прижато к низу окна, а ниже идёт панель браузера — поэтому меню и выглядит приподнятым. Добавьте на домашний экран, чтобы её не было.`
      : 'Открыто во вкладке браузера, но снизу браузер ничего не занимает — меню стоит вплотную к краю окна.';

  return (
    <>
      <Card className="mt-2 p-4">
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={cx(
              'flex items-baseline justify-between gap-3',
              index > 0 && 'mt-2.5 border-t border-line pt-2.5',
            )}
          >
            <span className="text-[13px] text-dim">{label}</span>
            <span className="tnum text-[13.5px] font-medium">{value}</span>
          </div>
        ))}
      </Card>
      <p className="mt-2 px-1 text-[12px] leading-relaxed text-dim">{explanation}</p>
    </>
  );
}

/**
 * За что платим и сколько ждём при открытии.
 *
 * Firestore берёт деньги за чтение документов, а сколько их — из приложения не
 * видно. Два полных чтения базы по сети на каждом запуске нашлись только
 * чтением кода: на экране всё выглядело одинаково. Цифра здесь делает это
 * видимым сразу.
 */
function ReadMeterCard() {
  const totals = readTotals();
  const rows = readStats();
  const LABEL: Record<string, string> = { server: 'сеть', cache: 'кэш', watch: 'подписка' };

  return (
    <>
      <Card className="mt-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-dim">По сети (платно)</span>
          <span className="tnum text-[15px] font-semibold">
            {count(totals.serverDocs, WORDS.document)}
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
          <span className="text-[13px] text-dim">Всего с открытия</span>
          <span className="tnum text-[13.5px] font-medium">
            {totals.docs} / {count(totals.calls, WORDS.request)}
          </span>
        </div>
      </Card>

      {rows.length ? (
        <Card className="mt-2 p-4">
          {rows.map((row, index) => (
            <div
              key={`${row.collection}:${row.source}`}
              className={cx(
                'flex items-baseline justify-between gap-3',
                index > 0 && 'mt-2 border-t border-line pt-2',
              )}
            >
              <span className="text-[12.5px] text-dim">
                {row.collection} · {LABEL[row.source] ?? row.source}
              </span>
              <span className="tnum text-[12.5px] font-medium">
                {row.docs} / {row.calls}
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      <p className="mt-2 px-1 text-[12px] leading-relaxed text-dim">
        Счётчик живёт в памяти вкладки и в базу ничего не пишет. Кэш бесплатен и мгновенен,
        поэтому смотреть надо на первую строку: при обычном открытии там должен быть ноль.
      </p>
    </>
  );
}

function ModeCard({
  mode,
  onChange,
}: {
  mode: WorkoutMode;
  onChange: (mode: WorkoutMode, patch: Partial<ModeConfig>) => void;
}) {
  const config = useStore((s) => s.settings.modes[mode]);
  const percent = Math.round(config.weightMultiplier * 100);
  const setsPercent = Math.round(config.setsMultiplier * 100);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: MODE_COLOR[mode] }} />
        <p className="text-[14px] font-semibold tracking-[0.06em] uppercase">
          {MODE_LABEL[mode]}
        </p>
      </div>
      <p className="mt-1 text-[12px] text-dim">{config.description}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Вес, %">
          <TextInput
            type="number"
            inputMode="numeric"
            value={percent}
            onChange={(e) =>
              onChange(mode, {
                weightMultiplier: Math.max(10, Math.min(200, parseInt(e.target.value, 10) || 100)) / 100,
              })
            }
            density="compact"
                    className="tnum text-center"
          />
        </Field>
        <Field label="Подходов, %">
          <TextInput
            type="number"
            inputMode="numeric"
            value={setsPercent}
            onChange={(e) =>
              onChange(mode, {
                setsMultiplier: Math.max(20, Math.min(100, parseInt(e.target.value, 10) || 100)) / 100,
              })
            }
            density="compact"
                    className="tnum text-center"
          />
        </Field>
        <Field label="Подходы ±">
          <TextInput
            type="number"
            inputMode="numeric"
            value={config.setsDelta}
            onChange={(e) => onChange(mode, { setsDelta: parseInt(e.target.value, 10) || 0 })}
            density="compact"
                    className="tnum text-center"
          />
        </Field>
        <Field label="Повторения ±">
          <TextInput
            type="number"
            inputMode="numeric"
            value={config.repsDelta}
            onChange={(e) => onChange(mode, { repsDelta: parseInt(e.target.value, 10) || 0 })}
            density="compact"
                    className="tnum text-center"
          />
        </Field>
      </div>

      <div className="mt-3 overflow-hidden rounded-[var(--radius-tile)] border border-line">
        <Toggle
          label="Убирать отказные подходы"
          checked={config.disableFailureSets}
          onChange={(disableFailureSets) => onChange(mode, { disableFailureSets })}
        />
      </div>
    </Card>
  );
}
