import React, { useEffect } from 'react';
import { t } from '../utils/i18n';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  const effectiveConfirmLabel = confirmLabel || t('confirm');
  const effectiveCancelLabel = cancelLabel || t('cancel');
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'none',
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          width: 'min(90vw, 340px)',
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-l)',
          padding: '20px',
          boxSizing: 'border-box',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="confirm-modal-title"
          style={{
            fontSize: '15px',
            fontWeight: 'var(--fw-medium)',
            color: 'var(--text-primary)',
            textAlign: 'left',
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            lineHeight: '1.4',
            textAlign: 'left',
          }}
        >
          {message}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--r-m)',
              border: 'none',
              background: 'var(--surface-3)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 'var(--fw-medium)',
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {effectiveCancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--r-m)',
              border: 'none',
              background: isDanger ? 'var(--danger)' : 'var(--selected)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 'var(--fw-medium)',
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {effectiveConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
