import React, { useState, useEffect } from 'react';

interface ReasoningBlockProps {
  reasoning?: string | null;
  isStreaming?: boolean;
  ocrDurationSec?: number;
  thinkingDurationSec?: number;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoning,
  isStreaming,
  ocrDurationSec,
  thinkingDurationSec,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(1);

  // Live timer while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.max(1, Math.floor((Date.now() - start) / 1000));
      setLiveElapsed(elapsed);
    }, 500);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!reasoning && !isStreaming) return null;

  // Determine actual display seconds
  let displaySeconds: number;
  if (isStreaming) {
    displaySeconds = liveElapsed;
  } else if (typeof thinkingDurationSec === 'number' && thinkingDurationSec > 0) {
    displaySeconds = thinkingDurationSec;
  } else if (liveElapsed > 1) {
    displaySeconds = liveElapsed;
  } else if (reasoning && reasoning.length > 0) {
    // Rough estimate based on length (~40 chars/sec) if no stored timestamp
    displaySeconds = Math.max(1, Math.round(reasoning.length / 45));
  } else {
    displaySeconds = 1;
  }

  const statusParts: string[] = [];
  if (ocrDurationSec) {
    statusParts.push(`OCR For ${ocrDurationSec}s`);
  }
  if (isStreaming) {
    statusParts.push(`Thinking... (${displaySeconds}s)`);
  } else {
    statusParts.push(`Thinking ${displaySeconds}s`);
  }

  const statusText = statusParts.join(' / ');

  return (
    <div style={{ marginBottom: '6px' }}>
      {!isExpanded ? (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="press"
          style={{
            fontSize: 'var(--fs-small)',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 0',
            cursor: 'pointer',
          }}
        >
          <span>{statusText}</span>
          <span>↓</span>
        </button>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--surface-think)',
            borderRadius: 'var(--r-m)',
            padding: 'var(--sp-3)',
            maxWidth: '85%',
          }}
        >
          <div
            onClick={() => setIsExpanded(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
              cursor: 'pointer',
              fontSize: 'var(--fs-small)',
              color: 'var(--text-muted)',
            }}
          >
            <span>{ocrDurationSec ? `OCR For ${ocrDurationSec}s / Thinking...` : 'Thinking...'}</span>
            <span>{displaySeconds}s ↑</span>
          </div>
          <div
            style={{
              fontSize: 'var(--fs-small)',
              color: 'var(--text-muted)',
              lineHeight: 'var(--lh-base)',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          >
            {reasoning || 'Thinking...'}
          </div>
        </div>
      )}
    </div>
  );
};
