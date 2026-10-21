import React from 'react';
import { Menu, ArrowDown, MessageSquarePlus, VenetianMask, Loader2 } from 'lucide-react';
import type { ModelProgressEvent } from '../types';
import { t } from '../utils/i18n';

interface HeaderProps {
  activeModelName: string;
  isIncognito: boolean;
  progressEvent?: ModelProgressEvent | null;
  mode?: 'chat' | 'work';
  workDir?: string;
  workQuotaGB?: number;
  workUsedGB?: number;
  isGuest?: boolean;
  onOpenSidebar: () => void;
  onOpenModelSelector: () => void;
  onNewChat: () => void;
  onToggleIncognito: () => void;
  onGuestNotice?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeModelName,
  isIncognito,
  progressEvent,
  mode = 'chat',
  workDir,
  workQuotaGB = 5,
  workUsedGB = 0,
  isGuest = false,
  onOpenSidebar,
  onOpenModelSelector,
  onNewChat,
  onToggleIncognito,
  onGuestNotice,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
        flexShrink: 0,
        background: 'linear-gradient(to bottom, var(--bg-top) 0%, rgba(10, 8, 8, 0.85) 75%, transparent 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 'var(--header-h)',
          padding: '0 var(--sp-4)',
        }}
      >
        {/* Left: Menu button */}
        <button
          onClick={onOpenSidebar}
          aria-label="Menu"
          className="press"
          style={{
            width: 'var(--hit)',
            height: 'var(--hit)',
            borderRadius: 'var(--r-m)',
            backgroundColor: 'var(--surface-1)',
            flexShrink: 0,
          }}
        >
          <Menu size={20} strokeWidth={1.75} color="var(--icon)" />
        </button>

        {/* Center: Model Chip */}
        <button
          onClick={isGuest ? onGuestNotice : onOpenModelSelector}
          aria-label="Select model"
          className="press"
          style={{
            height: '28px',
            padding: '0 10px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--surface-1)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            maxWidth: '55%',
            cursor: isGuest ? 'default' : 'pointer',
            border: progressEvent?.status === 'loading' ? '1px solid var(--accent)' : 'none',
          }}
          title={isGuest ? t('fullModeOnly') : t('selectModel')}
        >
          {progressEvent?.status === 'loading' ? (
            <Loader2 size={13} className="spinner-icon" color="var(--accent)" style={{ flexShrink: 0 }} />
          ) : null}
          <span
            style={{
              fontSize: 'var(--fs-small)',
              color: progressEvent?.status === 'loading' ? 'var(--accent)' : 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {progressEvent?.status === 'loading'
              ? progressEvent.progress !== undefined
                ? `${t('loading')} ${Math.round(progressEvent.progress * 100)}%`
                : t('loading')
              : activeModelName || t('selectModel')}
          </span>
          {!isGuest && <ArrowDown size={12} strokeWidth={1.75} color="var(--text)" style={{ flexShrink: 0 }} />}
        </button>

        {/* Right: New chat + Incognito */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <button
            onClick={onNewChat}
            aria-label="New chat"
            className="press"
            style={{
              width: 'var(--hit)',
              height: 'var(--hit)',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--surface-1)',
            }}
          >
            <MessageSquarePlus size={20} strokeWidth={1.75} color="var(--icon)" />
          </button>

          <button
            onClick={onToggleIncognito}
            aria-label="Incognito mode"
            className="press"
            style={{
              width: 'var(--hit)',
              height: 'var(--hit)',
              borderRadius: 'var(--r-pill)',
              backgroundColor: isIncognito ? 'var(--selected)' : 'var(--surface-1)',
              transition: 'background-color 200ms var(--ease-out)',
            }}
          >
            <VenetianMask size={20} strokeWidth={1.75} color="var(--icon)" />
          </button>
        </div>
      </header>

      {/* Subheader info if in WORK mode or Incognito */}
      {isIncognito ? (
        <div
          style={{
            padding: '0 var(--sp-4) var(--sp-1)',
            fontSize: 'var(--fs-small)',
            color: 'var(--text-muted)',
            lineHeight: 1.2,
          }}
        >
          Incognito
        </div>
      ) : mode === 'work' ? (
        <div
          style={{
            padding: '0 var(--sp-4) var(--sp-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--fs-small)',
            color: 'var(--text-muted)',
            lineHeight: 1.2,
          }}
        >
          <span>WORK {workDir}</span>
          <span>{workUsedGB.toFixed(1)} / {workQuotaGB} GB</span>
        </div>
      ) : null}
    </div>
  );
};
