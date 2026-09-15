'use client';

import { useRef, useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { Field, TextInput, Toggle } from '@/components/ui/inputs';
import {
  Card,
  Chip,
  Eyebrow,
  Notice,
  Row,
  RowGroup,
  SectionTitle,
} from '@/components/ui/primitives';
import { MODE_COLOR, MODE_ORDER } from '@/domain/modes';
import type { DatabaseSnapshot, ModeConfig, WorkoutMode } from '@/domain/types';
import { MODE_LABEL } from '@/engine/format';
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

  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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
          Данные хранятся только на этом устройстве
          {storage === 'indexeddb'
            ? ' (IndexedDB)'
            : storage === 'localstorage'
              ? ' (localStorage — браузер ограничил доступ к IndexedDB)'
              : storage === 'memory'
                ? '. Внимание: браузер запретил сохранение, данные исчезнут после закрытия'
                : ''}
          . Делайте резервную копию перед сменой устройства.
        </p>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить все данные?"
        message="Будут удалены все тренировки, программы, заметки и рекорды. Вернётся предустановленная программа. Это нельзя отменить."
        confirmLabel="Сбросить"
        danger
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
