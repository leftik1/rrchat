import React, { useRef, useState } from 'react';
import { X, Globe } from 'lucide-react';
import type { ModelInfo } from '../types';
import { t } from '../utils/i18n';

interface PlusMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeModel?: ModelInfo;
  onFileSelect: (file: File) => void;
  mode: 'chat' | 'work';
  onModeChange: (mode: 'chat' | 'work') => void;
  enableReasoning: boolean;
  onToggleReasoning: (val: boolean) => void;
  reasoningEffort: 'low' | 'medium' | 'high';
  onReasoningEffortChange: (effort: 'low' | 'medium' | 'high') => void;
  contextUsedTokens: number;
  maxContextTokens: number;
  workModeEnabled: boolean;
  visionMode?: 'ocr' | 'vision';
  onVisionModeChange?: (mode: 'ocr' | 'vision') => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: (val: boolean) => void;
  onOpenUsage?: () => void;
}

export const PlusMenuSheet: React.FC<PlusMenuSheetProps> = ({
  isOpen,
  onClose,
  activeModel,
  onFileSelect,
  mode,
  onModeChange,
  enableReasoning,
  onToggleReasoning,
  reasoningEffort,
  onReasoningEffortChange,
  contextUsedTokens,
  maxContextTokens,
  workModeEnabled,
  visionMode: propVisionMode,
  onVisionModeChange,
  webSearchEnabled = false,
  onToggleWebSearch,
  onOpenUsage,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localVisionMode, setLocalVisionMode] = useState<'ocr' | 'vision'>('ocr');
  const currentVisionMode = propVisionMode ?? localVisionMode;

  const handleVisionChange = (val: 'ocr' | 'vision') => {
    setLocalVisionMode(val);
    onVisionModeChange?.(val);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
      e.target.value = '';
      onClose();
    }
  };

  const [dragY, setDragY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = e.touches[0].clientX - touchStartX.current;
    const diffY = e.touches[0].clientY - touchStartY.current;

    // Only drag downwards (positive Y)
    if (diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
      setDragY(diffY);
    }
  };

  const handleTouchEnd = () => {
    dragY > 50 && onClose();
    setDragY(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  return (
    <>
      {/* Background scrim */}
      <div
        className="sheet-scrim"
        data-open={isOpen}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Bottom sheet */}
      <div
        className="sheet"
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Actions and parameters"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          maxWidth: '480px',
          margin: '0 auto',
          transform: isOpen && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform var(--dur-panel) var(--ease-out)',
        }}
      >
        {/* Grab Handle for swipe down */}
        <div
          style={{
            width: '36px',
            height: '4px',
            borderRadius: 'var(--r-pill)',
            backgroundColor: 'var(--surface-round)',
            margin: '-4px auto 12px auto',
          }}
        />
        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        <input
          type="file"
          ref={galleryInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {/* Header: rrchat and X close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '24px',
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
            onClick={onClose}
            aria-label="Close"
            className="press"
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
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* 3 Tiles: Camera, Gallery, File */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <button
            type="button"
            className="press"
            onClick={() => cameraInputRef.current?.click()}
            style={{
              height: '64px',
              background: 'var(--surface-3)',
              borderRadius: 'var(--r-m)',
              border: 'none',
              color: 'var(--text)',
              fontSize: 'var(--fs-base)',
              fontWeight: 'var(--fw-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {t('camera')}
          </button>
          <button
            type="button"
            className="press"
            onClick={() => galleryInputRef.current?.click()}
            style={{
              height: '64px',
              background: 'var(--surface-3)',
              borderRadius: 'var(--r-m)',
              border: 'none',
              color: 'var(--text)',
              fontSize: 'var(--fs-base)',
              fontWeight: 'var(--fw-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {t('gallery')}
          </button>
          <button
            type="button"
            className="press"
            onClick={() => fileInputRef.current?.click()}
            style={{
              height: '64px',
              background: 'var(--surface-3)',
              borderRadius: 'var(--r-m)',
              border: 'none',
              color: 'var(--text)',
              fontSize: 'var(--fs-base)',
              fontWeight: 'var(--fw-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {t('file')}
          </button>
        </div>

        {/* Reasoning row with toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: '28px',
          }}
        >
          <span
            style={{
              fontSize: 'var(--fs-base)',
              fontWeight: 'var(--fw-medium)',
              color: 'var(--text)',
            }}
          >
            {t('reasoning')}
          </span>
          <div
            role="switch"
            aria-checked={enableReasoning}
            tabIndex={0}
            className="toggle-switch"
            data-checked={enableReasoning}
            onClick={() => onToggleReasoning(!enableReasoning)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onToggleReasoning(!enableReasoning);
              }
            }}
          >
            <div className="toggle-switch-thumb" />
          </div>
        </div>

        {/* Effort level: Low / Medium / High */}
        <div>
          <div
            style={{
              fontSize: 'var(--fs-small)',
              color: 'var(--text-muted)',
              marginBottom: '6px',
            }}
          >
            {t('effortLevel')}
          </div>
          <div
            className="segmented"
            style={
              {
                '--n': 3,
                '--i':
                  reasoningEffort === 'low'
                    ? 0
                    : reasoningEffort === 'medium'
                    ? 1
                    : 2,
              } as React.CSSProperties
            }
          >
            <button
              type="button"
              data-active={reasoningEffort === 'low'}
              onClick={() => onReasoningEffortChange('low')}
            >
              {t('low')}
            </button>
            <button
              type="button"
              data-active={reasoningEffort === 'medium'}
              onClick={() => onReasoningEffortChange('medium')}
            >
              {t('medium')}
            </button>
            <button
              type="button"
              data-active={reasoningEffort === 'high'}
              onClick={() => onReasoningEffortChange('high')}
            >
              {t('high')}
            </button>
          </div>
        </div>

        {/* Bottom row: Vision / OCR & Web Search */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '4px' }}>
          <div>
            <div
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--text-muted)',
                marginBottom: '6px',
                textAlign: 'center',
              }}
            >
              {t('visionOcr')}
            </div>
            <div
              className="segmented"
              style={
                {
                  height: '38px',
                  '--n': 2,
                  '--i': currentVisionMode === 'ocr' ? 0 : 1,
                } as React.CSSProperties
              }
            >
              <button
                type="button"
                data-active={currentVisionMode === 'ocr'}
                onClick={() => handleVisionChange('ocr')}
                style={{ fontSize: '13px' }}
              >
                OCR
              </button>
              <button
                type="button"
                data-active={currentVisionMode === 'vision'}
                disabled={activeModel ? !activeModel.hasVision : false}
                onClick={() => handleVisionChange('vision')}
                style={{
                  fontSize: '13px',
                  opacity: activeModel && !activeModel.hasVision ? 0.4 : 1,
                }}
                title={activeModel && !activeModel.hasVision ? 'Active model does not support Vision' : undefined}
              >
                Vision
              </button>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 'var(--fs-small)',
                color: 'var(--text-muted)',
                marginBottom: '6px',
                textAlign: 'center',
              }}
            >
              {t('webSearch')}
            </div>
            <div
              className="segmented"
              style={
                {
                  height: '38px',
                  '--n': 2,
                  '--i': webSearchEnabled ? 1 : 0,
                } as React.CSSProperties
              }
            >
              <button
                type="button"
                data-active={!webSearchEnabled}
                onClick={() => onToggleWebSearch?.(false)}
                style={{ fontSize: '13px' }}
              >
                {t('disabled')}
              </button>
              <button
                type="button"
                data-active={webSearchEnabled}
                onClick={() => onToggleWebSearch?.(true)}
                style={{
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <Globe size={13} strokeWidth={1.75} />
                <span>{t('enabled')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
