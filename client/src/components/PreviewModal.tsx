import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Copy,
  Check,
  Code,
  Eye,
  FileText,
  FileCode,
  Image as ImageIcon,
  Smartphone,
  Monitor,
  Sun,
  Moon,
  WrapText,
} from 'lucide-react';
import { api } from '../api/client';
import type { Attachment } from '../types';
import { MarkdownContent } from './MarkdownContent';
import { t } from '../utils/i18n';

export interface PreviewTarget {
  type: 'work_file' | 'attachment' | 'image_url';
  title: string;
  path?: string; // relative path in workspace
  attachment?: Attachment;
  imageUrl?: string;
}

interface PreviewModalProps {
  target: PreviewTarget | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ target, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview options
  const [canvasTheme, setCanvasTheme] = useState<'light' | 'dark'>('light');
  const [viewportMode, setViewportMode] = useState<'full' | 'mobile'>('full');
  const [wrapLines, setWrapLines] = useState(true);

  const title = target?.title || '';
  const ext = title.includes('.') ? title.split('.').pop()?.toLowerCase() || '' : '';
  const isHtml = ext === 'html' || ext === 'htm';
  const isMarkdown = ext === 'md' || ext === 'markdown';
  const isImage =
    target?.type === 'image_url' ||
    target?.attachment?.isImage ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  const isPdf = ext === 'pdf' || target?.attachment?.mimeType === 'application/pdf';

  // Handle Escape key
  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose]);

  // Load content when target changes
  useEffect(() => {
    if (!target) {
      setFileContent('');
      setError(null);
      return;
    }

    if (isHtml || isMarkdown) {
      setActiveTab('preview');
    } else {
      setActiveTab('code');
    }

    if (target.type === 'work_file' && target.path && !isImage && !isPdf) {
      setLoading(true);
      setError(null);
      let cleanPath = target.path.replace(/\\/g, '/');
      if (cleanPath.startsWith('./')) cleanPath = cleanPath.slice(2);
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

      api
        .getWorkFileContent(cleanPath)
        .then((res) => {
          setFileContent(res.content);
        })
        .catch((err) => {
          setError(err.message || t('failedLoadContent'));
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (target.type === 'attachment') {
      if (target.attachment?.textContent) {
        setFileContent(target.attachment.textContent);
      } else if (target.attachment?.id && !isImage && !isPdf) {
        setLoading(true);
        fetch(`/api/uploads/${target.attachment.id}`)
          .then((r) => r.text())
          .then((txt) => setFileContent(txt))
          .catch(() => setError(t('failedLoadContent')))
          .finally(() => setLoading(false));
      }
    }
  }, [target, isHtml, isMarkdown, isImage, isPdf]);

  const preparedHtml = useMemo(() => {
    if (!isHtml || !fileContent) return '';
    let processed = fileContent;

    // 1. Ensure viewport meta tag exists so smartphones do not render microscopic layout
    if (!/<meta[^>]+name=["']viewport["']/i.test(processed)) {
      const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      if (/<head[^>]*>/i.test(processed)) {
        processed = processed.replace(/<head[^>]*>/i, `$&${viewportMeta}`);
      } else {
        processed = `${viewportMeta}${processed}`;
      }
    }

    // 2. Baseline canvas styling if HTML does not specify its own background
    const bgRule =
      canvasTheme === 'dark'
        ? '<style id="__rrchat_theme">html, body { background-color: #0f1317 !important; color: #f0f0f0 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }</style>'
        : '<style id="__rrchat_theme">html, body { background-color: #ffffff !important; color: #111111 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }</style>';

    if (!/<style[^>]*>[\s\S]*background/i.test(processed) && !/style=["'][^"']*background/i.test(processed)) {
      if (/<head[^>]*>/i.test(processed)) {
        processed = processed.replace(/<head[^>]*>/i, `$&${bgRule}`);
      } else {
        processed = `${bgRule}${processed}`;
      }
    }

    return processed;
  }, [fileContent, isHtml, canvasTheme]);

  if (!target) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    if (target.type === 'work_file' && target.path) {
      window.open(`/api/work/download?path=${encodeURIComponent(target.path)}`, '_blank');
    } else if (target.type === 'attachment' && target.attachment?.id) {
      window.open(`/api/uploads/${target.attachment.id}`, '_blank');
    } else if (target.imageUrl) {
      window.open(target.imageUrl, '_blank');
    }
  };

  const workViewUrl =
    target.type === 'work_file' && target.path
      ? `/api/work/view?path=${encodeURIComponent(target.path)}`
      : target.imageUrl
      ? target.imageUrl
      : target.attachment?.dataUrl || (target.attachment?.id ? `/api/uploads/${target.attachment.id}` : '');

  const lines = fileContent ? fileContent.split('\n') : [];

  return (
    <div
      className="preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Preview'}
    >
      <div
        className="preview-container"
        data-type={isHtml && activeTab === 'preview' ? 'html' : 'code'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: 'var(--surface-2)',
            borderBottom: '1px solid var(--hairline)',
            flexShrink: 0,
            gap: '8px',
          }}
        >
          {/* File Icon & Title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
              flex: 1,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--text)' }}>
              {isImage ? (
                <ImageIcon size={16} strokeWidth={1.75} />
              ) : isHtml || isMarkdown ? (
                <FileCode size={16} strokeWidth={1.75} />
              ) : (
                <FileText size={16} strokeWidth={1.75} />
              )}
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 'var(--fw-medium)',
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {/* HTML/Markdown Toggle: Preview / Code */}
            {(isHtml || isMarkdown) && (
              <div
                style={{
                  display: 'flex',
                  backgroundColor: 'var(--surface-3)',
                  padding: '2px',
                  borderRadius: 'var(--r-s)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="press"
                  title="Preview"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    backgroundColor: activeTab === 'preview' ? 'var(--selected)' : 'transparent',
                    color: activeTab === 'preview' ? 'var(--text)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <Eye size={13} strokeWidth={1.75} />
                  <span className="preview-tab-label">Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className="press"
                  title="Source"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    backgroundColor: activeTab === 'code' ? 'var(--selected)' : 'transparent',
                    color: activeTab === 'code' ? 'var(--text)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <Code size={13} strokeWidth={1.75} />
                  <span className="preview-tab-label">Code</span>
                </button>
              </div>
            )}

            {/* Viewport Simulation (PC only for HTML preview) */}
            {isHtml && activeTab === 'preview' && (
              <button
                type="button"
                onClick={() => setViewportMode(viewportMode === 'full' ? 'mobile' : 'full')}
                title={viewportMode === 'full' ? 'Mobile screen simulation (375px)' : 'Full width'}
                aria-label="Toggle viewport"
                className="press"
                style={{
                  background: viewportMode === 'mobile' ? 'var(--selected)' : 'none',
                  border: 'none',
                  padding: '6px',
                  borderRadius: 'var(--r-s)',
                  color: viewportMode === 'mobile' ? 'var(--text)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'none',
                }}
                id="preview-viewport-btn"
              >
                {viewportMode === 'full' ? <Smartphone size={15} strokeWidth={1.75} /> : <Monitor size={15} strokeWidth={1.75} />}
              </button>
            )}

            {/* Canvas Theme Toggle (Light / Dark for HTML) */}
            {isHtml && activeTab === 'preview' && (
              <button
                type="button"
                onClick={() => setCanvasTheme(canvasTheme === 'light' ? 'dark' : 'light')}
                title={`Canvas theme: ${canvasTheme}`}
                aria-label="Toggle canvas background"
                className="press"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '6px',
                  borderRadius: 'var(--r-s)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {canvasTheme === 'light' ? <Moon size={15} strokeWidth={1.75} /> : <Sun size={15} strokeWidth={1.75} />}
              </button>
            )}

            {/* Word wrap toggle for code/text */}
            {(!isHtml || activeTab === 'code') && !isImage && !isPdf && (
              <button
                type="button"
                onClick={() => setWrapLines(!wrapLines)}
                title={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
                aria-label="Toggle line wrap"
                className="press"
                style={{
                  background: wrapLines ? 'var(--selected)' : 'none',
                  border: 'none',
                  padding: '6px',
                  borderRadius: 'var(--r-s)',
                  color: wrapLines ? 'var(--text)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <WrapText size={15} strokeWidth={1.75} />
              </button>
            )}

            {/* External link */}
            {workViewUrl && (
              <button
                type="button"
                onClick={() => window.open(workViewUrl, '_blank')}
                title="Open in new window"
                aria-label="Open in new window"
                className="press"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '6px',
                  borderRadius: 'var(--r-s)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <ExternalLink size={15} strokeWidth={1.75} />
              </button>
            )}

            {/* Copy button */}
            {fileContent && (
              <button
                type="button"
                onClick={handleCopy}
                title="Copy content"
                aria-label="Copy"
                className="press"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '6px',
                  borderRadius: 'var(--r-s)',
                  color: copied ? 'var(--text-2)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
              </button>
            )}

            {/* Download button */}
            <button
              type="button"
              onClick={handleDownload}
              title="Download"
              aria-label="Download"
              className="press"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                borderRadius: 'var(--r-s)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <Download size={15} strokeWidth={1.75} />
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="press"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                borderRadius: 'var(--r-s)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <X size={17} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--surface-1)',
            position: 'relative',
          }}
        >
          {isImage ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                backgroundColor: 'var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <img
                src={
                  target.imageUrl ||
                  target.attachment?.dataUrl ||
                  (workViewUrl ? workViewUrl : undefined)
                }
                alt={title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: 'var(--r-m)',
                }}
              />
            </div>
          ) : isHtml && activeTab === 'preview' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: canvasTheme === 'dark' ? '#0a0d10' : '#e5e7eb',
                overflow: 'auto',
                padding: viewportMode === 'mobile' ? '16px 0' : '0',
              }}
            >
              <div
                style={{
                  width: viewportMode === 'mobile' ? '375px' : '100%',
                  height: '100%',
                  maxHeight: viewportMode === 'mobile' ? '780px' : '100%',
                  backgroundColor: canvasTheme === 'dark' ? '#0f1317' : '#ffffff',
                  borderRadius: viewportMode === 'mobile' ? '24px' : '0',
                  overflow: 'hidden',
                  border: viewportMode === 'mobile' ? '8px solid #222' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'width var(--dur-fast) var(--ease-out)',
                }}
              >
                <iframe
                  srcDoc={preparedHtml || undefined}
                  src={!preparedHtml && workViewUrl ? workViewUrl : undefined}
                  title={title}
                  sandbox="allow-scripts allow-forms allow-modals"
                  style={{
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    border: 'none',
                    display: 'block',
                    backgroundColor: 'transparent',
                  }}
                />
              </div>
            </div>
          ) : isMarkdown && activeTab === 'preview' ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflow: 'auto',
                backgroundColor: 'var(--surface-1)',
                padding: '20px 24px',
              }}
            >
              <MarkdownContent content={fileContent} />
            </div>
          ) : isPdf && workViewUrl ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--surface-3)',
              }}
            >
              <iframe
                src={workViewUrl}
                title={title}
                style={{
                  flex: 1,
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  border: 'none',
                  display: 'block',
                }}
              />
            </div>
          ) : loading ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              {t('loadingContent')}
            </div>
          ) : error ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                color: 'var(--danger)',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          ) : fileContent ? (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflow: 'auto',
                backgroundColor: 'var(--surface-1)',
                fontFamily: 'var(--font)',
                fontSize: '12px',
                lineHeight: '1.6',
                padding: '12px 0',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} style={{ verticalAlign: 'top' }}>
                      <td
                        style={{
                          width: '1%',
                          whiteSpace: 'nowrap',
                          textAlign: 'right',
                          padding: '0 10px',
                          color: 'var(--text-dim)',
                          userSelect: 'none',
                          borderRight: '1px solid var(--hairline)',
                          fontSize: '11px',
                        }}
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{
                          padding: '0 12px',
                          color: 'var(--text)',
                          whiteSpace: wrapLines ? 'pre-wrap' : 'pre',
                          wordBreak: wrapLines ? 'break-word' : 'normal',
                          overflowWrap: wrapLines ? 'break-word' : 'normal',
                        }}
                      >
                        {line || ' '}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}
            >
              {t('noTextContent')}
            </div>
          )}
        </div>

        {/* Modal Footer Info */}
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: 'var(--surface-2)',
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font)',
            flexShrink: 0,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lines.length > 0 ? `${lines.length} lines · ${fileContent.length} chars` : title}
          </span>
          <span style={{ flexShrink: 0, marginLeft: '8px' }}>
            {ext ? ext.toUpperCase() : 'FILE'}
          </span>
        </div>
      </div>
    </div>
  );
};
