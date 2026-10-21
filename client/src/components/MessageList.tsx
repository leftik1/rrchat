import React, { useEffect, useRef, useState } from 'react';
import type { Message } from '../types';
import { MessageItem } from './MessageItem';
import type { PreviewTarget } from './PreviewModal';
import { ArrowDown } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  activeModelName: string;
  isStreaming?: boolean;
  onEditMessage?: (id: string, newContent: string) => void;
  onRegenerate?: (id: string) => void;
  onDeleteMessage?: (id: string) => void;
  onApproveTool?: (approvalId: string, approved: boolean, rememberForChat?: boolean) => void;
  onPreviewTarget?: (target: PreviewTarget) => void;
  onOpenUsage?: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  onEditMessage,
  onRegenerate,
  onDeleteMessage,
  onApproveTool,
  onPreviewTarget,
  onOpenUsage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isNear = distanceToBottom < 80;
    isNearBottomRef.current = isNear;
    setShowScrollBottom(!isNear && messages.length > 0);
  };

  const scrollToBottom = (smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: 'var(--sp-2) var(--sp-4)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {messages.length === 0 ? (
        <div
          className="empty-logo"
          style={{
            position: 'absolute',
            inset: 0,
            bottom: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            pointerEvents: 'none',
            opacity: 0.35,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span
              style={{
                fontFamily: 'var(--font)',
                fontSize: '84px',
                fontWeight: 'var(--fw-regular)',
                color: 'var(--text)',
                lineHeight: 1,
                letterSpacing: '-0.03em',
              }}
            >
              rr
            </span>
            <span
              style={{
                fontFamily: 'var(--font)',
                fontSize: '22px',
                fontWeight: 'var(--fw-regular)',
                color: 'var(--text-muted)',
                lineHeight: 1,
                marginLeft: '8px',
              }}
            >
              chat
            </span>
          </div>
        </div>
      ) : (
        messages.map((msg, idx) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
            onEditMessage={onEditMessage}
            onRegenerate={onRegenerate}
            onDeleteMessage={onDeleteMessage}
            onApproveTool={onApproveTool}
            onPreviewTarget={onPreviewTarget}
            onOpenUsage={onOpenUsage}
          />
        ))
      )}

      {/* Floating scroll to bottom button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to bottom"
          className="press"
          style={{
            position: 'absolute',
            bottom: 'var(--sp-3)',
            right: 'var(--sp-4)',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--surface-1)',
            zIndex: 20,
          }}
        >
          <ArrowDown size={18} strokeWidth={1.75} color="var(--icon)" />
        </button>
      )}
    </div>
  );
};
