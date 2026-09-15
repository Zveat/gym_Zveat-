'use client';

import { useEffect, type ReactNode } from 'react';
import { Button, CloseIcon, cx } from './primitives';

/**
 * Bottom sheet — the app's main way of showing detail without leaving the
 * screen (progressive disclosure: technique, notes, history, pickers).
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  /** `full` is for content that scrolls a lot, e.g. exercise history. */
  size = 'auto',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'full';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
      />
      <div
        className={cx(
          'anim-sheet relative flex flex-col rounded-t-[26px] border-t border-line bg-surface',
          size === 'full' ? 'h-[92vh]' : 'max-h-[88vh]',
        )}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
            {title ? (
              <h2 className="text-[17px] leading-tight font-semibold tracking-tight">{title}</h2>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-[12px] text-dim">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="touch -mr-2 -mt-1 flex items-center justify-center rounded-full text-dim active:bg-surface3"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer ? (
          <div className="border-t border-line bg-surface px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Small centred dialog for confirmations. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <button type="button" aria-label="Отмена" onClick={onCancel} className="absolute inset-0 bg-black/75" />
      <div className="anim-pop relative w-full max-w-sm rounded-[22px] border border-line bg-surface p-5">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {message ? <div className="mt-2 text-[13.5px] leading-relaxed text-dim">{message}</div> : null}
        <div className="mt-5 flex gap-2">
          <Button full onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button full variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
