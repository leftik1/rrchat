import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Settings as SettingsIcon,
  RotateCcw,
  Minimize2,
  Trash2,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Sliders,
} from 'lucide-react';
import type { ModelInfo, UsageSnapshot } from '../types';
import { api } from '../api/client';
import { ConfirmModal } from './ConfirmModal';
import { ModelSettingsSheet } from './ModelSettingsSheet';
import { t } from '../utils/i18n';

export interface UsageDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string | null;
  activeModel: ModelInfo | null;
  models: ModelInfo[];
  onRefreshModels: () => Promise<void>;
  onDeleteSession: () => void;
  onContextUpdated?: () => void;
  isGuest?: boolean;
  temperature?: number;
  onTemperatureChange?: (val: number) => void;
  topP?: number;
  onTopPChange?: (val: number) => void;
  minP?: number;
  onMinPChange?: (val: number) => void;
  chatSystemPrompt?: string;
  onChatSystemPromptChange?: (val: string) => void;
  autoCompact?: boolean;
  onAutoCompactChange?: (val: boolean) => void;
}

export const UsageDrawer: React.FC<UsageDrawerProps> = ({
  isOpen,
  onClose,
  chatId,
  activeModel,
  models,
  onRefreshModels,
  onDeleteSession,
  onContextUpdated,
  isGuest = false,
  temperature,
  onTemperatureChange,
  topP,
  onTopPChange,
  minP,
  onMinPChange,
  chatSystemPrompt,
  onChatSystemPromptChange,
  autoCompact,
  onAutoCompactChange,
}) => {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [selectedModelForSettings, setSelectedModelForSettings] = useState<ModelInfo | null>(null);
  const [isAuxExpanded, setIsAuxExpanded] = useState(false);

  // Modals state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmCompactOpen, setConfirmCompactOpen] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);

  // Swipe gesture handling
  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  // Subscribe to SSE while open, and fetch immediate snapshot
  useEffect(() => {
    if (!isOpen) return;

    // Immediate snapshot fetch so UI populates right away without waiting for SSE tick
    api.getUsageSnapshot(chatId, activeModel?.id).then((data) => {
      if (data) setSnapshot(data);
    }).catch(() => {});

    const unsubscribe = api.subscribeUsage(chatId, activeModel?.id, (data) => {
      setSnapshot(data);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, chatId, activeModel?.id]);

  // Handle popstate for Android back button
  useEffect(() => {
    if (!isOpen) return;
    const handlePopState = () => {
      onClose();
    };
    window.history.pushState({ usageDrawer: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Drag to dismiss gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = e.touches[0].clientX - touchStartX.current;
    const diffY = e.touches[0].clientY - touchStartY.current;

    // Only drag rightwards (positive X)
    if (diffX > 0 && Math.abs(diffX) > Math.abs(diffY)) {
      setDragX(diffX);
    }
  };

  const handleTouchEnd = () => {
    const elapsed = Math.max(Date.now() - touchStartTime.current, 1);
    const velocity = dragX / elapsed;
    const panelWidth = Math.min(window.innerWidth * 0.88, 360);

    if (dragX > panelWidth * 0.35 || velocity > 0.5) {
      onClose();
    }
    setDragX(0);
    setIsDragging(false);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Model actions
  const handleLoadModel = async (modelId: string) => {
    if (isGuest) {
      alert(t('fullModeOnly'));
      return;
    }
    setIsPerformingAction(true);
    try {
      await api.loadModel(modelId);
      await onRefreshModels();
    } catch (err: any) {
      alert(`Load failed: ${err.message}`);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleUnloadModel = async (modelId: string) => {
    if (isGuest) {
      alert(t('fullModeOnly'));
      return;
    }
    setIsPerformingAction(true);
    try {
      await api.unloadModel(modelId);
      await onRefreshModels();
    } catch (err: any) {
      alert(`Unload failed: ${err.message}`);
    } finally {
      setIsPerformingAction(false);
    }
  };

  // Context actions
  const handleClearContext = async () => {
    if (!chatId) return;
    setConfirmClearOpen(false);
    try {
      await api.clearChatContext(chatId);
      onContextUpdated?.();
    } catch (err: any) {
      alert(`Clear context failed: ${err.message}`);
    }
  };

  const handleCompactContext = async () => {
    if (!chatId) return;
    setConfirmCompactOpen(false);
    try {
      await api.compactChatContext(chatId);
      onContextUpdated?.();
    } catch (err: any) {
      alert(`Compact context failed: ${err.message}`);
    }
  };

  const handleUndoContext = async () => {
    if (!chatId) return;
    try {
      await api.undoChatContext(chatId);
      onContextUpdated?.();
    } catch (err: any) {
      alert(`Undo failed: ${err.message}`);
    }
  };

  const hardware = snapshot?.hardware;
  const mainModelData = snapshot?.model?.main;
  const auxModelData = snapshot?.model?.aux;
  const context = snapshot?.context;
  const session = snapshot?.session;

  // Resolve effective main model from snapshot or props
  const effectiveMainModel =
    (mainModelData && models.find((m) => m.id === mainModelData.id)) ||
    (activeModel && models.find((m) => m.id === activeModel.id)) ||
    activeModel ||
    models.find((m) => m.role !== 'aux') ||
    models[0] ||
    null;

  const isMainLoaded = mainModelData
    ? mainModelData.status === 'loaded'
    : !!(effectiveMainModel?.isLoaded || effectiveMainModel?.status === 'loaded');

  const mainStatus =
    mainModelData?.status ||
    effectiveMainModel?.status ||
    (isMainLoaded ? 'loaded' : 'unloaded');

  const mainParamsText =
    mainModelData?.parameters ||
    (effectiveMainModel?.parametersCount
      ? `${(effectiveMainModel.parametersCount / 1e9).toFixed(1).replace(/\.0$/, '')}B`
      : 'Unknown');

  const mainQuantText = mainModelData?.quantization || effectiveMainModel?.quantization || 'Q4_K_M';
  const mainContextVal = mainModelData?.context || effectiveMainModel?.contextTokens || 8192;
  const mainContextText = `${Math.round(mainContextVal / 1024)}K`;

  const totalLayers = mainModelData?.layers?.total || effectiveMainModel?.layersCount || 32;
  const offloadedLayers =
    mainModelData?.layers?.offloaded ??
    effectiveMainModel?.gpuLayers ??
    (isMainLoaded ? totalLayers : 0);

  const placementText =
    mainModelData?.placement ||
    effectiveMainModel?.placement ||
    (offloadedLayers >= totalLayers ? 'GPU' : offloadedLayers > 0 ? 'GPU + RAM' : 'RAM');

  const estVramMB =
    mainModelData?.estimatedVramMB ?? effectiveMainModel?.estimatedVramMB ?? 0;

  const kvCacheType = mainModelData?.kvCache?.type || effectiveMainModel?.kvCacheType || 'f16';
  const kvCacheMB = mainModelData?.kvCache?.sizeMB ?? 1024;

  const effectiveAuxModel =
    (auxModelData && models.find((m) => m.id === auxModelData.id)) ||
    models.find((m) => m.role === 'aux') ||
    null;

  const formatTokens = (tokens?: number) => {
    if (!tokens || tokens <= 0) return '0';
    if (tokens < 1024) return `${tokens}`;
    return `${(tokens / 1024).toFixed(1).replace(/\.0$/, '')}K`;
  };

  const panelWidth = 'min(88vw, 360px)';

  return (
    <>
      {/* Background scrim */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: isDragging ? 'none' : 'opacity 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={onClose}
      />

      {/* Slide-out Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Usage details"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          right: 0,
          width: panelWidth,
          background: 'var(--surface-3)',
          borderTopLeftRadius: 'var(--r-l)',
          borderBottomLeftRadius: 'var(--r-l)',
          boxShadow: 'none',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen
            ? `translateX(${dragX}px)`
            : 'translateX(100%)',
          transition: isDragging ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: '56px',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--surface-2)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: '15px',
              fontWeight: 'var(--fw-medium)',
              color: 'var(--text-primary)',
            }}
          >
            {t('usage')}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close usage drawer"
            style={{
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxSizing: 'border-box',
          }}
        >
          {/* SECTION 1: MODEL */}
          <div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                fontWeight: 'var(--fw-medium)',
                textAlign: 'left',
              }}
            >
              {t('model')}
            </div>

            {/* Main Model Card */}
            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 'var(--fw-medium)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {mainModelData?.name || effectiveMainModel?.name || 'No model'}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: 'var(--r-s)',
                      background: 'var(--surface-3)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Main
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: 'var(--r-s)',
                    background:
                      mainStatus === 'loaded'
                        ? 'var(--selected)'
                        : mainStatus === 'loading'
                        ? '#eab308'
                        : 'var(--surface-3)',
                    color: mainStatus === 'loaded' ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 'var(--fw-medium)',
                  }}
                >
                  {mainStatus}
                </div>
              </div>

              {/* Specs Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Parameters</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {mainParamsText} · {mainQuantText} · {mainContextText}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Placement</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {placementText} ({offloadedLayers}/{totalLayers})
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated VRAM</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {((estVramMB || 0) / 1024).toFixed(1)} GB
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Physical VRAM</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {((hardware?.gpu.memoryUsedMB || 0) / 1024).toFixed(1)} / {((hardware?.gpu.memoryTotalMB || 12288) / 1024).toFixed(1)} GB
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>KV Cache</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {kvCacheType} ({((kvCacheMB || 1024) / 1024).toFixed(1)} GB)
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {isMainLoaded ? (
                  <button
                    type="button"
                    onClick={() => handleUnloadModel(mainModelData?.id || effectiveMainModel?.id || '')}
                    disabled={isPerformingAction}
                    style={{
                      flex: 1,
                      height: '38px',
                      borderRadius: 'var(--r-m)',
                      border: '1px solid var(--danger)',
                      background: 'transparent',
                      color: 'var(--danger)',
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Square size={14} />
                    <span>{t('freeModelBtn')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLoadModel(mainModelData?.id || effectiveMainModel?.id || '')}
                    disabled={isPerformingAction || (!mainModelData?.id && !effectiveMainModel?.id)}
                    style={{
                      flex: 1,
                      height: '38px',
                      borderRadius: 'var(--r-m)',
                      border: 'none',
                      background: 'var(--selected)',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Play size={14} />
                    <span>{t('loadModelBtn')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const found = models.find((m) => m.id === (mainModelData?.id || effectiveMainModel?.id));
                    if (found) setSelectedModelForSettings(found);
                  }}
                  aria-label="Model settings"
                  style={{
                    width: '44px',
                    height: '38px',
                    borderRadius: 'var(--r-m)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <SettingsIcon size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Extra (Aux) Model Card */}
            {(auxModelData || effectiveAuxModel) && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  marginTop: '8px',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setIsAuxExpanded(!isAuxExpanded)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>
                      {auxModelData?.name || effectiveAuxModel?.name}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: 'var(--r-s)',
                        background: 'var(--surface-3)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Extra
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {auxModelData?.status || effectiveAuxModel?.status || (effectiveAuxModel?.isAuxLoaded ? 'loaded' : 'unloaded')}
                    </span>
                    {isAuxExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isAuxExpanded && (
                  <div style={{ padding: '0 14px 12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Placement</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {auxModelData?.placement || effectiveAuxModel?.placement || 'RAM'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Estimated VRAM</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {(((auxModelData?.estimatedVramMB ?? effectiveAuxModel?.estimatedVramMB) || 0) / 1024).toFixed(1)} GB
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION: GENERATION PARAMETERS */}
          {onTemperatureChange && (
            <div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  fontWeight: 'var(--fw-medium)',
                  textAlign: 'left',
                }}
              >
                {t('generationParams')}
              </div>

              <div
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Temperature slider & Presets */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '4px',
                    }}
                  >
                    <span>{t('temperature')}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                      {(temperature ?? 0.7).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={temperature ?? 0.7}
                    onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--selected)' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {[
                      { label: t('presetCode'), val: 0.2 },
                      { label: t('presetBalance'), val: 0.7 },
                      { label: t('presetCreative'), val: 1.1 },
                    ].map((p) => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => onTemperatureChange(p.val)}
                        style={{
                          flex: 1,
                          padding: '4px 0',
                          borderRadius: 'var(--r-s)',
                          fontSize: '11px',
                          background:
                            Math.abs((temperature ?? 0.7) - p.val) < 0.05
                              ? 'var(--selected)'
                              : 'var(--surface-3)',
                          color: Math.abs((temperature ?? 0.7) - p.val) < 0.05 ? '#ffffff' : 'var(--text-primary)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top-P slider */}
                {onTopPChange && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      <span>{t('topP')}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                        {(topP ?? 0.95).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={topP ?? 0.95}
                      onChange={(e) => onTopPChange(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--selected)' }}
                    />
                  </div>
                )}

                {/* Min-P slider */}
                {onMinPChange && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      <span>{t('minP')}</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                        {(minP ?? 0.05).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="0.5"
                      step="0.01"
                      value={minP ?? 0.05}
                      onChange={(e) => onMinPChange(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--selected)' }}
                    />
                  </div>
                )}

                {/* Auto Context Compaction Toggle */}
                {onAutoCompactChange && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                        {t('autoCompact')}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('autoCompactDesc')}
                      </div>
                    </div>
                    <div
                      className="toggle-switch"
                      data-checked={autoCompact}
                      onClick={() => onAutoCompactChange(!autoCompact)}
                    >
                      <div className="toggle-switch-thumb" />
                    </div>
                  </div>
                )}

                {/* System Prompt Textarea */}
                {onChatSystemPromptChange && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {t('systemPrompt')}
                    </div>
                    <textarea
                      value={chatSystemPrompt ?? ''}
                      onChange={(e) => onChatSystemPromptChange(e.target.value)}
                      placeholder={t('systemPromptPlaceholder')}
                      rows={2}
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--surface-3)',
                        borderRadius: 'var(--r-s)',
                        padding: '8px 10px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        resize: 'none',
                        border: '1px solid var(--hairline)',
                        boxSizing: 'border-box',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: CONTEXT */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'var(--fw-medium)' }}>
                {t('contextTitle')}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                {context
                  ? `${formatTokens(context.used)} / ${formatTokens(context.total)} (${context.usedPercent}%)`
                  : '0 / 8K (0%)'}
              </span>
            </div>

            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {[
                { key: 'prePrompt', label: 'Pre-Prompt', data: context?.breakdown.prePrompt },
                { key: 'skills', label: 'Skills', data: context?.breakdown.skills },
                { key: 'tools', label: 'Tools', data: context?.breakdown.tools },
                { key: 'history', label: 'History', data: context?.breakdown.history },
                { key: 'reasoning', label: 'Reasoning', data: context?.breakdown.reasoning },
                { key: 'attachments', label: 'Attachments', data: context?.breakdown.attachments },
                { key: 'other', label: 'Other', data: context?.breakdown.other },
                { key: 'free', label: 'Free', data: context?.breakdown.free },
              ].map((seg) => {
                const tokens = seg.data?.tokens ?? 0;
                const percent = seg.data?.percent ?? (seg.key === 'free' ? 100 : 0);

                return (
                  <div key={seg.key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {seg.label} {tokens > 0 && <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>({tokens.toLocaleString()} tok)</span>}
                      </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                        {percent}%
                      </span>
                    </div>

                    <div
                      style={{
                        height: '4px',
                        background: 'var(--surface-3)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, percent))}%`,
                          background:
                            seg.key === 'free'
                              ? 'var(--surface-3)'
                              : seg.key === 'reasoning'
                              ? '#a855f7'
                              : seg.key === 'history'
                              ? 'var(--selected)'
                              : '#3b82f6',
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Context Actions */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(true)}
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  {t('clearContext')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCompactOpen(true)}
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Minimize2 size={13} />
                  {t('compactContextBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleUndoContext}
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <RotateCcw size={13} />
                  {t('undoContextBtn')}
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: SESSION */}
          <div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '8px',
                fontWeight: 'var(--fw-medium)',
                textAlign: 'left',
              }}
            >
              {t('sessionTitle')}
            </div>

            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Messages</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {session ? `${session.totalMessages} (${session.userMessages} / ${session.assistantMessages})` : '0'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tokens</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {session?.totalTokens.toLocaleString() || '0'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Speed</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {session?.averageSpeed || 0} tok/s (last {session?.lastSpeed || 0})
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Reasoning Time</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {session?.reasoningTimeSec || 0}s
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mode</span>
                <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {session?.mode || 'Chat'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: PC */}
          {!isGuest && (
            <div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                  fontWeight: 'var(--fw-medium)',
                  textAlign: 'left',
                }}
              >
                {t('hardwareTitle')}
              </div>

              <div
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>GPU</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {hardware?.gpu.name || 'NVIDIA RTX 3060'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>VRAM</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {((hardware?.gpu.memoryUsedMB || 0) / 1024).toFixed(1)} / {((hardware?.gpu.memoryTotalMB || 12288) / 1024).toFixed(1)} GB · {hardware?.gpu.temperatureC || 45}°C
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>CPU</span>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', whiteSpace: 'nowrap' }}>
                    {hardware?.cpu.model || 'AMD Ryzen'} ({hardware?.cpu.usagePercent || 0}%)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>RAM</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {((hardware?.ram.usedMB || 0) / 1024).toFixed(1)} / {((hardware?.ram.totalMB || 32768) / 1024).toFixed(1)} GB ({hardware?.ram.percent || 0}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Delete Session Button */}
          <div style={{ marginTop: '8px', paddingBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: 'var(--r-m)',
                border: 'none',
                background: 'var(--danger)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 'var(--fw-medium)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Trash2 size={16} strokeWidth={1.75} />
              <span>{t('deleteSessionBtn')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        title={t('deleteSessionConfirmTitle')}
        message={t('deleteSessionConfirmDesc')}
        confirmLabel={t('delete')}
        isDanger={true}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          onDeleteSession();
          onClose();
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <ConfirmModal
        isOpen={confirmClearOpen}
        title={t('clearContextConfirmTitle')}
        message={t('clearContextConfirmDesc')}
        confirmLabel={t('clearContext')}
        isDanger={true}
        onConfirm={handleClearContext}
        onCancel={() => setConfirmClearOpen(false)}
      />

      <ConfirmModal
        isOpen={confirmCompactOpen}
        title={t('compactContextConfirmTitle')}
        message={t('compactContextConfirmDesc')}
        confirmLabel={t('compactContextBtn')}
        isDanger={false}
        onConfirm={handleCompactContext}
        onCancel={() => setConfirmCompactOpen(false)}
      />

      {/* Model Settings Sheet */}
      {selectedModelForSettings && (
        <ModelSettingsSheet
          isOpen={!!selectedModelForSettings}
          onClose={() => setSelectedModelForSettings(null)}
          model={selectedModelForSettings}
          onSave={async (id, s) => {
            await api.updateModelSettings(id, s);
            await onRefreshModels();
          }}
        />
      )}
    </>
  );
};
