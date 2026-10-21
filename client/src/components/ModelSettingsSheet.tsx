import React, { useState, useEffect } from 'react';
import { X, Cpu, HardDrive } from 'lucide-react';
import type { ModelInfo } from '../types';
import { api } from '../api/client';
import { t } from '../utils/i18n';

export interface ModelSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  model: ModelInfo | null;
  onSave: (id: string, settings: any) => Promise<void>;
}

export const ModelSettingsSheet: React.FC<ModelSettingsSheetProps> = ({
  isOpen,
  onClose,
  model,
  onSave,
}) => {
  const [gpuLayers, setGpuLayers] = useState<number>(model?.gpuLayers ?? 99);
  const [contextTokens, setContextTokens] = useState<number>(model?.contextTokens ?? 8192);
  const [kvCacheType, setKvCacheType] = useState<string>(model?.kvCacheType ?? 'f16');
  const [cpuMoe, setCpuMoe] = useState<number>(model?.cpuMoe ?? (model?.isMoE ? 24 : 0));
  const [projectorPath, setProjectorPath] = useState<string>(model?.projectorPath || 'auto');
  const [availableProjectors, setAvailableProjectors] = useState<Array<{ name: string; fullPath: string; size: number }>>([]);
  const [estimatedVramMB, setEstimatedVramMB] = useState<number>(model?.estimatedVramMB ?? 0);
  const [placement, setPlacement] = useState<'GPU' | 'GPU + RAM' | 'RAM'>(model?.placement ?? 'GPU');
  const [isSaving, setIsSaving] = useState(false);

  const totalLayers = model?.layersCount && model.layersCount > 0 ? model.layersCount : 32;

  useEffect(() => {
    if (model) {
      const gl = model.gpuLayers !== undefined ? model.gpuLayers : 99;
      setGpuLayers(gl);
      setContextTokens(model.contextTokens || 8192);
      setKvCacheType(model.kvCacheType || 'f16');
      setCpuMoe(model.cpuMoe !== undefined ? model.cpuMoe : (model.isMoE ? 24 : 0));
      setProjectorPath(model.projectorPath || 'auto');
      setEstimatedVramMB(model.estimatedVramMB || 0);
      setPlacement(model.placement || (gl === 0 ? 'RAM' : gl >= totalLayers ? 'GPU' : 'GPU + RAM'));
    }
  }, [model, totalLayers]);

  useEffect(() => {
    if (!isOpen) return;
    api.getModels().then((data) => {
      if (data.availableProjectors) {
        setAvailableProjectors(data.availableProjectors);
      }
    }).catch(() => {});
  }, [isOpen]);

  // Live estimate update when settings change
  useEffect(() => {
    if (!model || !isOpen) return;

    let isMounted = true;
    api.estimateModel(model.id, { gpuLayers, contextTokens, kvCacheType })
      .then((res) => {
        if (isMounted) {
          setEstimatedVramMB(res.estimatedVramMB);
          setPlacement(res.placement);
        }
      })
      .catch(() => {
        // Fallback local estimation
        const fraction = Math.min(1, Math.max(0, gpuLayers / totalLayers));
        const p = gpuLayers <= 0 ? 'RAM' : gpuLayers >= totalLayers ? 'GPU' : 'GPU + RAM';
        setPlacement(p);
        if (p === 'RAM') {
          setEstimatedVramMB(0);
        } else {
          const modelMB = model.sizeBytes / (1024 * 1024);
          let b = 2;
          if (kvCacheType === 'q8_0') b = 1.06;
          if (kvCacheType === 'q4_0') b = 0.56;
          const kvMB = (contextTokens * 2 * totalLayers * 8 * 128 * b) / (1024 * 1024);
          setEstimatedVramMB(Math.round(modelMB * fraction + kvMB + 768));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [model, gpuLayers, contextTokens, kvCacheType, totalLayers, isOpen]);

  if (!isOpen || !model) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(model.id, {
        gpuLayers,
        contextTokens,
        kvCacheType,
        cpuMoe,
        projectorPath: projectorPath === 'auto' ? undefined : projectorPath,
      });
      onClose();
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const estimatedGB = (estimatedVramMB / 1024).toFixed(1);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 'min(100vw, 480px)',
          background: 'var(--surface-2)',
          borderTopLeftRadius: 'var(--r-l)',
          borderTopRightRadius: 'var(--r-l)',
          padding: '20px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>
              {t('modelSettingsTitle')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {model.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '44px',
              height: '44px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Live Estimation summary card */}
        <div
          style={{
            background: 'var(--surface-3)',
            borderRadius: 'var(--r-m)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('estimatedVram')}</div>
            <div style={{ fontSize: '16px', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)', marginTop: '2px' }}>
              {placement === 'RAM' ? `0 GB (${t('ramMode')})` : `${estimatedGB} GB`}
            </div>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--r-s)',
              background: placement === 'GPU' ? 'var(--selected)' : 'var(--surface-2)',
              color: placement === 'GPU' ? '#ffffff' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 'var(--fw-medium)',
            }}
          >
            {placement}
          </div>
        </div>

        {/* GPU Layers / Placement */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <span>{t('gpuOffloadLayers')}</span>
            <span>{gpuLayers >= totalLayers ? `All (${totalLayers})` : `${gpuLayers} / ${totalLayers}`}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <button
              type="button"
              onClick={() => setGpuLayers(0)}
              style={{
                flex: 1,
                height: '36px',
                borderRadius: 'var(--r-s)',
                border: 'none',
                background: gpuLayers === 0 ? 'var(--selected)' : 'var(--surface-3)',
                color: gpuLayers === 0 ? '#ffffff' : 'var(--text-primary)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              RAM (0)
            </button>
            <button
              type="button"
              onClick={() => setGpuLayers(Math.floor(totalLayers / 2))}
              style={{
                flex: 1,
                height: '36px',
                borderRadius: 'var(--r-s)',
                border: 'none',
                background: gpuLayers > 0 && gpuLayers < totalLayers ? 'var(--selected)' : 'var(--surface-3)',
                color: gpuLayers > 0 && gpuLayers < totalLayers ? '#ffffff' : 'var(--text-primary)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Split ({Math.floor(totalLayers / 2)})
            </button>
            <button
              type="button"
              onClick={() => setGpuLayers(99)}
              style={{
                flex: 1,
                height: '36px',
                borderRadius: 'var(--r-s)',
                border: 'none',
                background: gpuLayers >= totalLayers ? 'var(--selected)' : 'var(--surface-3)',
                color: gpuLayers >= totalLayers ? '#ffffff' : 'var(--text-primary)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Full GPU
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={totalLayers}
            value={Math.min(gpuLayers, totalLayers)}
            onChange={(e) => setGpuLayers(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: 'var(--selected)', cursor: 'pointer' }}
          />
        </div>

        {/* MoE CPU Offload (for MoE models like Qwen 35B A3B, Mixtral, etc.) */}
        {model.isMoE && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>MoE CPU Offload (--n-cpu-moe)</span>
              <span style={{ fontWeight: 'var(--fw-medium)', color: cpuMoe > 0 ? '#30d158' : 'var(--text-muted)' }}>
                {cpuMoe > 0 ? `${cpuMoe} layers on CPU` : 'Off (all on GPU)'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Keeps MoE expert weights for first N layers in CPU RAM while running attention on GPU. Dramatically accelerates Qwen 35B A3B on 12GB GPUs.
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {[
                { val: 0, label: '0 (Off)' },
                { val: 16, label: '16' },
                { val: 24, label: '24' },
                { val: 28, label: '28 (Rec)' },
                { val: 32, label: '32' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setCpuMoe(item.val)}
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    background: cpuMoe === item.val ? 'var(--selected)' : 'var(--surface-3)',
                    color: cpuMoe === item.val ? '#ffffff' : 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              type="range"
              min={0}
              max={totalLayers}
              value={Math.min(cpuMoe, totalLayers)}
              onChange={(e) => setCpuMoe(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--selected)', cursor: 'pointer' }}
            />
          </div>
        )}

        {/* Vision Projector mmproj */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span>{t('visionProjectorLabel')}</span>
            <span style={{ fontWeight: 'var(--fw-medium)', color: projectorPath !== 'none' && (projectorPath !== 'auto' || model.hasVision) ? '#30d158' : 'var(--text-muted)' }}>
              {projectorPath === 'none' ? t('disabled') : model.hasVision || projectorPath !== 'auto' ? t('enabled') : t('noneProjector')}
            </span>
          </div>
          <select
            value={projectorPath}
            onChange={(e) => setProjectorPath(e.target.value)}
            style={{
              width: '100%',
              height: '38px',
              borderRadius: 'var(--r-s)',
              border: '1px solid var(--surface-3)',
              background: 'var(--surface-3)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              padding: '0 8px',
              cursor: 'pointer',
            }}
          >
            <option value="auto">{t('autoProjector')}</option>
            <option value="none">{t('noneProjector')}</option>
            {availableProjectors.map((p) => (
              <option key={p.fullPath} value={p.fullPath}>
                {p.name} ({Math.round(p.size / (1024 * 1024))} MB)
              </option>
            ))}
          </select>
        </div>

        {/* Context Window tokens */}
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {t('contextTokensLabel')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[4096, 8192, 16384, 32768].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setContextTokens(t)}
                style={{
                  flex: 1,
                  height: '38px',
                  borderRadius: 'var(--r-s)',
                  border: 'none',
                  background: contextTokens === t ? 'var(--selected)' : 'var(--surface-3)',
                  color: contextTokens === t ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 'var(--fw-medium)',
                  cursor: 'pointer',
                }}
              >
                {t >= 1024 ? `${t / 1024}K` : t}
              </button>
            ))}
          </div>
        </div>

        {/* KV Cache Quantization */}
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {t('kvCacheTypeLabel')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'f16', label: 'f16 (FP16 standard)' },
              { id: 'q8_0', label: 'q8_0 (-45% VRAM)' },
              { id: 'q4_0', label: 'q4_0 (-70% VRAM)' },
            ].map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKvCacheType(k.id)}
                style={{
                  flex: 1,
                  height: '38px',
                  borderRadius: 'var(--r-s)',
                  border: 'none',
                  background: kvCacheType === k.id ? 'var(--selected)' : 'var(--surface-3)',
                  color: kvCacheType === k.id ? '#ffffff' : 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 'var(--fw-medium)',
                  cursor: 'pointer',
                }}
              >
                {k.id}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--r-m)',
              border: 'none',
              background: 'var(--surface-3)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 'var(--fw-medium)',
              cursor: 'pointer',
            }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--r-m)',
              border: 'none',
              background: 'var(--selected)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 'var(--fw-medium)',
              cursor: 'pointer',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? t('loading') : t('saveSettingsBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
