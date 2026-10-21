import React, { useRef, useEffect } from 'react';
import { Plus, Send, Square, Globe } from 'lucide-react';
import type { Attachment } from '../types';
import { AttachmentChips } from './AttachmentChips';
import { t } from '../utils/i18n';

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  onPlusClick?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  mode?: 'chat' | 'work';
  onModeChange?: (mode: 'chat' | 'work') => void;
  showModeSwitcher?: boolean;
  workModeEnabled?: boolean;
  workModeAllowed?: boolean;
  isGuest?: boolean;
  onPasteFile?: (file: File) => void;
  webSearchEnabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  onPlusClick,
  isStreaming,
  disabled,
  attachments = [],
  onRemoveAttachment,
  mode = 'chat',
  onModeChange,
  showModeSwitcher = false,
  workModeEnabled = true,
  workModeAllowed = true,
  isGuest = false,
  onPasteFile,
  webSearchEnabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && onPasteFile) {
          e.preventDefault();
          onPasteFile(file);
          return;
        }
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 24), 130)}px`;
    }
  }, [value]);

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (value.trim() || hasAttachments) && !disabled) {
        onSend();
      }
    }
  };

  const hasContent = value.trim().length > 0 || hasAttachments;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: '6px var(--sp-4) max(12px, env(safe-area-inset-bottom, 0px)) var(--sp-4)',
        position: 'relative',
        zIndex: 30,
        background: 'linear-gradient(to top, var(--bg-bottom) 60%, transparent 100%)',
      }}
    >
      {/* Ask / Work Mode Switcher for Empty Chat */}
      {showModeSwitcher && onModeChange && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '8px',
          }}
        >
          <div
            className="segmented"
            style={
              {
                width: '180px',
                height: '34px',
                '--n': 2,
                '--i': mode === 'chat' ? 0 : 1,
              } as React.CSSProperties
            }
          >
            <button
              type="button"
              data-active={mode === 'chat'}
              onClick={() => onModeChange('chat')}
              style={{ fontSize: '13px' }}
            >
              {t('ask')}
            </button>
            <button
              type="button"
              data-active={mode === 'work'}
              disabled={isGuest || !workModeEnabled || workModeAllowed === false}
              onClick={() => {
                if (isGuest) {
                  alert(t('fullModeOnly'));
                  return;
                }
                if (workModeAllowed === false) {
                  alert(t('workModeWifiOnly'));
                  return;
                }
                onModeChange?.('work');
              }}
              style={{
                fontSize: '13px',
                opacity: !isGuest && workModeEnabled && workModeAllowed !== false ? 1 : 0.4,
              }}
              title={
                isGuest
                  ? t('fullModeOnly')
                  : workModeAllowed === false
                  ? t('workModeWifiOnly')
                  : !workModeEnabled
                  ? 'Work mode is off on PC'
                  : undefined
              }
            >
              {t('work')}
            </button>
          </div>
        </div>
      )}

      {/* Pending Attachments */}
      {hasAttachments && onRemoveAttachment && (
        <AttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
          backgroundColor: 'var(--surface-1)',
          borderRadius: 'var(--r-l)',
          padding: '8px 10px',
          minHeight: 'var(--input-h)',
        }}
      >
        {/* Left Plus button */}
        <button
          type="button"
          onClick={onPlusClick}
          aria-label="Add attachment or options"
          className="press"
          style={{
            width: '36px',
            height: '36px',
            minWidth: '36px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--surface-round)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <Plus size={18} strokeWidth={1.75} color="var(--icon)" />
          {webSearchEnabled && (
            <span
              title={t('webSearch')}
              style={{
                position: 'absolute',
                top: '-1px',
                right: '-1px',
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent, #dc2626)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 2px var(--surface-1)',
              }}
            >
              <Globe size={8} color="#ffffff" strokeWidth={2.5} />
            </span>
          )}
        </button>

        {/* Text input area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={mode === 'work' ? t('placeholderWork') : t('placeholderChat')}
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 'var(--fs-input)', // 16px
            lineHeight: 'var(--lh-base)',
            resize: 'none',
            padding: '4px 6px',
            maxHeight: '130px',
            overflowY: 'auto',
          }}
        />

        {/* Right Send or Stop button */}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="press"
            style={{
              width: '36px',
              height: '36px',
              minWidth: '36px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--surface-round)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Square size={14} fill="var(--icon)" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!hasContent || disabled}
            aria-label="Send message"
            className="press"
            style={{
              width: '36px',
              height: '36px',
              minWidth: '36px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--surface-round)',
              opacity: hasContent ? 1 : 0.4,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Send size={16} strokeWidth={1.75} color="var(--icon)" />
          </button>
        )}
      </div>
    </div>
  );
};
