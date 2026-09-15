'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Screen, ScreenHeader } from '@/components/layout/Screen';
import { ConfirmDialog, Sheet } from '@/components/ui/Sheet';
import {
  Badge,
  Card,
  Chevron,
  EmptyState,
  LinkButton,
  Row,
  RowGroup,
  SectionTitle,
  cx,
} from '@/components/ui/primitives';
import type { Program } from '@/domain/types';
import { pluralize } from '@/engine/format';
import { programSummary } from '@/store/selectors';
import { useStore } from '@/store/useStore';

/** MY PROGRAMS — templates live here; nothing on this screen touches history. */
export default function ProgramsPage() {
  const programs = useStore((s) => s.programs);
  const activeProgramId = useStore((s) => s.settings.activeProgramId);

  const active = programs.filter((p) => p.status === 'active' || p.id === activeProgramId);
  const drafts = programs.filter((p) => p.status === 'draft' && p.id !== activeProgramId);
  const archived = programs.filter((p) => p.status === 'archived' && p.id !== activeProgramId);

  return (
    <Screen>
      <ScreenHeader
        title="Программы"
        large
        right={
          <LinkButton href="/programs/new" size="sm" variant="primary">
            + СОЗДАТЬ
          </LinkButton>
        }
      />

      {programs.length === 0 ? (
        <Card>
          <EmptyState
            title="Create your first program"
            description="Программа — это шаблон: дни, упражнения, подходы и веса. Тренировки сохраняются отдельно."
            action={
              <LinkButton href="/programs/new" variant="primary" size="lg">
                СОЗДАТЬ ПРОГРАММУ
              </LinkButton>
            }
          />
        </Card>
      ) : null}

      {active.length ? (
        <section>
          <SectionTitle>Active</SectionTitle>
          <div className="mt-2 flex flex-col gap-2.5">
            {active.map((program) => (
              <ProgramCard key={program.id} program={program} isActive />
            ))}
          </div>
        </section>
      ) : null}

      {drafts.length ? (
        <section className="mt-6">
          <SectionTitle>Draft</SectionTitle>
          <div className="mt-2 flex flex-col gap-2.5">
            {drafts.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        </section>
      ) : null}

      {archived.length ? (
        <section className="mt-6">
          <SectionTitle>Archived</SectionTitle>
          <div className="mt-2 flex flex-col gap-2.5">
            {archived.map((program) => (
              <ProgramCard key={program.id} program={program} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-7">
        <SectionTitle>Библиотека</SectionTitle>
        <RowGroup className="mt-2">
          <Row label="Упражнения" href="/more/exercises" />
        </RowGroup>
      </section>
    </Screen>
  );
}

function ProgramCard({ program, isActive }: { program: Program; isActive?: boolean }) {
  const summary = programSummary(program);
  const activateProgram = useStore((s) => s.activateProgram);
  const setProgramStatus = useStore((s) => s.setProgramStatus);
  const duplicateProgram = useStore((s) => s.duplicateProgram);
  const deleteProgram = useStore((s) => s.deleteProgram);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Card className={cx('overflow-hidden', isActive && 'border-accent/40')}>
        <Link href={`/programs/editor?id=${program.id}`} className="block p-4 active:bg-surface2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {isActive ? <Badge color="var(--color-accent)">Active</Badge> : null}
              <p className="mt-1.5 text-[17px] leading-snug font-semibold tracking-tight">
                {program.name}
              </p>
              {program.description ? (
                <p className="mt-1 truncate text-[12.5px] text-dim">{program.description}</p>
              ) : null}
              <p className="tnum mt-2 text-[12px] text-dim">
                {pluralize(summary.days, 'day')} · {pluralize(summary.exercises, 'exercise')} ·{' '}
                {pluralize(summary.sets, 'set')}
              </p>
            </div>
            <Chevron />
          </div>
        </Link>

        <div className="flex divide-x divide-line border-t border-line">
          {!isActive ? (
            <button
              type="button"
              onClick={() => activateProgram(program.id)}
              className="flex-1 py-3 text-[12px] font-semibold tracking-[0.08em] text-accent uppercase active:bg-surface2"
            >
              Сделать активной
            </button>
          ) : null}
          <Link
            href={`/programs/editor?id=${program.id}`}
            className="flex-1 py-3 text-center text-[12px] font-semibold tracking-[0.08em] text-dim uppercase active:bg-surface2"
          >
            Редактировать
          </Link>
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex-1 py-3 text-[12px] font-semibold tracking-[0.08em] text-dim uppercase active:bg-surface2"
          >
            Ещё
          </button>
        </div>
      </Card>

      <Sheet open={menu} onClose={() => setMenu(false)} title={program.name}>
        <RowGroup>
          <Row
            label="Дублировать"
            onClick={() => {
              duplicateProgram(program.id);
              setMenu(false);
            }}
          />
          {program.status !== 'archived' ? (
            <Row
              label="В архив"
              onClick={() => {
                setProgramStatus(program.id, 'archived');
                setMenu(false);
              }}
            />
          ) : (
            <Row
              label="Вернуть из архива"
              onClick={() => {
                setProgramStatus(program.id, 'draft');
                setMenu(false);
              }}
            />
          )}
          <Row
            label="Удалить программу"
            tone="danger"
            onClick={() => {
              setMenu(false);
              setConfirmDelete(true);
            }}
          />
        </RowGroup>
        <p className="mt-3 px-1 text-[12px] leading-relaxed text-dim">
          Удаление программы не удаляет тренировки — история остаётся в разделе History.
        </p>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить программу?"
        message="Шаблон будет удалён. Прошлые тренировки останутся в истории."
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          deleteProgram(program.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
