import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, Folder, FileText, Download, Eye, RefreshCw, ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import type { PreviewTarget } from './PreviewModal';
import { t } from '../utils/i18n';

interface DirectorySceneProps {
  isOpen: boolean;
  onClose: () => void;
  onPreviewTarget?: (target: PreviewTarget) => void;
  workQuotaGB?: number;
}

export const DirectoryScene: React.FC<DirectorySceneProps> = ({
  isOpen,
  onClose,
  onPreviewTarget,
  workQuotaGB = 5,
}) => {
  const [workFiles, setWorkFiles] = useState<{ name: string; isDirectory: boolean; size: number }[]>([]);
  const [currentWorkPath, setCurrentWorkPath] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);

  const loadWorkFiles = async (dirPath = '') => {
    setLoadingFiles(true);
    try {
      const data = await api.getWorkFiles(dirPath);
      setWorkFiles(data.items || []);
      setCurrentWorkPath(data.current || '');
    } catch {
      setWorkFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWorkFiles('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNavigateWorkDir = (dirName: string) => {
    const nextPath = currentWorkPath && currentWorkPath !== '.' ? `${currentWorkPath}/${dirName}` : dirName;
    loadWorkFiles(nextPath);
  };

  const handleWorkDirBack = () => {
    if (!currentWorkPath || currentWorkPath === '.') return;
    const parts = currentWorkPath.split('/');
    parts.pop();
    loadWorkFiles(parts.join('/'));
  };

  const handleDownload = (filename: string) => {
    const fullPath = currentWorkPath && currentWorkPath !== '.' ? `${currentWorkPath}/${filename}` : filename;
    window.open(`/api/work/files/download?path=${encodeURIComponent(fullPath)}`, '_blank');
  };

  // Calculate total folder size
  const totalSizeBytes = workFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  const usedGB = Number((totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const safeQuota = Math.max(workQuotaGB, 1);
  const quotaPercent = Math.min(100, Math.round((usedGB / safeQuota) * 100));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Directory"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--surface-3)',
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--sp-4)',
        paddingTop: 'calc(var(--sp-4) + env(safe-area-inset-top))',
        paddingBottom: 'calc(var(--sp-4) + env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: '12px',
        }}
      >
        {/* Header matching Settings scene */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '32px',
          }}
        >
          <button
            type="button"
            className="press"
            onClick={onClose}
            aria-label="Back"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '14px',
              fontWeight: 'var(--fw-medium)',
              padding: '4px 0',
            }}
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
            <span>{t('directory')}</span>
          </button>

          <button
            type="button"
            className="press"
            onClick={onClose}
            aria-label="Close directory"
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

        {/* Path Breadcrumbs Bar */}
        <div
          style={{
            height: '44px',
            backgroundColor: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            {currentWorkPath && currentWorkPath !== '.' && (
              <button
                type="button"
                onClick={handleWorkDirBack}
                className="press"
                style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '2px' }}
                title="Back"
              >
                <ArrowLeft size={16} strokeWidth={1.75} />
              </button>
            )}
            <span
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              /{currentWorkPath || ''}
            </span>
          </div>
          <button
            type="button"
            className="press"
            onClick={() => loadWorkFiles(currentWorkPath)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            title="Refresh"
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Quota Bar */}
        <div
          style={{
            backgroundColor: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>{t('storageQuota')}</span>
            <span>
              {usedGB} / {safeQuota} GB ({quotaPercent}%)
            </span>
          </div>
          <div className="meter-bar">
            <div
              className="meter-fill"
              style={{ width: `${Math.max(quotaPercent, 2)}%` }}
              data-alert={quotaPercent >= 90 ? 'danger' : quotaPercent >= 75 ? 'focus' : undefined}
            />
          </div>
        </div>

        {/* Files List Container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            overflowY: 'auto',
          }}
        >
          {loadingFiles ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '32px 0' }}>
              {t('loadingFiles')}
            </div>
          ) : workFiles.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px', padding: '32px 0' }}>
              {t('directoryEmpty')}
            </div>
          ) : (
            workFiles.map((file) => {
              const full = currentWorkPath && currentWorkPath !== '.' ? `${currentWorkPath}/${file.name}` : file.name;
              return (
                <div
                  key={file.name}
                  className="press"
                  style={{
                    minHeight: '48px',
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 14px',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (file.isDirectory) {
                      handleNavigateWorkDir(file.name);
                    } else {
                      onPreviewTarget?.({
                        type: 'work_file',
                        title: file.name,
                        path: full,
                      });
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    {file.isDirectory ? (
                      <Folder size={18} strokeWidth={1.75} color="var(--text)" style={{ flexShrink: 0 }} />
                    ) : (
                      <FileText size={18} strokeWidth={1.75} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text)',
                        fontSize: '13px',
                      }}
                    >
                      {file.name}{file.isDirectory ? '/' : ''}
                    </span>
                  </div>

                  {!file.isDirectory && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {file.size > 1024 * 1024
                          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          : file.size > 1024
                          ? `${(file.size / 1024).toFixed(1)} KB`
                          : `${file.size} B`}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewTarget?.({ type: 'work_file', title: file.name, path: full });
                        }}
                        aria-label="Preview"
                        className="press"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '6px',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        <Eye size={16} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file.name);
                        }}
                        aria-label="Download"
                        className="press"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '6px',
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        <Download size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
