import React, { useState, useEffect, useRef } from 'react';
import type { Chat } from '../types';
import { Search, X, Trash2, Pencil, Check } from 'lucide-react';
import { t } from '../utils/i18n';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  activeChatId: string | null;
  isGuest?: boolean;
  mode?: 'chat' | 'work';
  workModeEnabled?: boolean;
  onSelectChat: (id: string) => void;
  onNewChat: (mode?: 'chat' | 'work') => void;
  onRenameChat?: (id: string, newTitle: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenAdmin: () => void;
  onOpenDirectory: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  isGuest = false,
  mode,
  workModeEnabled,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
  onOpenAdmin,
  onOpenDirectory,
}) => {
  const [search, setSearch] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'basic' | 'work'>('basic');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = setTimeout(() => {
      setConfirmDeleteId(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (mode === 'work' && workModeEnabled) {
      setActiveFilter('work');
    }
  }, [mode, workModeEnabled]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Swipe left to close gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = e.touches[0].clientX - touchStartX.current;
    const diffY = e.touches[0].clientY - touchStartY.current;

    // Only drag left (negative X)
    if (diffX < 0 && Math.abs(diffX) > Math.abs(diffY)) {
      setDragX(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (dragX < -45) {
      onClose();
    }
    setDragX(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Filter chats by mode and search
  const isWorkChat = (c: Chat) => c.mode === 'work';
  const filteredChats = chats.filter((c) => {
    const matchesFilter = activeFilter === 'work' ? isWorkChat(c) : !isWorkChat(c);
    if (!matchesFilter) return false;
    if (search.trim()) {
      return (c.title || '').toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <>
      {/* Background scrim */}
      <div
        className="sheet-scrim"
        data-open={isOpen}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Sidebar drawer matching Screen 06 with swipe left */}
      <aside
        className="sidebar"
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation sidebar"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: 'min(80vw, 340px)',
          background: 'var(--surface-3)',
          borderTopRightRadius: 'var(--r-l)',
          borderBottomRightRadius: 'var(--r-l)',
          padding: 'var(--sp-4)',
          paddingTop: 'calc(var(--sp-4) + env(safe-area-inset-top))',
          paddingBottom: 'calc(var(--sp-4) + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transform: isOpen && dragX < 0 ? `translateX(${dragX}px)` : undefined,
          transition: isDragging ? 'none' : 'transform var(--dur-panel) var(--ease-out)',
        }}
      >
        {/* Top Header: rrchat on left, Search icon on right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '28px',
          }}
        >
          <span
            style={{
              fontSize: '15px',
              fontWeight: 'var(--fw-medium)',
              color: 'var(--text)',
              letterSpacing: '-0.02em',
            }}
          >
            rrchat
          </span>
          <button
            type="button"
            className="press"
            onClick={() => setIsSearchVisible(!isSearchVisible)}
            aria-label="Search chats"
            style={{
              background: 'none',
              border: 'none',
              width: 'var(--hit)',
              height: 'var(--hit)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              color: 'var(--text)',
              cursor: 'pointer',
              marginRight: '-10px',
            }}
          >
            <Search size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Collapsible search bar */}
        {isSearchVisible && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--surface-2)',
              borderRadius: 'var(--r-m)',
              padding: '0 10px',
              height: '38px',
            }}
          >
            <Search size={14} strokeWidth={1.75} color="var(--text-muted)" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchChats')}
              autoFocus
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'inherit',
                width: '100%',
                outline: 'none',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}

        {/* New chat button */}
        <button
          type="button"
          className="press"
          onClick={() => {
            onNewChat(isGuest ? 'chat' : (activeFilter === 'work' ? 'work' : 'chat'));
            onClose();
          }}
          style={{
            height: '44px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            border: 'none',
            color: 'var(--text)',
            fontSize: 'var(--fs-base)',
            fontWeight: 'var(--fw-medium)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '16px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {t('newChat')}
        </button>

        {/* Directory button - opens full-screen scene */}
        <button
          type="button"
          className="press"
          disabled={isGuest}
          onClick={() => {
            if (isGuest) return;
            onClose();
            onOpenDirectory();
          }}
          style={{
            height: '44px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            border: 'none',
            color: 'var(--text)',
            fontSize: 'var(--fs-base)',
            fontWeight: 'var(--fw-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: '16px',
            paddingRight: '16px',
            cursor: isGuest ? 'default' : 'pointer',
            opacity: isGuest ? 0.45 : 1,
            textAlign: 'left',
          }}
          title={isGuest ? t('fullModeOnly') : undefined}
        >
          <span>{t('directory')}</span>
          {isGuest && (
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {t('fullModeOnly')}
            </span>
          )}
        </button>

        {/* Segmented control: Basic Chats / Work Mode */}
        <div
          className="segmented"
          style={
            {
              '--n': 2,
              '--i': activeFilter === 'basic' ? 0 : 1,
            } as React.CSSProperties
          }
        >
          <button
            type="button"
            data-active={activeFilter === 'basic'}
            onClick={() => setActiveFilter('basic')}
          >
            {t('basicChats')}
          </button>
          <button
            type="button"
            data-active={activeFilter === 'work'}
            disabled={isGuest || !workModeEnabled}
            onClick={() => {
              if (isGuest) return;
              setActiveFilter('work');
            }}
            style={{ opacity: !isGuest && workModeEnabled ? 1 : 0.4 }}
            title={isGuest ? t('fullModeOnly') : (!workModeEnabled ? 'Work mode is off on PC' : undefined)}
          >
            {t('workChats')}
          </button>
        </div>

        {/* Chats list card container */}
        <div
          style={{
            flex: 1,
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            padding: '8px 10px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {filteredChats.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--text-dim)',
                fontSize: '12px',
                padding: '24px 0',
              }}
            >
              {t('noChats')}
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = c.id === activeChatId;
              const isConfirming = confirmDeleteId === c.id;
              const isEditing = editingChatId === c.id;
              return (
                <div
                  key={c.id}
                  className="press"
                  onClick={() => {
                    if (isEditing) return;
                    onSelectChat(c.id);
                    onClose();
                  }}
                  style={{
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-s)',
                    backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
                    color: 'var(--text)',
                    cursor: isEditing ? 'default' : 'pointer',
                    gap: '6px',
                  }}
                >
                  {isEditing ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}
                    >
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const trimmed = editingTitle.trim();
                            if (trimmed && onRenameChat) onRenameChat(c.id, trimmed);
                            setEditingChatId(null);
                          } else if (e.key === 'Escape') {
                            setEditingChatId(null);
                          }
                        }}
                        style={{
                          flex: 1,
                          background: 'var(--surface-3)',
                          borderRadius: 'var(--r-s)',
                          padding: '4px 6px',
                          fontSize: '13px',
                          color: 'var(--text)',
                          border: '1px solid var(--hairline)',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = editingTitle.trim();
                          if (trimmed && onRenameChat) onRenameChat(c.id, trimmed);
                          setEditingChatId(null);
                        }}
                        style={{ padding: '4px', color: 'var(--text)' }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingChatId(null)}
                        style={{ padding: '4px', color: 'var(--text-muted)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        style={{
                          fontSize: '13px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {c.title || t('newChat')}
                      </span>
                      {isConfirming ? (
                        <button
                          type="button"
                          className="press"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(c.id);
                            setConfirmDeleteId(null);
                          }}
                          aria-label="Confirm delete chat"
                          style={{
                            background: 'var(--danger)',
                            border: 'none',
                            borderRadius: 'var(--r-s)',
                            padding: '4px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 'var(--fw-medium)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t('confirmDelete')}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          {onRenameChat && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(c.id);
                                setEditingTitle(c.title || '');
                              }}
                              aria-label="Rename chat"
                              title={t('renameChat')}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-dim)',
                                cursor: 'pointer',
                              }}
                            >
                              <Pencil size={13} strokeWidth={1.75} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(c.id);
                            }}
                            aria-label="Delete chat"
                            title={t('delete')}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-dim)',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} strokeWidth={1.75} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Settings button at bottom */}
        <button
          type="button"
          className="press"
          onClick={() => {
            onClose();
            onOpenAdmin();
          }}
          style={{
            height: '44px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            border: 'none',
            color: 'var(--text)',
            fontSize: 'var(--fs-base)',
            fontWeight: 'var(--fw-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {t('settings')}
        </button>
      </aside>
    </>
  );
};
