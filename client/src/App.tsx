import React, { useEffect, useState, useRef } from 'react';
import type { Chat, Message, ModelInfo, ModelProgressEvent, Attachment } from './types';
import { api } from './api/client';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { Sidebar } from './components/Sidebar';
import { ModelSelectorModal } from './components/ModelSelectorModal';
import { AdminModal } from './components/AdminModal';
import { PlusMenuSheet } from './components/PlusMenuSheet';
import { PreviewModal, type PreviewTarget } from './components/PreviewModal';
import { DirectoryScene } from './components/DirectoryScene';
import { UsageDrawer } from './components/UsageDrawer';
import { SetupWizard } from './components/SetupWizard';
import { Lock, ArrowRight } from 'lucide-react';
import { compressImage } from './utils/image';
import { t } from './utils/i18n';

export const App: React.FC = () => {
  // Preview modal state
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);

  // Directory scene state
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'guest'>('admin');
  const userRoleRef = useRef<'admin' | 'guest'>('admin');
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);
  const [tokenInput, setTokenInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Models state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activeAuxModelId, setActiveAuxModelId] = useState<string | null>(null);
  const [progressEvent, setProgressEvent] = useState<ModelProgressEvent | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  // Chats state
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Incognito state
  const [isIncognito, setIsIncognito] = useState(false);
  const [incognitoMessages, setIncognitoMessages] = useState<Message[]>([]);

  // Phase 2 & 3 states: Attachments, Plus Menu, Reasoning, Mode & Context
  const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [mode, setMode] = useState<'chat' | 'work'>('chat');
  const [workModeEnabled, setWorkModeEnabled] = useState(false);
  const [workModeAllowed, setWorkModeAllowed] = useState(true);
  const [settingsData, setSettingsData] = useState<{ workDir?: string; workQuotaGB?: number; workUsedGB?: number }>({});
  const [enableReasoning, setEnableReasoning] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [contextUsedTokens, setContextUsedTokens] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() => {
    return localStorage.getItem('rrchat_web_search') === 'true';
  });
  const [visionMode, setVisionMode] = useState<'ocr' | 'vision'>('vision');

  // Generation parameters & auto compaction
  const [temperature, setTemperature] = useState<number>(() => {
    const saved = localStorage.getItem('rrchat_temperature');
    return saved !== null ? parseFloat(saved) : 0.7;
  });
  const [topP, setTopP] = useState<number>(() => {
    const saved = localStorage.getItem('rrchat_top_p');
    return saved !== null ? parseFloat(saved) : 0.95;
  });
  const [minP, setMinP] = useState<number>(() => {
    const saved = localStorage.getItem('rrchat_min_p');
    return saved !== null ? parseFloat(saved) : 0.05;
  });
  const [chatSystemPrompt, setChatSystemPrompt] = useState<string>(() => {
    return localStorage.getItem('rrchat_system_prompt') || '';
  });
  const [autoCompact, setAutoCompact] = useState<boolean>(() => {
    const saved = localStorage.getItem('rrchat_auto_compact');
    return saved !== null ? saved === 'true' : true;
  });

  const updateTemperature = (val: number) => {
    setTemperature(val);
    localStorage.setItem('rrchat_temperature', String(val));
  };
  const updateTopP = (val: number) => {
    setTopP(val);
    localStorage.setItem('rrchat_top_p', String(val));
  };
  const updateMinP = (val: number) => {
    setMinP(val);
    localStorage.setItem('rrchat_min_p', String(val));
  };
  const updateChatSystemPrompt = (val: string) => {
    setChatSystemPrompt(val);
    localStorage.setItem('rrchat_system_prompt', val);
  };
  const updateAutoCompact = (val: boolean) => {
    setAutoCompact(val);
    localStorage.setItem('rrchat_auto_compact', String(val));
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const activeModel = models.find((m) => m.id === activeModelId);
  const activeModelName = activeModel?.name || activeModelId || t('selectModel');
  const activeAuxModel = models.find((m) => m.id === activeAuxModelId);
  const activeAuxModelName = activeAuxModel?.name || null;

  useEffect(() => {
    if (activeModel?.hasVision) {
      setVisionMode('vision');
    } else {
      setVisionMode('ocr');
    }
  }, [activeModel?.id, activeModel?.hasVision]);

  // Modals & Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  });
  const [isSetupOpen, setIsSetupOpen] = useState(() => {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/setup');
  });
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);

  // Edge swipe detection for opening Usage drawer (20px right edge zone)
  const edgeSwipeRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && touch.clientX >= window.innerWidth - 20) {
        edgeSwipeRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: Date.now(),
        };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!edgeSwipeRef.current) return;
      const touch = e.changedTouches[0];
      if (touch) {
        const diffX = touch.clientX - edgeSwipeRef.current.startX;
        const diffY = touch.clientY - edgeSwipeRef.current.startY;
        const elapsed = Math.max(Date.now() - edgeSwipeRef.current.startTime, 1);
        const velocity = Math.abs(diffX) / elapsed;

        // Swiped left towards screen center
        if (diffX < -40 && Math.abs(diffX) > Math.abs(diffY)) {
          if (userRoleRef.current === 'guest') {
            edgeSwipeRef.current = null;
            return;
          }
          const panelWidth = Math.min(window.innerWidth * 0.88, 360);
          if (Math.abs(diffX) >= panelWidth * 0.35 || velocity > 0.5) {
            setIsSidebarOpen(false);
            setIsPlusMenuOpen(false);
            setIsUsageOpen(true);
          }
        }
      }
      edgeSwipeRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const openUsageDrawer = () => {
    if (userRoleRef.current === 'guest') {
      alert(t('fullModeOnly'));
      return;
    }
    setIsSidebarOpen(false);
    setIsPlusMenuOpen(false);
    setIsUsageOpen(true);
  };

  // Abort stream function ref
  const abortStreamRef = useRef<(() => void) | null>(null);
  const isSendingRef = useRef(false);

  // 1. Initial Auth Check and Token Hash URL handling
  useEffect(() => {
    async function initAuth() {
      // 0. Check if setup is needed
      try {
        const setup = await api.getSetupStatus();
        if (!setup.isConfigured) {
          setIsSetupNeeded(true);
        }
      } catch {
        // ignore
      }

      // 1. Check URL fragment for #token=...
      let token: string | null = null;
      if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        token = params.get('token');
        if (!token && hash.startsWith('token=')) {
          token = hash.substring(6);
        }
      }

      // Fallback for legacy query string ?token=
      if (!token) {
        const searchParams = new URLSearchParams(window.location.search);
        token = searchParams.get('token');
      }

      if (token) {
        const res = await api.login(token);
        // Immediately remove token from address bar and history
        window.history.replaceState(null, '', window.location.pathname);
        if (res.ok) {
          const role = res.role || 'admin';
          setUserRole(role);
          userRoleRef.current = role;
          setIsAuthenticated(true);
          return;
        }
      }

      // 2. Validate existing httpOnly session cookie
      const authRes = await api.checkAuth();
      if (authRes.ok) {
        const role = authRes.role || 'admin';
        setUserRole(role);
        userRoleRef.current = role;
        setIsAuthenticated(true);
        return;
      }

      setIsAuthenticated(false);
    }

    initAuth();
  }, []);

  // 2. Load models and chats when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    loadModels();
    loadChats();
    loadSettings();

    const unsubEvents = api.subscribeModelEvents((e) => {
      setProgressEvent(e);
      if (e.status === 'loaded') {
        if (!e.isAux) {
          setActiveModelId(e.modelId);
        } else {
          setActiveAuxModelId(e.modelId);
        }
        loadModels();
      } else if (e.status === 'unloaded' || e.message === 'models_updated') {
        loadModels();
      }
    });

    // Auto-refresh models and settings in background
    const pollInterval = setInterval(() => {
      loadModels();
      loadSettings();
    }, 4000);

    return () => {
      unsubEvents();
      clearInterval(pollInterval);
    };
  }, [isAuthenticated]);

  const mapRawMessage = (m: any): Message => {
    let statsObj: any = undefined;
    let toolCalls = undefined;
    if (m.stats) {
      try {
        statsObj = typeof m.stats === 'string' ? JSON.parse(m.stats) : m.stats;
        if (Array.isArray(statsObj?.toolCalls)) {
          toolCalls = statsObj.toolCalls;
        }
      } catch {
        // ignore
      }
    }
    let searchStatus: any = undefined;
    if (statsObj?.webSearchResults?.length) {
      searchStatus = {
        state: 'done',
        results: statsObj.webSearchResults,
      };
    }
    let parsedAttachments: Attachment[] | undefined = undefined;
    if (m.attachments) {
      try {
        const parsed = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments;
        parsedAttachments = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        parsedAttachments = undefined;
      }
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content || '',
      reasoning: m.reasoning,
      attachments: parsedAttachments,
      stats: statsObj,
      toolCalls,
      searchStatus,
      createdAt: m.created_at || m.createdAt || Date.now(),
    };
  };

  // 3. Re-sync chat messages when returning from background (e.g. mobile app switch or screen lock)
  useEffect(() => {
    let pollTimer: any = null;

    const handleReSync = async () => {
      if (document.visibilityState === 'visible' && activeChatId && !isIncognito && !isSendingRef.current && !isStreaming) {
        try {
          const res = await api.getChat(activeChatId);
          if (res?.messages) {
            const mapped = res.messages.map(mapRawMessage);
            setMessages((prev) => {
              if (mapped.length >= prev.length) {
                return mapped;
              }
              if (!pollTimer) {
                pollTimer = setTimeout(handleReSync, 2000);
              }
              return prev;
            });
          }
        } catch {
          // ignore
        }
      }
    };

    document.addEventListener('visibilitychange', handleReSync);
    window.addEventListener('focus', handleReSync);
    return () => {
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', handleReSync);
      window.removeEventListener('focus', handleReSync);
    };
  }, [activeChatId, isIncognito, isStreaming]);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setWorkModeEnabled(!!data.workModeEnabled);
      if (data.workModeAllowed !== undefined) {
        setWorkModeAllowed(data.workModeAllowed !== false);
        if (!data.workModeAllowed && mode === 'work') {
          setMode('chat');
        }
      }
      setSettingsData({
        workDir: data.workDir,
        workQuotaGB: data.workQuotaGB,
        workUsedGB: data.workUsedGB,
      });
    } catch {
      // ignore
    }
  };

  const loadModels = async () => {
    try {
      const data = await api.getModels();

      // Check localStorage for user role overrides and sync if needed
      const processedModels = data.models.map((m) => {
        const savedRole = localStorage.getItem(`user_role_${m.id}`) as 'main' | 'aux' | null;
        if (savedRole && m.role !== savedRole) {
          api.updateModelSettings(m.id, { role: savedRole, userRole: savedRole }).catch(() => {});
          return { ...m, role: savedRole, userRole: savedRole, isUserOverridden: true };
        }
        return m;
      });

      setModels(processedModels);

      const mainModels = processedModels.filter((m) => m.role !== 'aux');
      const auxModels = processedModels.filter((m) => m.role === 'aux');

      // Check for loaded model from server
      const loadedMain = mainModels.find((m) => m.isLoaded || m.status === 'loaded');
      const savedActiveMain = localStorage.getItem('local_ai_active_main_model');
      if (data.activeModelId && mainModels.some((m) => m.id === data.activeModelId)) {
        setActiveModelId(data.activeModelId);
      } else if (loadedMain) {
        setActiveModelId(loadedMain.id);
      } else if (savedActiveMain && mainModels.some((m) => m.id === savedActiveMain)) {
        setActiveModelId(savedActiveMain);
      } else if (!activeModelId || !mainModels.some((m) => m.id === activeModelId)) {
        if (mainModels.length > 0) {
          setActiveModelId(mainModels[0].id);
        } else {
          setActiveModelId(null);
        }
      }

      // Check localStorage for active aux model
      const savedActiveAux = localStorage.getItem('local_ai_active_aux_model');
      if (savedActiveAux && auxModels.some((m) => m.id === savedActiveAux)) {
        setActiveAuxModelId(savedActiveAux);
      } else if (data.activeAuxModelId && auxModels.some((m) => m.id === data.activeAuxModelId)) {
        setActiveAuxModelId(data.activeAuxModelId);
      } else if (auxModels.length > 0) {
        setActiveAuxModelId(auxModels[0].id);
      } else {
        setActiveAuxModelId(null);
      }
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  };

  const loadChats = async () => {
    try {
      const list = await api.getChats();
      setChats(list);
      if (list.length > 0 && !activeChatId && !isIncognito) {
        selectChat(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  };

  const selectChat = async (chatId: string) => {
    setActiveChatId(chatId);
    try {
      const data = await api.getChat(chatId);
      const mapped = (data.messages || []).map(mapRawMessage);
      setMessages(mapped);
      if (data.chat?.mode) {
        setMode(data.chat.mode as 'chat' | 'work');
      }
      const lastWithStats = [...mapped].reverse().find((m: any) => m.stats?.promptTokens || m.stats?.completionTokens);
      if (lastWithStats?.stats) {
        setContextUsedTokens((lastWithStats.stats.promptTokens || 0) + (lastWithStats.stats.completionTokens || 0));
      } else {
        const estTokens = mapped.reduce((acc: number, m: any) => {
          return acc + Math.max(1, Math.round(((m.content || '') + (m.reasoning || '')).length / 3.5));
        }, 0);
        setContextUsedTokens(estTokens);
      }
    } catch (err) {
      console.error('Failed to load messages for chat:', chatId, err);
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;
    setAuthError('');
    const res = await api.login(token);
    if (res.ok) {
      const role = res.role || 'admin';
      setUserRole(role);
      userRoleRef.current = role;
      setIsAuthenticated(true);
      setTokenInput('');
    } else if (res.status === 429) {
      const waitSec = res.retryAfter || 60;
      setAuthError(`Too many attempts. Try again in ${waitSec} s`);
    } else {
      setAuthError('Invalid token');
    }
  };

  const handleNewChat = async (targetMode?: 'chat' | 'work') => {
    if (userRole === 'guest') {
      targetMode = 'chat';
    }
    if (isIncognito) {
      setIncognitoMessages([]);
      return;
    }
    const newChatMode = targetMode || (userRole === 'guest' ? 'chat' : mode);
    try {
      const newChat = await api.createChat({
        title: 'New chat',
        mode: newChatMode,
        model_id: activeModelId || '',
      });
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setMessages([]);
      setMode(newChatMode);
    } catch (err: any) {
      alert(`Failed to create chat: ${err.message}`);
    }
  };

  const handleModeChange = async (newMode: 'chat' | 'work') => {
    if (userRole === 'guest' && newMode === 'work') {
      alert(t('fullModeOnly'));
      return;
    }
    setMode(newMode);
    if (activeChatId && !isIncognito) {
      await api.updateChat(activeChatId, { mode: newMode });
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, mode: newMode } : c)));
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await api.deleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (err: any) {
      alert(`${t('failedDeleteChat')}: ${err.message}`);
    }
  };

  const handleRenameChat = async (id: string, newTitle: string) => {
    try {
      await api.updateChat(id, { title: newTitle });
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    } catch (err: any) {
      alert(`${t('failedRenameChat')}: ${err.message}`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (isStreaming) return;
    if (isIncognito) {
      setIncognitoMessages((prev) => prev.filter((m) => m.id !== messageId));
    } else if (activeChatId) {
      try {
        await api.deleteMessage(activeChatId, messageId);
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err: any) {
        alert(`${t('failedDeleteMessage')}: ${err.message}`);
      }
    }
  };

  const handleSelectModel = async (id: string, opts?: any) => {
    try {
      localStorage.setItem('local_ai_active_main_model', id);
      await api.loadModel(id, opts);
      setActiveModelId(id);
      setIsModelSelectorOpen(false);
      loadModels();
    } catch (err: any) {
      alert(`${t('failedUploadFile')}: ${err.message}`);
    }
  };

  const handleUnloadModel = async (id: string) => {
    try {
      await api.unloadModel(id);
      loadModels();
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  const currentMessages = isIncognito ? incognitoMessages : messages;

  const handleFileSelect = async (file: File) => {
    try {
      const fileToUpload = file.type.startsWith('image/') ? await compressImage(file) : file;
      const uploaded = await api.uploadFile(fileToUpload);
      setPendingAttachments((prev) => [...prev, uploaded]);
    } catch (err: any) {
      alert(`${t('failedUploadFile')}: ${err.message}`);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach((file) => handleFileSelect(file));
    }
  };

  const handleSendMessage = async () => {
    if (isSendingRef.current) return;
    const text = inputValue.trim();
    const hasContent = text.length > 0 || pendingAttachments.length > 0;
    if (!hasContent || isStreaming || !activeModelId) return;

    isSendingRef.current = true;

    setInputValue('');
    const currentAttachments = [...pendingAttachments];
    setPendingAttachments([]);

    const userMsgId = `usr_${Date.now()}`;
    const assistantMsgId = `ast_${Date.now()}`;

    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      attachments: currentAttachments,
      createdAt: Date.now(),
    };

    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: Date.now(),
    };

    let targetChatId = activeChatId;
    if (!isIncognito && !targetChatId) {
      try {
        const newChat = await api.createChat({
          title: text ? text.slice(0, 30) : currentAttachments[0]?.filename || t('newChat'),
          model_id: activeModelId,
        });
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        targetChatId = newChat.id;
      } catch (err: any) {
        isSendingRef.current = false;
        alert(`${t('failedCreateChat')}: ${err.message}`);
        return;
      }
    }

    if (isIncognito) {
      setIncognitoMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      // Save user message to SQLite
      await api.addMessage(targetChatId!, {
        id: userMsgId,
        role: 'user',
        content: text,
        attachments: currentAttachments,
      });

      // Update chat title if it's the first message
      if (messages.length === 0) {
        api.updateChat(targetChatId!, { title: text ? text.slice(0, 32) : currentAttachments[0]?.filename });
      }
    }

    if (!isIncognito && targetChatId && mode === 'work' && userRole !== 'guest') {
      api.updateChat(targetChatId, { mode: 'work' });
      setChats((prev) => prev.map((c) => (c.id === targetChatId ? { ...c, mode: 'work' } : c)));
    }

    // Build context history with attachments
    const history = isIncognito
      ? [...incognitoMessages, userMessage].map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }))
      : [...messages, userMessage].map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));

    setIsStreaming(true);

    let reasoningStartTime = 0;
    let reasoningEndTime = 0;

    const cancelStream = api.streamChat(
      targetChatId || 'incognito',
      {
        assistantMessageId: assistantMsgId,
        modelId: activeModelId,
        messages: history,
        isIncognito,
        mode: userRole === 'guest' ? 'chat' : mode,
        reasoningEffort,
        enableReasoning,
        webSearch: webSearchEnabled,
        visionMode,
        temperature,
        topP,
        minP,
        chatSystemPrompt: chatSystemPrompt.trim() || undefined,
        autoCompact,
      },
      {
        onStatus: (status) => {
          if (status.type === 'web_search') {
            updateAssistantMsg((prev) => ({
              ...prev,
              searchStatus: {
                state: 'searching',
                query: status.query,
              },
            }));
          } else if (status.type === 'web_search_done') {
            updateAssistantMsg((prev) => ({
              ...prev,
              searchStatus: {
                state: 'done',
                query: status.query,
                results: status.results,
              },
            }));
          } else if (status.type?.startsWith('ocr')) {
            updateAssistantMsg((prev) => ({
              ...prev,
              ocrStatus: {
                state: status.type === 'ocr' ? 'analyzing' : status.type === 'ocr_done' ? 'done' : 'error',
                message: status.message,
                text: status.text,
              },
            }));
          }
        },
        onReasoning: (delta) => {
          if (!reasoningStartTime) reasoningStartTime = Date.now();
          updateAssistantMsg((prev) => ({
            ...prev,
            reasoning: (prev.reasoning || '') + delta,
          }));
        },
        onContent: (delta) => {
          if (reasoningStartTime && !reasoningEndTime) reasoningEndTime = Date.now();
          const duration = reasoningStartTime
            ? Math.max(1, Math.round(((reasoningEndTime || Date.now()) - reasoningStartTime) / 1000))
            : undefined;
          updateAssistantMsg((prev) => ({
            ...prev,
            content: prev.content + delta,
            reasoningDurationSec: prev.reasoningDurationSec || duration,
          }));
        },
        onToolCall: (data) => {
          if (!isIncognito && targetChatId) {
            api.updateChat(targetChatId, { mode: 'work' });
            setChats((prev) => prev.map((c) => (c.id === targetChatId ? { ...c, mode: 'work' } : c)));
          }
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            const idx = existing.findIndex((c) => c.id === data.id);
            if (idx >= 0) {
              existing[idx] = { ...existing[idx], ...data };
            } else {
              existing.push({ id: data.id, name: data.name, args: data.args });
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onToolApproval: (data) => {
          if (!isIncognito && targetChatId) {
            api.updateChat(targetChatId, { mode: 'work' });
            setChats((prev) => prev.map((c) => (c.id === targetChatId ? { ...c, mode: 'work' } : c)));
          }
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            let found = existing.find((c) => c.name === data.tool && !c.result);
            if (found) {
              found.approvalPending = true;
              found.approvalId = data.id;
              found.approvalToken = data.token;
              found.canRemember = data.canRemember;
              if (data.command) found.command = data.command;
              if (data.isDangerous !== undefined) found.isDangerous = data.isDangerous;
            } else {
              existing.push({
                id: data.id,
                name: data.tool,
                args: data.args,
                command: data.command,
                isDangerous: data.isDangerous,
                approvalPending: true,
                approvalId: data.id,
                approvalToken: data.token,
                canRemember: data.canRemember,
              });
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onToolResult: (data) => {
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            const tc = existing.find((c) => c.id === data.id);
            if (tc) {
              tc.result = { ok: data.ok, output: data.output };
              tc.approvalPending = false;
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onStats: (stats) => {
          if (reasoningStartTime && !reasoningEndTime) reasoningEndTime = Date.now();
          const finalDuration = reasoningStartTime
            ? Math.max(1, Math.round((reasoningEndTime - reasoningStartTime) / 1000))
            : undefined;
          updateAssistantMsg((prev) => ({
            ...prev,
            stats: {
              ...stats,
              reasoningDurationSec: prev.reasoningDurationSec || finalDuration,
            },
            reasoningDurationSec: prev.reasoningDurationSec || finalDuration,
            toolCalls: stats.toolCalls || prev.toolCalls,
          }));
          if (stats.promptTokens || stats.completionTokens) {
            setContextUsedTokens((stats.promptTokens || 0) + (stats.completionTokens || 0));
          }
        },
        onContextCompacted: () => {
          if (targetChatId && !isIncognito) {
            api.getChat(targetChatId).then((res) => {
              if (res.messages) {
                setMessages(res.messages.map(mapRawMessage));
              }
            });
          }
        },
        onError: (err) => {
          isSendingRef.current = false;
          setIsStreaming(false);

          updateAssistantMsg((prev) => {
            if (!prev.content && !prev.reasoning) {
              return {
                ...prev,
                content: `*[${t('connectionError')}: ${err.message || t('requestError')}]*`,
              };
            }
            return {
              ...prev,
              content: prev.content + `\n\n*[${t('error')}: ${err.message}]*`,
            };
          });
        },
        onDone: () => {
          if (reasoningStartTime && !reasoningEndTime) reasoningEndTime = Date.now();
          const finalDuration = reasoningStartTime
            ? Math.max(1, Math.round((reasoningEndTime - reasoningStartTime) / 1000))
            : undefined;
          updateAssistantMsg((prev) => ({
            ...prev,
            reasoningDurationSec: prev.reasoningDurationSec || finalDuration,
            stats: {
              ...prev.stats,
              reasoningDurationSec: prev.reasoningDurationSec || finalDuration,
            },
          }));
          isSendingRef.current = false;
          setIsStreaming(false);
        },
      }
    );

    abortStreamRef.current = cancelStream;

    function updateAssistantMsg(updater: (prev: Message) => Message) {
      if (isIncognito) {
        setIncognitoMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? updater(m) : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? updater(m) : m))
        );
      }
    }
  };

  const handleStopStream = () => {
    isSendingRef.current = false;
    if (abortStreamRef.current) {
      abortStreamRef.current();
      abortStreamRef.current = null;
    }
    if (activeChatId) {
      api.stopChat(activeChatId);
    }
    setIsStreaming(false);
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (isStreaming) return;

    if (isIncognito) {
      const idx = incognitoMessages.findIndex((m) => m.id === messageId);
      if (idx !== -1) {
        const truncated = incognitoMessages.slice(0, idx + 1);
        truncated[idx].content = newContent;
        setIncognitoMessages(truncated);
        // Trigger regeneration
        regenerateAfter(truncated);
      }
    } else if (activeChatId) {
      const msg = messages.find((m) => m.id === messageId);
      if (msg) {
        await api.editMessage(messageId, {
          content: newContent,
          truncateAfter: true,
          chatId: activeChatId,
          timestamp: msg.createdAt,
        });
        const idx = messages.findIndex((m) => m.id === messageId);
        const truncated = messages.slice(0, idx + 1);
        truncated[idx].content = newContent;
        setMessages(truncated);
        regenerateAfter(truncated);
      }
    }
  };

  const handleRegenerate = (assistantMessageId: string) => {
    if (isStreaming) return;
    const currentList = isIncognito ? incognitoMessages : messages;
    const idx = currentList.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;

    const truncated = currentList.slice(0, idx);
    if (isIncognito) {
      setIncognitoMessages(truncated);
    } else {
      setMessages(truncated);
      if (activeChatId) {
        const prevMsg = currentList[idx - 1];
        api.editMessage(prevMsg.id, {
          content: prevMsg.content,
          truncateAfter: true,
          chatId: activeChatId,
          timestamp: prevMsg.createdAt,
        });
      }
    }
    regenerateAfter(truncated);
  };

  const regenerateAfter = (historyMessages: Message[]) => {
    if (!activeModelId) return;
    const assistantMsgId = `ast_${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: Date.now(),
    };

    if (isIncognito) {
      setIncognitoMessages((prev) => [...prev, initialAssistantMessage]);
    } else {
      setMessages((prev) => [...prev, initialAssistantMessage]);
    }

    const history = historyMessages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments }));
    setIsStreaming(true);

    const cancelStream = api.streamChat(
      activeChatId || 'incognito',
      {
        assistantMessageId: assistantMsgId,
        modelId: activeModelId,
        messages: history,
        isIncognito,
        mode,
        reasoningEffort,
        enableReasoning,
        webSearch: webSearchEnabled,
        visionMode,
        temperature,
        topP,
        minP,
        chatSystemPrompt: chatSystemPrompt.trim() || undefined,
        autoCompact,
      },
      {
        onStatus: (status) => {
          updateAssistantMsg((prev) => ({
            ...prev,
            ocrStatus: {
              state: status.type === 'ocr' ? 'analyzing' : status.type === 'ocr_done' ? 'done' : 'error',
              message: status.message,
              text: status.text,
            },
          }));
        },
        onReasoning: (delta) => {
          updateAssistantMsg((prev) => ({
            ...prev,
            reasoning: (prev.reasoning || '') + delta,
          }));
        },
        onContent: (delta) => {
          updateAssistantMsg((prev) => ({
            ...prev,
            content: prev.content + delta,
          }));
        },
        onToolCall: (data) => {
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            const idx = existing.findIndex((c) => c.id === data.id);
            if (idx >= 0) {
              existing[idx] = { ...existing[idx], ...data };
            } else {
              existing.push({ id: data.id, name: data.name, args: data.args });
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onToolApproval: (data) => {
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            let found = existing.find((c) => c.name === data.tool && !c.result);
            if (found) {
              found.approvalPending = true;
              found.approvalId = data.id;
              found.approvalToken = data.token;
              found.canRemember = data.canRemember;
              if (data.command) found.command = data.command;
              if (data.isDangerous !== undefined) found.isDangerous = data.isDangerous;
            } else {
              existing.push({
                id: data.id,
                name: data.tool,
                args: data.args,
                command: data.command,
                isDangerous: data.isDangerous,
                approvalPending: true,
                approvalId: data.id,
                approvalToken: data.token,
                canRemember: data.canRemember,
              });
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onToolResult: (data) => {
          updateAssistantMsg((prev) => {
            const existing = [...(prev.toolCalls || [])];
            const tc = existing.find((c) => c.id === data.id);
            if (tc) {
              tc.result = { ok: data.ok, output: data.output };
              tc.approvalPending = false;
            }
            return { ...prev, toolCalls: existing };
          });
        },
        onStats: (stats) => {
          updateAssistantMsg((prev) => ({
            ...prev,
            stats,
            toolCalls: stats.toolCalls || prev.toolCalls,
            searchStatus: stats.webSearchResults?.length
              ? { state: 'done', results: stats.webSearchResults }
              : prev.searchStatus,
          }));
          if (stats.promptTokens || stats.completionTokens) {
            setContextUsedTokens((stats.promptTokens || 0) + (stats.completionTokens || 0));
          }
        },
        onContextCompacted: () => {
          if (activeChatId && !isIncognito) {
            api.getChat(activeChatId).then((res) => {
              if (res.messages) {
                setMessages(res.messages.map(mapRawMessage));
              }
            });
          }
        },
        onError: (err) => {
          setIsStreaming(false);

          const isBg =
            err.code === 'BACKGROUNDED' ||
            err.message?.toLowerCase().includes('load failed') ||
            err.message?.toLowerCase().includes('failed to fetch');

          if (!isBg) {
            updateAssistantMsg((prev) => ({
              ...prev,
              content: prev.content + `\n\n*[${t('error')}: ${err.message}]*`,
            }));
          }
        },
        onDone: () => {
          setIsStreaming(false);
        },
      }
    );

    abortStreamRef.current = cancelStream;

    function updateAssistantMsg(updater: (prev: Message) => Message) {
      if (isIncognito) {
        setIncognitoMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? updater(m) : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? updater(m) : m))
        );
      }
    }
  };

  const handleApproveTool = async (
    approvalId: string,
    approved: boolean,
    rememberForChat?: boolean,
    approvalToken?: string
  ) => {
    try {
      await api.approveTool(approvalId, approved, rememberForChat, approvalToken);
      const updater = (prev: Message): Message => {
        if (!prev.toolCalls) return prev;
        return {
          ...prev,
          toolCalls: prev.toolCalls.map((tc) =>
            tc.approvalId === approvalId ? { ...tc, approvalPending: false } : tc
          ),
        };
      };
      if (isIncognito) {
        setIncognitoMessages((prev) => prev.map(updater));
      } else {
        setMessages((prev) => prev.map(updater));
      }
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  // Render Setup Wizard if initial setup is needed or navigated to /setup
  if (isSetupNeeded || isSetupOpen) {
    return (
      <SetupWizard
        onComplete={() => {
          setIsSetupNeeded(false);
          setIsSetupOpen(false);
          window.history.replaceState(null, '', '/');
          window.location.reload();
        }}
      />
    );
  }

  // Render Login Screen if not authenticated
  if (isAuthenticated === false) {
    return (
      <div
        className="app-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '360px',
            backgroundColor: 'var(--surface-1)',
            borderRadius: 'var(--r-l)',
            padding: '28px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <Lock size={22} color="var(--text)" strokeWidth={1.75} />
          </div>

          <h2
            style={{
              fontSize: '18px',
              fontWeight: 'var(--fw-medium)',
              marginBottom: '4px',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            }}
          >
            rrchat
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginBottom: '20px',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            }}
          >
            {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
              ? 'Enter access token (from .token file or server console)'
              : 'Enter access token'}
          </p>

          <form onSubmit={handleManualLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="password"
              placeholder="Access token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--r-m)',
                padding: '12px 14px',
                fontSize: '14px',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                outline: 'none',
              }}
            />

            {authError && (
              <div
                style={{
                  color: 'var(--danger)',
                  fontSize: '12px',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                }}
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="press"
              style={{
                width: '100%',
                height: '44px',
                backgroundColor: 'var(--selected)',
                color: 'var(--text)',
                border: 'none',
                borderRadius: 'var(--r-m)',
                fontSize: '14px',
                fontWeight: 'var(--fw-medium)',
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '4px',
                cursor: 'pointer',
              }}
            >
              <span>Connect</span>
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    );
  }


  return (
    <div
      className="app-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & drop visual feedback */}
      {isDraggingOver && (
        <div className="drag-overlay">
          <span style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 'var(--fw-medium)' }}>
            {t('dragFilesHere')}
          </span>
        </div>
      )}

      {/* Header */}
      <Header
        activeModelName={activeModelName}
        isIncognito={isIncognito}
        progressEvent={progressEvent}
        mode={mode}
        workDir={settingsData.workDir}
        workQuotaGB={settingsData.workQuotaGB}
        workUsedGB={settingsData.workUsedGB}
        isGuest={userRole === 'guest'}
        onGuestNotice={() => alert(t('fullModeOnly'))}
        onOpenSidebar={() => {
          setIsUsageOpen(false);
          setIsPlusMenuOpen(false);
          setIsSidebarOpen(true);
        }}
        onOpenModelSelector={() => {
          if (userRole === 'guest') {
            alert(t('fullModeOnly'));
            return;
          }
          setIsModelSelectorOpen((prev) => !prev);
        }}
        onNewChat={() => handleNewChat(mode)}
        onToggleIncognito={() => {
          setIsIncognito(!isIncognito);
          if (!isIncognito) {
            setIncognitoMessages([]);
          }
        }}
      />

      {/* Messages */}
      <MessageList
        messages={currentMessages}
        activeModelName={activeModelName}
        isStreaming={isStreaming}
        onEditMessage={handleEditMessage}
        onRegenerate={handleRegenerate}
        onDeleteMessage={handleDeleteMessage}
        onApproveTool={handleApproveTool}
        onPreviewTarget={setPreviewTarget}
        onOpenUsage={openUsageDrawer}
      />

      {/* Floating Bottom Input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        onStop={handleStopStream}
        onPasteFile={handleFileSelect}
        onPlusClick={() => {
          setIsSidebarOpen(false);
          setIsUsageOpen(false);
          setIsPlusMenuOpen(true);
        }}
        attachments={pendingAttachments}
        onRemoveAttachment={handleRemoveAttachment}
        isStreaming={isStreaming}
        disabled={!activeModelId}
        mode={mode}
        onModeChange={handleModeChange}
        showModeSwitcher={currentMessages.length === 0}
        workModeEnabled={userRole === 'guest' ? false : workModeEnabled}
        workModeAllowed={userRole === 'guest' ? false : workModeAllowed}
        isGuest={userRole === 'guest'}
        webSearchEnabled={webSearchEnabled}
      />

      {/* Plus Menu Bottom Sheet */}
      <PlusMenuSheet
        isOpen={isPlusMenuOpen}
        onClose={() => setIsPlusMenuOpen(false)}
        activeModel={activeModel}
        onFileSelect={handleFileSelect}
        mode={mode}
        onModeChange={handleModeChange}
        enableReasoning={enableReasoning}
        onToggleReasoning={setEnableReasoning}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={setReasoningEffort}
        contextUsedTokens={contextUsedTokens}
        maxContextTokens={activeModel?.contextTokens || 8192}
        workModeEnabled={userRole === 'guest' ? false : workModeEnabled}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={(val) => {
          setWebSearchEnabled(val);
          localStorage.setItem('rrchat_web_search', String(val));
        }}
        visionMode={visionMode}
        onVisionModeChange={setVisionMode}
        onOpenUsage={openUsageDrawer}
      />

      {/* Left Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chats={chats}
        activeChatId={activeChatId}
        isGuest={userRole === 'guest'}
        mode={mode}
        workModeEnabled={userRole === 'guest' ? false : workModeEnabled}
        onSelectChat={selectChat}
        onNewChat={(m) => handleNewChat(m)}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenDirectory={() => {
          if (userRole === 'guest') {
            alert(t('fullModeOnly'));
            return;
          }
          setIsDirectoryOpen(true);
        }}
      />

      {/* Right Slide-out Usage Drawer */}
      <UsageDrawer
        isOpen={isUsageOpen}
        onClose={() => setIsUsageOpen(false)}
        chatId={activeChatId}
        activeModel={activeModel || null}
        models={models}
        isGuest={userRole === 'guest'}
        temperature={temperature}
        onTemperatureChange={updateTemperature}
        topP={topP}
        onTopPChange={updateTopP}
        minP={minP}
        onMinPChange={updateMinP}
        chatSystemPrompt={chatSystemPrompt}
        onChatSystemPromptChange={updateChatSystemPrompt}
        autoCompact={autoCompact}
        onAutoCompactChange={updateAutoCompact}
        onRefreshModels={loadModels}
        onDeleteSession={() => {
          if (activeChatId) {
            handleDeleteChat(activeChatId);
          }
        }}
        onContextUpdated={() => {
          if (activeChatId) {
            selectChat(activeChatId);
          }
        }}
      />

      {/* Model Selector Sheet */}
      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        models={models}
        activeModelId={activeModelId}
        activeAuxModelId={activeAuxModelId}
        progressEvent={progressEvent}
        onSelectModel={handleSelectModel}
        onUnloadModel={handleUnloadModel}
        onSelectAuxModel={async (id) => {
          localStorage.setItem('local_ai_active_aux_model', id);
          await api.setActiveAuxModel(id);
          setActiveAuxModelId(id);
          loadModels();
        }}
        onLoadAuxModel={async (id, opts) => {
          try {
            await api.loadAuxModel(id, opts);
            setActiveAuxModelId(id);
            loadModels();
          } catch (err: any) {
            alert(`${t('failedOcrLoad')}: ${err.message}`);
          }
        }}
        onUnloadAuxModel={async () => {
          try {
            await api.unloadAuxModel();
            loadModels();
          } catch (err: any) {
            alert(`${t('error')}: ${err.message}`);
          }
        }}
        onUpdateModelSettings={async (id, settings) => {
          if (settings.role) {
            localStorage.setItem(`user_role_${id}`, settings.role);
          }
          await api.updateModelSettings(id, { ...settings, userRole: settings.role });
          loadModels();
        }}
        onRefresh={loadModels}
      />

      {/* Directory Full-Screen Scene */}
      <DirectoryScene
        isOpen={isDirectoryOpen}
        onClose={() => setIsDirectoryOpen(false)}
        onPreviewTarget={setPreviewTarget}
      />

      {/* Localhost Admin Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        isGuest={userRole === 'guest'}
        onClose={() => {
          setIsAdminOpen(false);
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
            window.history.replaceState(null, '', '/');
          }
        }}
      />

      {/* Document / File Preview Modal */}
      <PreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
};
