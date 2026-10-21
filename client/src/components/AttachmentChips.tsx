import React from 'react';
import type { Attachment } from '../types';
import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { t } from '../utils/i18n';

interface AttachmentChipsProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export const AttachmentChips: React.FC<AttachmentChipsProps> = ({ attachments, onRemove }) => {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        padding: '0 4px 8px 4px',
        maxHeight: '80px',
      }}
    >
      {list.map((att) => (
        <div
          key={att.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-s)',
            padding: '4px 8px',
            fontSize: '12px',
            color: 'var(--text)',
            flexShrink: 0,
            maxWidth: '200px',
          }}
        >
          {att.isImage && att.dataUrl ? (
            <img
              src={att.dataUrl}
              alt={att.filename}
              style={{ width: '22px', height: '22px', objectFit: 'cover', borderRadius: '4px' }}
            />
          ) : (
            <FileText size={16} strokeWidth={1.75} color="var(--accent)" />
          )}

          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '130px',
            }}
          >
            {att.filename}
          </span>

          <button
            type="button"
            onClick={() => onRemove(att.id)}
            style={{
              padding: '2px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-muted)',
            }}
            title={t('delete')}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
};
