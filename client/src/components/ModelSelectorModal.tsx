import React, { useState, useEffect, useRef } from 'react';
import type { ModelInfo, ModelProgressEvent } from '../types';
import { t } from '../utils/i18n';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelInfo[];
  activeModelId: string | null;
  activeAuxModelId?: string | null;
  progressEvent: ModelProgressEvent | null;
  onSelectModel: (id: string, opts?: { contextTokens?: number; gpuLayers?: number }) => void;
  onUnloadModel: (id: string) => void;
  onSelectAuxModel?: (id: string) => void;
  onLoadAuxModel?: (id: string, opts?: any) => void;
  onUnloadAuxModel?: () => void;
  onUpdateModelSettings?: (id: string, settings: any) => void;
  onRefresh: () => void;
}

const CONTEXT_OPTIONS = [
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
];

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  models,
  activeModelId,
  activeAuxModelId,
  progressEvent,
  onSelectModel,
  onSelectAuxModel,
}) => {
  const [activeTab, setActiveTab] = useState<'main' | 'extra'>('main');
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const mainModels = models.filter((m) => m.role !== 'aux');
  const extraModels = models.filter((m) => m.role === 'aux');

  const activeModel = models.find((m) => m.id === activeModelId);
  const currentContextVal = activeModel?.contextTokens || 8192;
  const currentContextLabel = `${Math.round(currentContextVal / 1024)}K`;

  const displayedModels = activeTab === 'main' ? mainModels : extraModels;

  const handleSelectModel = (modelId: string) => {
    if (activeTab === 'main') {
      const targetModel = models.find((m) => m.id === modelId);
      if (modelId !== activeModelId || !targetModel?.isLoaded) {
        onSelectModel(modelId, { contextTokens: currentContextVal });
      }
      onClose();
    } else {
      onSelectAuxModel?.(modelId);
      onClose();
    }
  };

  const handleContextChange = (value: number) => {
    if (activeModelId) {
      onSelectModel(activeModelId, { contextTokens: value });
    }
    setIsContextPickerOpen(false);
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

      {/* Model Dropdown anchored under header center matching Screen 04 */}
      <div
        ref={dropdownRef}
        className="model-dropdown"
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Select Model"
        style={{
          width: 'min(86vw, 320px)',
          backgroundColor: 'var(--surface-1)',
          borderRadius: 'var(--r-l)',
          padding: '14px 16px',
        }}
      >
        {/* Top row: Models on left, Context: 8K on right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 'var(--fw-medium)',
              color: 'var(--text)',
            }}
          >
            {t('modelsTab')}
          </span>
          <button
            type="button"
            className="press"
            onClick={() => setIsContextPickerOpen(!isContextPickerOpen)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '12px',
              color: isContextPickerOpen ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 'var(--r-s)',
            }}
          >
            {t('contextLabel')}: {currentContextLabel}
          </button>
        </div>

        {/* Expandable context selector row */}
        {isContextPickerOpen && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '6px',
              backgroundColor: 'var(--surface-3)',
              borderRadius: 'var(--r-m)',
              overflowX: 'auto',
              marginBottom: '6px',
            }}
          >
            {CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="press"
                onClick={() => handleContextChange(opt.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: 'var(--r-s)',
                  backgroundColor: currentContextVal === opt.value ? 'var(--selected)' : 'transparent',
                  color: currentContextVal === opt.value ? 'var(--text)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: currentContextVal === opt.value ? 'var(--fw-medium)' : 'normal',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Model items list with unified loaded status indicator */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {displayedModels.length === 0 ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--text-dim)',
              }}
            >
              {t('noModelsAvailable')}
            </div>
          ) : (
            displayedModels.map((model) => {
              const isSelected =
                activeTab === 'main'
                  ? model.id === activeModelId
                  : model.id === activeAuxModelId;

              const isModelLoaded =
                activeTab === 'main'
                  ? model.status === 'loaded' || (model.isLoaded && !model.isAuxLoaded)
                  : !!model.isAuxLoaded || (model.status === 'loaded' && model.role === 'aux');

              const isLoadingThis =
                (progressEvent &&
                  progressEvent.modelId === model.id &&
                  progressEvent.status === 'loading') ||
                model.status === 'loading';

              return (
                <button
                  key={model.id}
                  type="button"
                  className="press"
                  onClick={() => handleSelectModel(model.id)}
                  style={{
                    minHeight: '44px',
                    width: '100%',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    background: isSelected ? 'var(--selected)' : 'transparent',
                    borderRadius: 'var(--r-m)',
                    border: 'none',
                    color: isSelected ? 'var(--text)' : 'var(--text)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    {/* Status Dot + Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: 'var(--r-pill)',
                          backgroundColor: isLoadingThis
                            ? 'var(--focus)'
                            : isModelLoaded
                            ? '#52c41a'
                            : 'var(--text-dim)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: isSelected ? 'var(--fw-medium)' : 'normal',
                          color: isSelected ? 'var(--text)' : 'var(--text)',
                        }}
                      >
                        {model.name}
                      </span>
                    </div>

                    {/* Loaded / Loading Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      {activeTab === 'extra' && model.role && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          {model.role}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '11px',
                          color: isModelLoaded ? 'var(--text-muted)' : 'var(--text-dim)',
                        }}
                      >
                        {isLoadingThis ? t('loadingBadge') : isModelLoaded ? t('loadedBadge') : ''}
                      </span>
                    </div>
                  </div>

                  {/* Loading progress bar */}
                  {isLoadingThis && (
                    <div
                      style={{
                        width: '100%',
                        height: '2px',
                        background: 'var(--surface-3)',
                        borderRadius: 'var(--r-pill)',
                        marginTop: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${progressEvent?.progress || 30}%`,
                          height: '100%',
                          background: 'var(--text-2)',
                          transition: 'width 200ms ease',
                        }}
                      />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Bottom row: Main / Extra full-width segmented tab */}
        <div
          className="segmented"
          style={
            {
              marginTop: '4px',
              '--n': 2,
              '--i': activeTab === 'main' ? 0 : 1,
            } as React.CSSProperties
          }
        >
          <button
            type="button"
            data-active={activeTab === 'main'}
            onClick={() => setActiveTab('main')}
          >
            {t('mainTab')}
          </button>
          <button
            type="button"
            data-active={activeTab === 'extra'}
            onClick={() => setActiveTab('extra')}
          >
            {t('extraTab')}
          </button>
        </div>
      </div>
    </>
  );
};
