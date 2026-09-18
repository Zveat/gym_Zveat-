'use client';

import { useMemo, useState } from 'react';
import { LineTrend } from '@/components/charts/LineTrend';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { Field, TextInput } from '@/components/ui/inputs';
import {
  Button,
  Card,
  EmptyState,
  Notice,
  SectionTitle,
  SegmentedControl,
  Stat,
  TrashIcon,
  cx,
} from '@/components/ui/primitives';
import { todayString } from '@/domain/ids';
import type { BodyWeightGoal } from '@/domain/types';
import { bodyWeightStats, bodyWeightVerdict } from '@/engine/analytics';
import { formatDateShort, formatWeight } from '@/engine/format';
import { fatMass, leanMass } from '@/engine/body-composition';
import { useStore } from '@/store/useStore';

type Range = 'week' | 'month' | '3m' | 'year' | 'all';

const RANGE_DAYS: Record<Range, number | null> = {
  week: 7,
  month: 30,
  '3m': 90,
  year: 365,
  all: null,
};

const GOAL_LABEL: Record<BodyWeightGoal, string> = {
  bulk: 'Набор',
  maintain: 'Поддержание',
  cut: 'Сушка',
};

/** BODY WEIGHT — one number a day, and whether it is moving the right way. */
export default function BodyWeightPage() {
  const logs = useStore((s) => s.bodyWeightLogs);
  const goal = useStore((s) => s.settings.bodyWeightGoal);
  const addBodyWeight = useStore((s) => s.addBodyWeight);
  const deleteBodyWeight = useStore((s) => s.deleteBodyWeight);
  const updateSettings = useStore((s) => s.updateSettings);

  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [visceral, setVisceral] = useState('');
  const [date, setDate] = useState(todayString());
  const [range, setRange] = useState<Range>('month');

  const stats = useMemo(() => bodyWeightStats(logs), [logs]);
  // Считается всегда, даже без данных: именно он объясняет, чего не хватает,
  // чтобы цель начала работать. Раньше переключатель молчал при любом состоянии.
  const verdict = useMemo(() => bodyWeightVerdict(logs, goal), [logs, goal]);
  const latestFat = stats.latest ? fatMass(stats.latest) : null;
  const latestLean = stats.latest ? leanMass(stats.latest) : null;

  const sorted = useMemo(
    () => logs.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [logs],
  );

  const series = useMemo(() => {
    const days = RANGE_DAYS[range];
    const cutoff = days
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - days);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : null;

    return sorted
      .filter((log) => (cutoff ? log.date >= cutoff : true))
      .slice()
      .reverse()
      .map((log) => ({
        label: formatDateShort(log.date),
        value: log.weight,
        date: log.date,
      }));
  }, [sorted, range]);

  const submit = () => {
    const value = parseFloat(weight.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;

    /*
     * Пустое поле — это «не мерил», а не ноль. Ноль процентов жира не бывает,
     * и записанный ноль испортил бы и массу жира, и разложение изменения.
     */
    const num = (raw: string, max: number) => {
      const n = parseFloat(raw.replace(',', '.'));
      return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 10) / 10 : null;
    };

    addBodyWeight(Math.round(value * 10) / 10, date, undefined, {
      bodyFatPercent: num(fat, 100),
      visceralFat: num(visceral, 60),
    });
    setWeight('');
    setFat('');
    setVisceral('');
  };

  const changeTone = (value: number | null) => {
    if (value === null || value === 0) return 'default' as const;
    if (goal === 'cut') return value < 0 ? ('progress' as const) : ('warn' as const);
    if (goal === 'bulk') return value > 0 ? ('progress' as const) : ('warn' as const);
    return 'default' as const;
  };

  return (
    <Screen>
      <ScreenHeader title="Вес тела" back="/more" />

      <Card className="p-4">
        {/*
          ТРИ ЧИСЛА В РЯД, ДАТА — СВОЕЙ СТРОКОЙ.
          Поле даты iOS рисует по локали, и «18 сент. 2026 г.» заметно шире
          короткого «дд.мм.гггг», который показывает Chromium. Рядом с весом
          в общей строке оно вылезало за карточку: `flex-1` не даёт элементу
          сжаться ниже содержимого (`min-width: auto`), и в браузере на
          компьютере этого не видно вообще. Поэтому дате — вся ширина, а
          числа стоят вместе, как их и читаешь с весов. `min-w-0` оставлен
          на всякий случай: он снимает то самое ограничение.
        */}
        <div className="flex items-end gap-2">
          <Field label="Вес, кг" className="min-w-0 flex-1">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="80.2"
              className="tnum text-[20px]"
            />
          </Field>
          <Field label="Жир, %" className="min-w-0 flex-1">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              placeholder="26.0"
              className="tnum text-[20px]"
            />
          </Field>
          <Field label="Висц. жир" className="min-w-0 flex-1">
            <TextInput
              type="number"
              inputMode="decimal"
              step="1"
              value={visceral}
              onChange={(e) => setVisceral(e.target.value)}
              placeholder="10"
              className="tnum text-[20px]"
            />
          </Field>
        </div>
        <Field label="Дата" className="mt-2">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {/*
          Процент жира и висцеральный — с умных весов, поэтому НЕобязательные:
          взвесился в зале на обычных — вводишь только вес, и вердикт по
          скорости работает как раньше. Всё остальное, что показывают весы
          (масса жира, сухая и мышечная масса, ИМТ), выводится из этих двух
          чисел — вводить это руками значит делать лишнюю работу на каждом
          взвешивании.
        */}
        <p className="mt-1.5 px-0.5 text-[11.5px] leading-relaxed text-dim">
          Жир и висцеральный — с умных весов, можно не заполнять. Массу жира и сухую массу
          приложение посчитает само.
        </p>

        {/*
          Подпись меняется, а не только гаснет. Поле пустое, но в нём стоит
          пример «80.2» — серый текст того же размера читается как уже
          введённое значение, поэтому кнопку жали и не понимали, почему ничего
          не происходит. Теперь она сама говорит, чего ждёт.
        */}
        <Button
          variant="primary"
          size="lg"
          full
          className="mt-3"
          onClick={submit}
          disabled={!weight.trim()}
        >
          {weight.trim() ? 'ДОБАВИТЬ' : 'ВВЕДИТЕ ВЕС'}
        </Button>
      </Card>

      <section className="mt-6">
        <SectionTitle>Цель</SectionTitle>
        <div className="mt-2">
          <SegmentedControl
            value={goal}
            onChange={(bodyWeightGoal) => updateSettings({ bodyWeightGoal })}
            options={(Object.keys(GOAL_LABEL) as BodyWeightGoal[]).map((g) => ({
              value: g,
              label: GOAL_LABEL[g],
            }))}
          />
        </div>

        <Notice
          className="mt-2"
          tone={
            verdict.kind === 'ok'
              ? 'accent'
              : verdict.kind === 'not-enough'
                ? 'info'
                : verdict.kind === 'wrong-way'
                  ? 'pain'
                  : 'warn'
          }
          title={verdict.headline}
        >
          {verdict.detail}
          {/*
            Чем именно набран вес — отдельной строкой, и это главное, что
            даёт процент жира. «+2,1 кг» не говорит, правильно ли идёт
            набор; «+2,1 кг, из них жир +1,6» говорит всё.
          */}
          {verdict.composition ? (
            <span className="mt-1.5 block font-medium text-ink">{verdict.composition}</span>
          ) : null}
        </Notice>
      </section>

      {stats.latest && latestFat !== null ? (
        <Card className="mt-4 grid grid-cols-3 divide-x divide-line">
          <div className="px-3 py-4">
            <Stat label="Жир" value={stats.latest.bodyFatPercent!.toFixed(1)} unit="%" />
          </div>
          <div className="px-3 py-4">
            <Stat label="Масса жира" value={formatWeight(latestFat)} unit="кг" />
          </div>
          <div className="px-3 py-4">
            <Stat label="Сухая масса" value={formatWeight(latestLean!)} unit="кг" />
          </div>
        </Card>
      ) : null}

      {stats.latest?.visceralFat != null ? (
        <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-dim">
          Висцеральный жир — {stats.latest.visceralFat}. Он не выводится из веса и процента
          жира, поэтому и записывается отдельно.
        </p>
      ) : null}

      {stats.latest ? (
        <>
          <Card className="mt-6 grid grid-cols-3 divide-x divide-line">
            <div className="px-3 py-4">
              <Stat label="Сейчас" value={formatWeight(stats.latest.weight)} unit="кг" />
            </div>
            <div className="px-3 py-4">
              <Stat
                label="7 дней"
                value={
                  stats.change7d === null
                    ? '—'
                    : `${stats.change7d > 0 ? '+' : ''}${formatWeight(stats.change7d)}`
                }
                tone={changeTone(stats.change7d)}
              />
            </div>
            <div className="px-3 py-4">
              <Stat
                label="30 дней"
                value={
                  stats.change30d === null
                    ? '—'
                    : `${stats.change30d > 0 ? '+' : ''}${formatWeight(stats.change30d)}`
                }
                tone={changeTone(stats.change30d)}
              />
            </div>
          </Card>

          <section className="mt-6">
            <SectionTitle>Динамика</SectionTitle>
            <div className="mt-2">
              <SegmentedControl
                value={range}
                onChange={setRange}
                options={[
                  { value: 'week', label: 'Нед' },
                  { value: 'month', label: 'Мес' },
                  { value: '3m', label: '3 мес' },
                  { value: 'year', label: 'Год' },
                  { value: 'all', label: 'Всё' },
                ]}
              />
            </div>
            <Card className="mt-2 p-4">
              {/*
                Подпись про ПЕРИОД, а не «нужна ещё одна точка»: у владельца
                два замера, но второй вне месяца — и график требовал третий.
              */}
              <LineTrend
                data={series}
                unit="кг"
                height={200}
                color="var(--status-info)"
                singleLabel={
                  logs.length > 1
                    ? 'В этом периоде один замер. Выберите «3 мес» или «Всё» — остальные там.'
                    : 'Нужно второе взвешивание, чтобы показать динамику.'
                }
              />
            </Card>
          </section>

          <section className="mt-6">
            <SectionTitle>Записи</SectionTitle>
            <ul className="mt-2 flex flex-col gap-1.5">
              {sorted.map((log, index) => {
                const previous = sorted[index + 1];
                const diff = previous ? Math.round((log.weight - previous.weight) * 10) / 10 : null;
                return (
                  <li
                    key={log.id}
                    className="flex items-center gap-3 rounded-[var(--radius-tile)] border border-line bg-surface px-3.5 py-2.5"
                  >
                    <span className="tnum w-[70px] shrink-0 text-[12px] text-dim">
                      {formatDateShort(log.date)}
                    </span>
                    {/*
                      В списке показывается ВСЁ, что введено, а не только вес.
                      Владелец ввёл процент жира и не нашёл его нигде, кроме
                      верхней карточки последнего замера: «не вижу историю
                      введённых данных». Записал — значит должен видеть.
                    */}
                    {/*
                      Тап по записи подставляет её в поля. Дополнить прошлый
                      замер процентом жира иначе можно только набрав ту же
                      дату руками и вспомнив вес — а запись за существующую
                      дату и так перезаписывается, так что механика уже есть,
                      не хватало только способа ею воспользоваться.
                    */}
                    <button
                      type="button"
                      onClick={() => {
                        setWeight(String(log.weight));
                        setDate(log.date);
                        setFat(log.bodyFatPercent != null ? String(log.bodyFatPercent) : '');
                        setVisceral(log.visceralFat != null ? String(log.visceralFat) : '');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="min-w-0 flex-1 text-left active:opacity-60"
                    >
                      <span className="tnum block text-[15px] font-medium">
                        {formatWeight(log.weight)} кг
                      </span>
                      {log.bodyFatPercent != null ? (
                        <span className="tnum block text-[11.5px] text-dim">
                          жир {log.bodyFatPercent.toFixed(1)}% · {formatWeight(fatMass(log)!)} кг ·
                          сухая {formatWeight(leanMass(log)!)} кг
                          {log.visceralFat != null ? ` · висц. ${log.visceralFat}` : ''}
                        </span>
                      ) : null}
                    </button>
                    {diff !== null && diff !== 0 ? (
                      <span
                        className={cx(
                          'tnum shrink-0 text-[12px]',
                          diff > 0 ? 'text-progress' : 'text-warn',
                        )}
                      >
                        {diff > 0 ? '+' : ''}
                        {formatWeight(diff)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteBodyWeight(log.id)}
                      aria-label="Удалить запись"
                      className="touch flex shrink-0 items-center justify-center text-dim active:text-pain"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : (
        <Card className="mt-6">
          <EmptyState
            title="Пока нет данных"
            description="Добавьте первое измерение — дальше приложение само покажет динамику."
          />
        </Card>
      )}
    </Screen>
  );
}
