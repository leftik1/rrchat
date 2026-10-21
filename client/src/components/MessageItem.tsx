import React, { useState, useMemo, useEffect } from 'react';
import type { Message, ToolCallItem, Attachment } from '../types';
import { MarkdownContent } from './MarkdownContent';
import { ReasoningBlock } from './ReasoningBlock';
import {
  Copy,
  Pencil,
  RotateCw,
  Check,
  X,
  Eye,
  Terminal,
  Folder,
  FolderPlus,
  FileCode,
  Trash2,
  Wrench,
  AlertTriangle,
  Globe,
  ExternalLink,
} from 'lucide-react';
import type { PreviewTarget } from './PreviewModal';
import { t } from '../utils/i18n';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  onEditMessage?: (id: string, newContent: string) => void;
  onRegenerate?: (id: string) => void;
  onDeleteMessage?: (id: string) => void;
  onApproveTool?: (approvalId: string, approved: boolean, rememberForChat?: boolean, approvalToken?: string) => void;
  onPreviewTarget?: (target: PreviewTarget) => void;
  onOpenUsage?: () => void;
}

function getToolIcon(name: string) {
  switch (name) {
    case 'list_dir':
      return <Folder size={14} strokeWidth={1.75} color="var(--icon)" />;
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return <FileCode size={14} strokeWidth={1.75} color="var(--icon)" />;
    case 'make_dir':
      return <FolderPlus size={14} strokeWidth={1.75} color="var(--icon)" />;
    case 'delete_path':
      return <Trash2 size={14} strokeWidth={1.75} color="var(--danger)" />;
    case 'run_command':
      return <Terminal size={14} strokeWidth={1.75} color="var(--icon)" />;
    default:
      return <Wrench size={14} strokeWidth={1.75} color="var(--icon)" />;
  }
}

const SearchSourcesBlock: React.FC<{
  searchStatus: NonNullable<Message['searchStatus']>;
}> = ({ searchStatus }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const results = searchStatus.results || [];
  const count = results.length;
  const isSearching = searchStatus.state === 'searching';

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="press"
        style={{
          fontSize: 'var(--fs-small)',
          color: 'var(--text-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          borderRadius: 'var(--r-s)',
          background: 'var(--surface-3)',
          border: '1px solid var(--hairline)',
          cursor: 'pointer',
        }}
      >
        <Globe size={13} strokeWidth={1.8} color="var(--text-muted)" />
        <span>
          {isSearching
            ? t('searchingWeb')
            : `${t('searchSources')} (${count})`}
        </span>
        <span style={{ fontSize: '10px' }}>{isExpanded ? '↑' : '↓'}</span>
      </button>

      {isExpanded && (
        <div
          style={{
            marginTop: '6px',
            backgroundColor: 'var(--surface-think)',
            borderRadius: 'var(--r-m)',
            padding: 'var(--sp-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '100%',
          }}
        >
          {searchStatus.query && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {t('searchQuery')} "{searchStatus.query}"
            </div>
          )}

          {results.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {t('noSourcesFound')}
            </div>
          ) : (
            results.map((res, i) => {
              let domain = '';
              try {
                domain = new URL(res.url).hostname.replace(/^www\./, '');
              } catch {
                domain = res.url;
              }
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    padding: '6px 8px',
                    backgroundColor: 'var(--surface-3)',
                    borderRadius: 'var(--r-s)',
                  }}
                >
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    <span>{res.title || res.url}</span>
                    <ExternalLink size={11} strokeWidth={1.75} color="var(--text-muted)" />
                  </a>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {domain}
                  </span>
                  {res.snippet && (
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px' }}>
                      {res.snippet}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isStreaming,
  onEditMessage,
  onRegenerate,
  onDeleteMessage,
  onApproveTool,
  onPreviewTarget,
  onOpenUsage,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const handleSaveEdit = () => {
    if (onEditMessage && editContent.trim() && editContent !== message.content) {
      onEditMessage(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  // Safely resolve attachments as an array
  const rawAtts = message.attachments;
  const attachmentsList: Attachment[] = useMemo(() => {
    if (!rawAtts) return [];
    if (Array.isArray(rawAtts)) return rawAtts;
    if (typeof rawAtts === 'string') {
      try {
        const parsed = JSON.parse(rawAtts);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    }
    if (typeof rawAtts === 'object') {
      return [rawAtts as any];
    }
    return [];
  }, [rawAtts]);

  // Find image attachment if any
  const imageAttachment = attachmentsList.find((a) => a && a.isImage && (a.dataUrl || a.id));
  const otherAttachments = attachmentsList.filter((a) => a !== imageAttachment);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 'var(--sp-4)',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: isUser ? '75%' : '100%',
        width: isUser ? 'auto' : '100%',
      }}
    >
      {/* User Bubble */}
      {isUser ? (
        <div
          style={{
            backgroundColor: 'var(--surface-bubble)',
            borderRadius: 'var(--r-m)',
            padding: '10px 14px',
            color: 'var(--text)',
            fontSize: 'var(--fs-base)',
            lineHeight: 'var(--lh-base)',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {/* Image attachment at top of bubble per Screen 02 */}
          {imageAttachment && (
            <div
              onClick={() =>
                onPreviewTarget?.({
                  type: 'image_url',
                  title: imageAttachment.filename,
                  imageUrl: imageAttachment.dataUrl || `/api/uploads/${imageAttachment.id}`,
                  attachment: imageAttachment,
                })
              }
              style={{
                cursor: 'pointer',
                marginBottom: message.content ? '8px' : '0',
                borderRadius: 'var(--r-m)',
                overflow: 'hidden',
                backgroundColor: 'var(--surface-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={imageAttachment.dataUrl || `/api/uploads/${imageAttachment.id}`}
                alt={imageAttachment.filename}
                style={{
                  width: '100%',
                  maxHeight: '260px',
                  objectFit: 'cover',
                  display: 'block',
                  borderRadius: 'var(--r-m)',
                }}
              />
            </div>
          )}

          {/* Other file attachments */}
          {otherAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {otherAttachments.map((att) => (
                <div
                  key={att.id}
                  onClick={() =>
                    onPreviewTarget?.({
                      type: 'attachment',
                      title: att.filename,
                      attachment: att,
                    })
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    backgroundColor: 'var(--surface-3)',
                    borderRadius: 'var(--r-s)',
                    fontSize: 'var(--fs-small)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <span>{att.filename}</span>
                </div>
              ))}
            </div>
          )}

          {/* Message Content / Inline Editing */}
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--surface-3)',
                  borderRadius: 'var(--r-s)',
                  padding: '8px',
                  color: 'var(--text)',
                  fontSize: 'var(--fs-base)',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="press"
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--fs-small)',
                    color: 'var(--text-muted)',
                    backgroundColor: 'var(--surface-3)',
                    borderRadius: 'var(--r-s)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="press"
                  style={{
                    padding: '6px 14px',
                    fontSize: 'var(--fs-small)',
                    backgroundColor: 'var(--selected)',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            message.content && <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          )}
        </div>
      ) : (
        /* Assistant Message Layout per Screen 02 & 05 */
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Web Search Sources Pill / Accordion */}
          {message.searchStatus && (
            <SearchSourcesBlock searchStatus={message.searchStatus} />
          )}

          {/* Status Line / Thinking Block above answer */}
          {(message.reasoning || message.ocrStatus) && (
            <ReasoningBlock
              reasoning={message.reasoning}
              isStreaming={isStreaming && !message.content}
              ocrDurationSec={message.ocrStatus ? 2 : undefined}
              thinkingDurationSec={message.reasoningDurationSec || message.stats?.reasoningDurationSec}
            />
          )}

          {/* Tool Calls (Work Mode) */}
          {((message.toolCalls || message.stats?.toolCalls) ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
              {((message.toolCalls || message.stats?.toolCalls) ?? []).map((tc) => {
                const isExpanded = expandedTools[tc.id] ?? (tc.result ? !tc.result.ok : false);
                const isPending = tc.approvalPending;

                return (
                  <div
                    key={tc.id}
                    style={{
                      borderRadius: 'var(--r-m)',
                      backgroundColor: 'var(--surface-think)',
                      padding: '10px 12px',
                      fontSize: 'var(--fs-small)',
                    }}
                  >
                    {isPending ? (
                      <div>
                        <div
                          style={{
                            fontWeight: 'var(--fw-medium)',
                            color: tc.isDangerous ? 'var(--danger)' : 'var(--text)',
                            marginBottom: '6px',
                          }}
                        >
                          {tc.isDangerous ? 'Dangerous command' : 'Run command?'}
                        </div>
                        <pre
                          style={{
                            padding: '8px 10px',
                            backgroundColor: 'var(--surface-3)',
                            borderRadius: 'var(--r-s)',
                            fontSize: 'var(--fs-micro)',
                            color: 'var(--text)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            margin: '0 0 10px 0',
                          }}
                        >
                          {tc.command || tc.args?.command || ''}
                        </pre>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => onApproveTool?.(tc.approvalId || tc.id, false, false, tc.approvalToken)}
                            className="press"
                            style={{
                              padding: '6px 14px',
                              borderRadius: 'var(--r-s)',
                              backgroundColor: 'var(--surface-3)',
                              color: 'var(--text-muted)',
                              fontSize: 'var(--fs-small)',
                              border: 'none',
                            }}
                          >
                            Deny
                          </button>
                          {!tc.isDangerous && tc.canRemember !== false && (
                            <button
                              type="button"
                              onClick={() => onApproveTool?.(tc.approvalId || tc.id, true, true, tc.approvalToken)}
                              className="press"
                              title={t('deleteMessageChain')}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 'var(--r-s)',
                                backgroundColor: 'var(--surface-3)',
                                color: 'var(--text)',
                                fontSize: 'var(--fs-small)',
                                border: '1px solid var(--hairline)',
                              }}
                            >
                              Always in chat
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onApproveTool?.(tc.approvalId || tc.id, true, false, tc.approvalToken)}
                            className="press"
                            style={{
                              padding: '6px 14px',
                              borderRadius: 'var(--r-s)',
                              backgroundColor: 'var(--selected)',
                              color: 'var(--text)',
                              fontSize: 'var(--fs-small)',
                              border: 'none',
                            }}
                          >
                            Run
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          onClick={() =>
                            setExpandedTools((prev) => ({
                              ...prev,
                              [tc.id]: !prev[tc.id],
                            }))
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            {getToolIcon(tc.name)}
                            <span style={{ fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                              {tc.name}
                            </span>
                            <span
                              style={{
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {tc.args?.path || tc.args?.command || ''}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 'var(--fs-micro)',
                              color: tc.result?.ok ? 'var(--text-muted)' : tc.result ? 'var(--danger)' : 'var(--text)',
                              marginLeft: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            {!tc.result ? (
                              <>
                                <span
                                  style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--text)',
                                    opacity: 0.8,
                                  }}
                                />
                                running
                              </>
                            ) : tc.result.ok ? (
                              'ok'
                            ) : (
                              'error'
                            )}
                          </span>
                        </div>

                        {isExpanded && tc.result && (
                          <div style={{ marginTop: '8px' }}>
                            <pre
                              style={{
                                margin: 0,
                                padding: '8px 10px',
                                backgroundColor: 'var(--surface-3)',
                                borderRadius: 'var(--r-s)',
                                fontSize: 'var(--fs-micro)',
                                color: tc.result.ok ? 'var(--text)' : 'var(--danger)',
                                maxHeight: '200px',
                                overflowY: 'auto',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {tc.result.output}
                            </pre>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(tc.result?.output || '');
                                }}
                                className="press"
                                title="Copy output"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: 'var(--r-s)',
                                  backgroundColor: 'var(--surface-3)',
                                  fontSize: 'var(--fs-micro)',
                                  color: 'var(--text-muted)',
                                  border: 'none',
                                }}
                              >
                                <Copy size={12} strokeWidth={1.75} />
                                <span>Copy output</span>
                              </button>
                              {tc.result.ok &&
                                (tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'read_file') &&
                                tc.args?.path && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onPreviewTarget?.({
                                        type: 'work_file',
                                        title: tc.args.path,
                                        path: tc.args.path,
                                      });
                                    }}
                                    className="press"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '4px 8px',
                                      borderRadius: 'var(--r-s)',
                                      backgroundColor: 'var(--surface-3)',
                                      fontSize: 'var(--fs-micro)',
                                      color: 'var(--text)',
                                      border: 'none',
                                    }}
                                  >
                                    <Eye size={12} strokeWidth={1.75} />
                                    <span>Preview {tc.args.path}</span>
                                  </button>
                                )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assistant Bubble */}
          {(message.content || isStreaming) && (
            <div
              style={{
                backgroundColor: 'var(--surface-bubble)',
                borderRadius: 'var(--r-m)',
                padding: '10px 14px',
                color: 'var(--text)',
                fontSize: 'var(--fs-base)',
                lineHeight: 'var(--lh-base)',
                alignSelf: 'flex-start',
                maxWidth: '100%',
              }}
            >
              <MarkdownContent content={message.content} />
              {isStreaming && <span className="caret" />}
            </div>
          )}

          {/* Stats and actions below assistant message per Screen 02 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '6px',
              minHeight: '24px',
            }}
          >
            {message.stats && message.stats.tokensPerSecond ? (
              <div
                onClick={onOpenUsage}
                role={onOpenUsage ? 'button' : undefined}
                tabIndex={onOpenUsage ? 0 : undefined}
                style={{
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--text-dim)',
                  cursor: onOpenUsage ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                {message.stats.tokensPerSecond} tok/s  |  {message.stats.completionTokens ?? 0} tok
              </div>
            ) : (
              <div />
            )}

            {!isStreaming && !isEditing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy"
                  className="press"
                  title="Copy"
                  style={{
                    width: '28px',
                    height: '28px',
                    color: copied ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
                </button>

                {onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(message.id)}
                    aria-label="Regenerate"
                    className="press"
                    title="Regenerate"
                    style={{
                      width: '28px',
                      height: '28px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <RotateCw size={15} strokeWidth={1.75} />
                  </button>
                )}

                {onDeleteMessage && (
                  confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMessage(message.id);
                        setConfirmDelete(false);
                      }}
                      className="press"
                      title={t('confirmDeleteMessage')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--r-s)',
                        backgroundColor: 'var(--danger)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 'var(--fw-medium)',
                        height: '24px',
                      }}
                    >
                      {t('delete')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Delete message"
                      className="press"
                      title={t('deleteMessage')}
                      style={{
                        width: '28px',
                        height: '28px',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons under user message */}
      {isUser && !isEditing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
            alignSelf: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy"
            className="press"
            title="Copy"
            style={{
              width: '28px',
              height: '28px',
              color: copied ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {copied ? <Check size={15} strokeWidth={1.75} /> : <Copy size={15} strokeWidth={1.75} />}
          </button>

          {onEditMessage && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label="Edit"
              className="press"
              title="Edit"
              style={{
                width: '28px',
                height: '28px',
                color: 'var(--text-muted)',
              }}
            >
              <Pencil size={15} strokeWidth={1.75} />
            </button>
          )}

          {onDeleteMessage && (
            confirmDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDeleteMessage(message.id);
                  setConfirmDelete(false);
                }}
                className="press"
                title={t('confirmDeleteMessage')}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--r-s)',
                  backgroundColor: 'var(--danger)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'var(--fw-medium)',
                  height: '24px',
                }}
              >
                {t('delete')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete message"
                className="press"
                title={t('deleteMessage')}
                style={{
                  width: '28px',
                  height: '28px',
                  color: 'var(--text-dim)',
                }}
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
