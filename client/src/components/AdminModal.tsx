import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  HardDrive,
  Cpu,
  Terminal,
  Palette,
  Folder,
  Key,
  Shield,
  MessageSquare,
  Info,
  Layers,
  ExternalLink,
  Upload,
  Trash2,
  Globe,
  FileCode,
  Monitor,
  Users,
  Eye,
  Lock,
} from 'lucide-react';
import { api } from '../api/client';
import { applyTheme, type ThemeName } from '../utils/theme';
import { useLanguage, setLanguage, t } from '../utils/i18n';
import type { ModelInfo } from '../types';
import { ErrorBoundary } from './ErrorBoundary';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  isGuest?: boolean;
}

type ScreenType =
  | 'main'
  | 'theme'
  | 'models'
  | 'directory'
  | 'token'
  | 'skills'
  | 'agent_settings'
  | 'context'
  | 'system';

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, isGuest = false }) => {
  const [activeScreen, setActiveScreen] = useState<ScreenType>('main');

  // Config data
  const [workDir, setWorkDir] = useState('');
  const [modelsDir, setModelsDir] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [maskedToken, setMaskedToken] = useState('••••••••');
  const [connectUrl, setConnectUrl] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [guestAccessToken, setGuestAccessToken] = useState('');
  const [guestConnectUrl, setGuestConnectUrl] = useState('');
  const [guestQrCodeUrl, setGuestQrCodeUrl] = useState('');
  const [guestTokenCopied, setGuestTokenCopied] = useState(false);
  const [guestUrlCopied, setGuestUrlCopied] = useState(false);
  const [isGuestRegenerating, setIsGuestRegenerating] = useState(false);
  const [isGuestRevoking, setIsGuestRevoking] = useState(false);

  // Guest chats inspection
  const [guestChats, setGuestChats] = useState<any[]>([]);
  const [guestChatsLoading, setGuestChatsLoading] = useState(false);
  const [guestChatsExpanded, setGuestChatsExpanded] = useState(false);
  const [selectedGuestChat, setSelectedGuestChat] = useState<{ chat: any; messages: any[] } | null>(null);
  const [loadingGuestChatDetails, setLoadingGuestChatDetails] = useState(false);

  const [modelsList, setModelsList] = useState<ModelInfo[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activeAuxModelId, setActiveAuxModelId] = useState<string | null>(null);

  // Theme
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem('rrchat_theme') as ThemeName) || 'red basic';
  });

  // Agent Settings state
  const [maxSteps, setMaxSteps] = useState(15);
  const [timeoutSec, setTimeoutSec] = useState(60);
  const [autoApprove, setAutoApprove] = useState(false);
  const [workQuotaGB, setWorkQuotaGB] = useState(5);
  const [workModeEnabled, setWorkModeEnabled] = useState(true);
  const [allowWorkOverTunnel, setAllowWorkOverTunnel] = useState(false);
  const [allowAdminOverTunnel, setAllowAdminOverTunnel] = useState(true);

  // Skills state
  const currentLang = useLanguage();
  const [agentWebSearch, setAgentWebSearch] = useState(true);
  const [skillsList, setSkillsList] = useState<any[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [uploadingSkill, setUploadingSkill] = useState(false);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  // Context pre-prompt state
  const [prePrompt, setPrePrompt] = useState('');
  const [prePromptSaved, setPrePromptSaved] = useState(false);

  // Directory editing state
  const [editWorkDir, setEditWorkDir] = useState('');
  const [dirSavedNotice, setDirSavedNotice] = useState(false);

  // Token copy & regenerate state
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);

  // Model settings editor state
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [modelContext, setModelContext] = useState<number>(16384);
  const [modelGpuLayers, setModelGpuLayers] = useState<number>(99);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSavedNotice, setModelSavedNotice] = useState(false);

  // System stats state
  const [systemStats, setSystemStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isAdminForbidden, setIsAdminForbidden] = useState(false);

  // Feedback banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      setSessionsList(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch {
      setSessionsList([]);
    }
  };

  const loadSkills = async () => {
    setLoadingSkills(true);
    try {
      const res = await api.getSkills();
      if (res?.skills) {
        setSkillsList(Array.isArray(res.skills) ? res.skills : []);
      } else {
        setSkillsList([]);
      }
    } catch (err) {
      console.warn('Failed to load skills:', err);
      setSkillsList([]);
    } finally {
      setLoadingSkills(false);
    }
  };

  const loadData = async () => {
    try {
      const data = await api.getAdminInfo();
      setIsAdminForbidden(false);
      if (data?.config) {
        if (data.config.workDir) {
          setWorkDir(data.config.workDir);
          setEditWorkDir(data.config.workDir);
        }
        if (data.config.modelsDir) setModelsDir(data.config.modelsDir);
        if (typeof data.config.workQuotaGB === 'number') setWorkQuotaGB(data.config.workQuotaGB);
        if (typeof data.config.maxAgentSteps === 'number') setMaxSteps(data.config.maxAgentSteps);
        if (typeof data.config.commandTimeoutSec === 'number') setTimeoutSec(data.config.commandTimeoutSec);
        if (typeof data.config.autoApproveCommands === 'boolean') setAutoApprove(data.config.autoApproveCommands);
        if (typeof data.config.workModeEnabled === 'boolean') setWorkModeEnabled(data.config.workModeEnabled);
        if (typeof data.config.allowWorkOverTunnel === 'boolean') setAllowWorkOverTunnel(data.config.allowWorkOverTunnel);
        if (typeof data.config.allowAdminOverTunnel === 'boolean') setAllowAdminOverTunnel(data.config.allowAdminOverTunnel);
        if (typeof data.config.userPrePrompt === 'string') setPrePrompt(data.config.userPrePrompt);
        if (data.config.theme) setCurrentTheme(data.config.theme as ThemeName);
        if (typeof data.config.agentWebSearch === 'boolean') setAgentWebSearch(data.config.agentWebSearch);
        if (data.config.language) setLanguage(data.config.language);
      }

      if (data?.plainToken) {
        setAccessToken(data.plainToken);
        setMaskedToken(`${data.plainToken.slice(0, 6)}••••`);
      }

      if (data?.connectUrl) setConnectUrl(data.connectUrl);
      if (data?.qrCodeDataUrl) setQrCodeUrl(data.qrCodeDataUrl);

      if (data?.plainGuestToken) {
        setGuestAccessToken(data.plainGuestToken);
      } else {
        setGuestAccessToken('');
      }
      if (data?.guestConnectUrl) setGuestConnectUrl(data.guestConnectUrl);
      else setGuestConnectUrl('');
      if (data?.guestQrCodeDataUrl) setGuestQrCodeUrl(data.guestQrCodeDataUrl);
      else setGuestQrCodeUrl('');
    } catch (err: any) {
      if (
        err?.status === 403 ||
        err?.code === 'admin_local_only' ||
        err?.message?.includes('admin_local_only') ||
        err?.message?.includes('компьютера') ||
        err?.message?.includes('403')
      ) {
        setIsAdminForbidden(true);
      }
      try {
        const localPrompt = localStorage.getItem('rrchat_user_preprompt');
        if (localPrompt) setPrePrompt(localPrompt);
      } catch {}
    }

    try {
      await loadSkills();
    } catch {}

    try {
      const res = await api.getModels();
      setModelsList(Array.isArray(res?.models) ? res.models : []);
      setActiveModelId(res?.activeModelId || null);
      setActiveAuxModelId(res?.activeAuxModelId || null);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveScreen('main');
      return;
    }
    loadData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeScreen === 'system') {
      setLoadingStats(true);
      api
        .getSystemStats()
        .then((stats) => setSystemStats(stats))
        .catch(() => setSystemStats(null))
        .finally(() => setLoadingStats(false));
    }
  }, [isOpen, activeScreen]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeScreen === 'token') {
      loadSessions();
    }
  }, [isOpen, activeScreen]);

  if (!isOpen) return null;

  // Handlers
  const handleThemeSelect = async (themeName: ThemeName) => {
    setCurrentTheme(themeName);
    applyTheme(themeName);
    try {
      await api.updateConfig({ theme: themeName });
      showToast(`${t('themeApplied')}: ${themeName}`);
    } catch {
      // ignore
    }
  };

  const handleSaveWorkDir = async () => {
    if (!editWorkDir.trim()) return;
    try {
      const res = await api.updateConfig({ workDir: editWorkDir.trim() });
      if (res?.config?.workDir) {
        setWorkDir(res.config.workDir);
        setDirSavedNotice(true);
        setTimeout(() => setDirSavedNotice(false), 2000);
        showToast(t('workDirSaved'));
      }
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  const handleCopyToken = () => {
    if (!accessToken) return;
    navigator.clipboard.writeText(accessToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
    showToast(t('tokenCopiedToast'));
  };

  const handleCopyUrl = () => {
    if (!connectUrl) return;
    navigator.clipboard.writeText(connectUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
    showToast(t('urlCopiedToast'));
  };

  const handleRegenerateToken = async () => {
    if (!confirm(t('regenTokenConfirmText'))) {
      return;
    }
    setIsRegenerating(true);
    try {
      const res = await api.regenerateToken();
      if (res?.plainToken) {
        setAccessToken(res.plainToken);
        setMaskedToken(`${res.plainToken.slice(0, 6)}••••`);
        await loadData();
        showToast(t('newTokenGenerated'));
      }
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await api.revokeSession(id);
      await loadSessions();
      showToast(t('saved'));
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  const handleGenerateGuestToken = async () => {
    setIsGuestRegenerating(true);
    try {
      const res = await api.generateGuestToken();
      if (res?.plainGuestToken) {
        setGuestAccessToken(res.plainGuestToken);
        setGuestConnectUrl(res.guestConnectUrl);
        setGuestQrCodeUrl(res.guestQrCodeDataUrl);
        showToast(t('guestTokenCreatedToast'));
      }
      await loadSessions();
    } catch (err: any) {
      showToast(err.message || t('error'));
    } finally {
      setIsGuestRegenerating(false);
    }
  };

  const handleRevokeGuestToken = async () => {
    if (!confirm(t('revokeGuestConfirmText'))) {
      return;
    }
    setIsGuestRevoking(true);
    try {
      await api.revokeGuestToken();
      setGuestAccessToken('');
      setGuestConnectUrl('');
      setGuestQrCodeUrl('');
      showToast(t('guestTokenRevokedToast'));
      await loadSessions();
    } catch (err: any) {
      showToast(err.message || t('error'));
    } finally {
      setIsGuestRevoking(false);
    }
  };

  const handleCopyGuestToken = () => {
    if (!guestAccessToken) return;
    navigator.clipboard.writeText(guestAccessToken);
    setGuestTokenCopied(true);
    setTimeout(() => setGuestTokenCopied(false), 2000);
    showToast(t('tokenCopiedToast'));
  };

  const handleCopyGuestUrl = () => {
    if (!guestConnectUrl) return;
    navigator.clipboard.writeText(guestConnectUrl);
    setGuestUrlCopied(true);
    setTimeout(() => setGuestUrlCopied(false), 2000);
    showToast(t('urlCopiedToast'));
  };

  const loadGuestChats = async () => {
    setGuestChatsLoading(true);
    try {
      const res = await api.getGuestChats();
      setGuestChats(Array.isArray(res?.chats) ? res.chats : []);
    } catch {
      setGuestChats([]);
    } finally {
      setGuestChatsLoading(false);
    }
  };

  const handleToggleGuestChats = () => {
    const next = !guestChatsExpanded;
    setGuestChatsExpanded(next);
    if (next) {
      loadGuestChats();
    }
  };

  const handleOpenGuestChat = async (chatId: string) => {
    setLoadingGuestChatDetails(true);
    try {
      const res = await api.getGuestChat(chatId);
      setSelectedGuestChat(res);
    } catch {
      showToast(t('loadGuestChatError'));
    } finally {
      setLoadingGuestChatDetails(false);
    }
  };

  const handleDeleteGuestChat = async (chatId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(t('deleteGuestChatConfirm'))) return;
    try {
      await api.deleteGuestChat(chatId);
      setGuestChats((prev) => prev.filter((c) => c.id !== chatId));
      if (selectedGuestChat?.chat?.id === chatId) {
        setSelectedGuestChat(null);
      }
      showToast(t('guestChatDeletedToast'));
    } catch {
      showToast(t('guestChatDeleteError'));
    }
  };

  const handleToggleSkill = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await api.toggleSkill(id, !currentEnabled);
      if (res?.skills) {
        setSkillsList(res.skills);
      } else {
        setSkillsList((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !currentEnabled } : s)));
      }
      showToast(t('saved'));
    } catch (err: any) {
      showToast(err.message || t('error'));
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm(t('deleteSkillConfirm'))) return;
    try {
      const res = await api.deleteSkill(id);
      if (res?.skills) {
        setSkillsList(res.skills);
      } else {
        setSkillsList((prev) => prev.filter((s) => s.id !== id));
      }
      showToast(t('skillDeleted'));
    } catch (err: any) {
      showToast(err.message || t('error'));
    }
  };

  const handleUploadSkillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploadingSkill(true);
    try {
      const res = await api.uploadSkill(file);
      if (res?.skills) {
        setSkillsList(res.skills);
      }
      showToast(t('skillInstalled'));
    } catch (err: any) {
      showToast(err.message || t('error'));
    } finally {
      setUploadingSkill(false);
      e.target.value = '';
    }
  };

  const handleUpdateAgentSetting = async (delta: {
    maxAgentSteps?: number;
    commandTimeoutSec?: number;
    autoApproveCommands?: boolean;
    workQuotaGB?: number;
    workModeEnabled?: boolean;
    allowWorkOverTunnel?: boolean;
    allowAdminOverTunnel?: boolean;
  }) => {
    if (typeof delta.maxAgentSteps === 'number') setMaxSteps(delta.maxAgentSteps);
    if (typeof delta.commandTimeoutSec === 'number') setTimeoutSec(delta.commandTimeoutSec);
    if (typeof delta.autoApproveCommands === 'boolean') setAutoApprove(delta.autoApproveCommands);
    if (typeof delta.workQuotaGB === 'number') setWorkQuotaGB(delta.workQuotaGB);
    if (typeof delta.workModeEnabled === 'boolean') setWorkModeEnabled(delta.workModeEnabled);
    if (typeof delta.allowWorkOverTunnel === 'boolean') setAllowWorkOverTunnel(delta.allowWorkOverTunnel);
    if (typeof delta.allowAdminOverTunnel === 'boolean') setAllowAdminOverTunnel(delta.allowAdminOverTunnel);

    try {
      await api.updateConfig(delta);
    } catch {
      // ignore
    }
  };

  const handleSavePrePrompt = async () => {
    localStorage.setItem('rrchat_user_preprompt', prePrompt);
    try {
      await api.updateConfig({ userPrePrompt: prePrompt });
      setPrePromptSaved(true);
      setTimeout(() => setPrePromptSaved(false), 2000);
      showToast(t('instructionsSavedToast'));
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  const handleSelectModelToConfigure = async (model: ModelInfo) => {
    setSelectedModel(model);
    try {
      const settings = await api.getModelSettings(model.id);
      setModelContext(settings?.contextTokens || 16384);
      setModelGpuLayers(typeof settings?.gpuLayers === 'number' ? settings.gpuLayers : 99);
    } catch {
      setModelContext(16384);
      setModelGpuLayers(99);
    }
  };

  const handleSaveModelSettings = async () => {
    if (!selectedModel) return;
    try {
      await api.updateModelSettings(selectedModel.id, {
        contextTokens: modelContext,
        gpuLayers: modelGpuLayers,
      });
      setModelSavedNotice(true);
      setTimeout(() => setModelSavedNotice(false), 2000);
      showToast(`${t('modelSettingsSavedToast')} (${selectedModel.name})`);
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    }
  };

  const handleToggleLoadModel = async (model: ModelInfo) => {
    setModelLoading(true);
    try {
      if (model.id === activeModelId) {
        await api.unloadModel(model.id);
        setActiveModelId(null);
        showToast(`${t('modelUnloadedToast')}: ${model.name}`);
      } else {
        await api.loadModel(model.id, { contextTokens: modelContext, gpuLayers: modelGpuLayers });
        setActiveModelId(model.id);
        showToast(`${t('modelLoadedToast')}: ${model.name}`);
      }
      await loadData();
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    } finally {
      setModelLoading(false);
    }
  };

  const handleToggleAuxModel = async (model: ModelInfo) => {
    setModelLoading(true);
    try {
      if (model.id === activeAuxModelId) {
        await api.unloadAuxModel();
        await api.setActiveAuxModel(null);
        setActiveAuxModelId(null);
        showToast(t('auxModelDisabledToast'));
      } else {
        await api.setActiveAuxModel(model.id);
        await api.loadAuxModel(model.id);
        setActiveAuxModelId(model.id);
        showToast(`${t('auxModelAssignedToast')}: ${model.name}`);
      }
      await loadData();
    } catch (err: any) {
      alert(`${t('error')}: ${err.message}`);
    } finally {
      setModelLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--surface-3)',
        color: 'var(--text)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--sp-4)',
        paddingTop: 'calc(var(--sp-4) + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(var(--sp-4) + env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
      }}
    >
      <ErrorBoundary fallbackTitle={t('settingsModalError')} onReset={onClose}>
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          }}
        >
        {/* Top Bar Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '40px',
            marginBottom: '16px',
            flexShrink: 0,
          }}
        >
          {activeScreen === 'main' ? (
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
          ) : (
            <button
              type="button"
              className="press"
              onClick={() => {
                if (selectedModel) {
                  setSelectedModel(null);
                } else {
                  setActiveScreen('main');
                }
              }}
              aria-label="Back"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 'var(--fw-medium)',
                padding: '4px 0',
              }}
            >
              <ChevronLeft size={18} strokeWidth={1.75} />
              <span>
                {selectedModel
                  ? selectedModel.name
                  : activeScreen === 'theme'
                  ? t('themeScreenTitle')
                  : activeScreen === 'models'
                  ? t('modelsScreenTitle')
                  : activeScreen === 'directory'
                  ? t('directoryScreenTitle')
                  : activeScreen === 'token'
                  ? t('tokenScreenTitle')
                  : activeScreen === 'skills'
                  ? t('skillsScreenTitle')
                  : activeScreen === 'agent_settings'
                  ? t('agentSettingsScreenTitle')
                  : activeScreen === 'context'
                  ? t('contextScreenTitle')
                  : t('systemScreenTitle')}
              </span>
            </button>
          )}

          <button
            type="button"
            className="press"
            onClick={onClose}
            aria-label="Close settings"
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

        {/* Toast notification banner */}
        {toastMessage && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--r-m)',
              fontSize: '12px',
              color: 'var(--text)',
              textAlign: 'center',
              marginBottom: '12px',
            }}
          >
            {toastMessage}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: MAIN SETTINGS (Screen 07) */}
        {/* ======================================================== */}
        {activeScreen === 'main' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              flex: 1,
            }}
          >

            {/* Row 0: Language */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Globe size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('language')}</span>
              </div>
              <div
                className="segmented"
                style={
                  {
                    width: '150px',
                    '--n': 2,
                    '--i': currentLang === 'en' ? 0 : 1,
                  } as React.CSSProperties
                }
              >
                <button
                  type="button"
                  data-active={currentLang === 'en'}
                  onClick={() => {
                    setLanguage('en');
                    api.updateConfig({ language: 'en' });
                  }}
                >
                  English
                </button>
                <button
                  type="button"
                  data-active={currentLang === 'ru'}
                  onClick={() => {
                    setLanguage('ru');
                    api.updateConfig({ language: 'ru' });
                  }}
                >
                  Русский
                </button>
              </div>
            </div>

            {/* Row 1: Theme */}
            <div
              className="press"
              onClick={() => setActiveScreen('theme')}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Palette size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('theme')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{currentTheme}</span>
                <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
              </div>
            </div>

            {/* Row 2: Models */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('models');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Layers size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('models')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {Array.isArray(modelsList) ? modelsList.length : 0}
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Row 3: Directory */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('directory');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <Folder size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)', flexShrink: 0 }}>{t('directory')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '180px',
                        textAlign: 'right',
                      }}
                    >
                      {workDir}
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Row 4: Access Token */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('token');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('accessToken')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{maskedToken}</span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Row 5: Skills */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                loadSkills();
                setActiveScreen('skills');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('skills')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {Array.isArray(skillsList) ? skillsList.filter((s) => s?.enabled).length : 0}
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Row 6: Agent Settings */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('agent_settings');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('agentSettings')}</span>
              </div>
              {isGuest ? (
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
              ) : (
                <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
              )}
            </div>

            {/* Row 7: Personal Context/Pre-Prompt */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('context');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                <MessageSquare size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('contextScreenTitle')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      {prePrompt ? `${prePrompt.length} ${t('charsCount')}` : t('emptyChars')}
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Row 8: Version & System */}
            <div
              className="press"
              onClick={() => {
                if (isGuest) {
                  showToast(t('fullModeOnly'));
                  return;
                }
                setActiveScreen('system');
              }}
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                cursor: isGuest ? 'default' : 'pointer',
                opacity: isGuest ? 0.45 : 1,
              }}
              title={isGuest ? t('fullModeOnly') : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Info size={16} strokeWidth={1.75} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('systemScreenTitle')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGuest ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{t('fullModeOnly')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>0.1</span>
                    <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                  </>
                )}
              </div>
            </div>

            {/* Bottom 3 Links: Author, rrchat, System */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginTop: 'auto',
                paddingTop: '24px',
              }}
            >
              <a
                href="https://github.com/leftik1"
                target="_blank"
                rel="noopener noreferrer"
                className="press"
                style={{
                  height: '44px',
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text)',
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                }}
              >
                Author
              </a>
              <a
                href="https://github.com/leftik1/rrchat"
                target="_blank"
                rel="noopener noreferrer"
                className="press"
                style={{
                  height: '44px',
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text)',
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                }}
              >
                rrchat
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveScreen('system');
                }}
                className="press"
                style={{
                  height: '44px',
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text)',
                  fontSize: 'var(--fs-base)',
                  textDecoration: 'none',
                }}
              >
                System
              </a>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: THEME */}
        {/* ======================================================== */}
        {activeScreen === 'theme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {(['red basic', 'dark minimal', 'oled pure'] as ThemeName[]).map((themeItem) => {
              const isSelected = currentTheme === themeItem;
              return (
                <div
                  key={themeItem}
                  className="press"
                  onClick={() => handleThemeSelect(themeItem)}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    border: isSelected ? '1px solid var(--selected)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: isSelected ? 'var(--fw-medium)' : 'normal' }}>
                      {themeItem === 'red basic' ? 'Red Basic (Default)' : themeItem === 'dark minimal' ? 'Dark Minimal' : 'OLED Pure Black'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {themeItem === 'red basic'
                        ? t('redBasicDesc')
                        : themeItem === 'dark minimal'
                        ? t('darkMinimalDesc')
                        : t('oledPureDesc')}
                    </span>
                  </div>
                  {isSelected && <Check size={18} strokeWidth={2} color="var(--text)" />}
                </div>
              );
            })}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: DIRECTORY */}
        {/* ======================================================== */}
        {activeScreen === 'directory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              {t('workDirDesc')}
            </div>
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
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Work Directory Path
              </label>
              <input
                type="text"
                value={editWorkDir}
                onChange={(e) => setEditWorkDir(e.target.value)}
                placeholder="C:/ai-work"
                style={{
                  width: '100%',
                  fontSize: '14px',
                  color: 'var(--text)',
                  backgroundColor: 'var(--surface-3)',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-s)',
                  border: 'none',
                }}
              />
            </div>

            <button
              type="button"
              className="press"
              onClick={handleSaveWorkDir}
              style={{
                height: '44px',
                backgroundColor: 'var(--selected)',
                borderRadius: 'var(--r-m)',
                border: 'none',
                color: 'var(--text)',
                fontSize: '14px',
                fontWeight: 'var(--fw-medium)',
                cursor: 'pointer',
              }}
            >
              {dirSavedNotice ? 'Saved!' : 'Save Directory'}
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: ACCESS TOKEN */}
        {/* ======================================================== */}
        {activeScreen === 'token' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            {/* Full Token Card */}
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Security Token
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={handleCopyToken}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: tokenCopied ? 'var(--text-2)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {tokenCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{tokenCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font)',
                  fontSize: '13px',
                  color: 'var(--text)',
                  wordBreak: 'break-all',
                  backgroundColor: 'var(--surface-3)',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-s)',
                }}
              >
                {accessToken || 'No token available'}
              </div>
            </div>

            {/* QR Code / LAN Connect Card */}
            {connectUrl && (
              <div
                style={{
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 'var(--r-m)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t('scanQrWifiDesc')}
                </div>
                {qrCodeUrl && (
                  <img
                    src={qrCodeUrl}
                    alt="Connection QR Code"
                    style={{
                      width: '180px',
                      height: '180px',
                      borderRadius: 'var(--r-m)',
                      border: '4px solid var(--surface-1)',
                    }}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                  <input
                    type="text"
                    readOnly
                    value={connectUrl}
                    style={{
                      flex: 1,
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--surface-3)',
                      padding: '8px 10px',
                      borderRadius: 'var(--r-s)',
                    }}
                  />
                  <button
                    type="button"
                    className="press"
                    onClick={handleCopyUrl}
                    style={{
                      height: '34px',
                      padding: '0 12px',
                      backgroundColor: 'var(--surface-1)',
                      border: 'none',
                      borderRadius: 'var(--r-s)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {urlCopied ? <Check size={14} /> : <Copy size={14} />}
                    <span>URL</span>
                  </button>
                </div>
              </div>
            )}

            {/* Guest Token Card */}
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '12px', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                    {t('guestTokenLabel')}
                  </span>
                  {guestAccessToken ? (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-2)',
                        backgroundColor: 'var(--surface-1)',
                        padding: '1px 6px',
                        borderRadius: 'var(--r-pill)',
                      }}
                    >
                      {t('activeBadge')}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-dim)',
                        backgroundColor: 'var(--surface-3)',
                        padding: '1px 6px',
                        borderRadius: 'var(--r-pill)',
                      }}
                    >
                      {t('notCreatedBadge')}
                    </span>
                  )}
                </div>

                {guestAccessToken && (
                  <button
                    type="button"
                    className="press"
                    onClick={handleCopyGuestToken}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: guestTokenCopied ? 'var(--text-2)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {guestTokenCopied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{guestTokenCopied ? t('copied') : t('copy')}</span>
                  </button>
                )}
              </div>

              {guestAccessToken ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'var(--text)',
                      wordBreak: 'break-all',
                      backgroundColor: 'var(--surface-3)',
                      padding: '8px 10px',
                      borderRadius: 'var(--r-s)',
                    }}
                  >
                    {guestAccessToken}
                  </div>

                  {guestQrCodeUrl && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                      <img
                        src={guestQrCodeUrl}
                        alt="Guest QR Code"
                        style={{
                          width: '160px',
                          height: '160px',
                          borderRadius: 'var(--r-m)',
                          border: '4px solid var(--surface-1)',
                        }}
                      />
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
                        {t('scanGuestQrDesc')}
                      </div>
                    </div>
                  )}

                  {guestConnectUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <input
                        type="text"
                        readOnly
                        value={guestConnectUrl}
                        style={{
                          flex: 1,
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--surface-3)',
                          padding: '8px 10px',
                          borderRadius: 'var(--r-s)',
                        }}
                      />
                      <button
                        type="button"
                        className="press"
                        onClick={handleCopyGuestUrl}
                        style={{
                          height: '34px',
                          padding: '0 12px',
                          backgroundColor: 'var(--surface-1)',
                          border: 'none',
                          borderRadius: 'var(--r-s)',
                          color: 'var(--text)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {guestUrlCopied ? <Check size={14} /> : <Copy size={14} />}
                        <span>URL</span>
                      </button>
                    </div>
                  )}

                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {t('guestModeNoticeDesc')}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="press"
                      disabled={isGuestRegenerating}
                      onClick={handleGenerateGuestToken}
                      style={{
                        flex: 1,
                        height: '36px',
                        backgroundColor: 'var(--surface-1)',
                        border: '1px solid var(--hairline)',
                        borderRadius: 'var(--r-s)',
                        color: 'var(--text)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <RefreshCw size={13} className={isGuestRegenerating ? 'spin' : ''} />
                      <span>{t('regenerateBtn')}</span>
                    </button>

                    <button
                      type="button"
                      className="press"
                      disabled={isGuestRevoking}
                      onClick={handleRevokeGuestToken}
                      style={{
                        flex: 1,
                        height: '36px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--danger)',
                        borderRadius: 'var(--r-s)',
                        color: 'var(--danger)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Trash2 size={13} />
                      <span>{t('revokeGuestTokenAction')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t('guestTokensHelp')}
                  </div>
                  <button
                    type="button"
                    className="press"
                    disabled={isGuestRegenerating}
                    onClick={handleGenerateGuestToken}
                    style={{
                      height: '38px',
                      backgroundColor: 'var(--surface-1)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--r-s)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Users size={14} />
                    <span>{t('createGuestTokenBtn')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Collapsible Guest Chats Inspection Section */}
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                className="press"
                onClick={handleToggleGuestChats}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '12px', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                    {t('guestChatsHeader')} {guestChats.length > 0 ? `(${guestChats.length})` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {guestChatsLoading && <RefreshCw size={13} className="spin" color="var(--text-muted)" />}
                  {guestChatsExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                </div>
              </div>

              {guestChatsExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                  {guestChats.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '6px 0' }}>
                      {guestChatsLoading ? t('loading') : t('noGuestChatsFound')}
                    </div>
                  ) : (
                    guestChats.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          backgroundColor: 'var(--surface-3)',
                          padding: '10px 12px',
                          borderRadius: 'var(--r-s)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div
                          onClick={() => handleOpenGuestChat(c.id)}
                          style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1, cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 'var(--fw-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.title || t('newChat')}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)', backgroundColor: 'var(--surface-1)', padding: '1px 5px', borderRadius: 'var(--r-pill)' }}>
                              {c.messageCount ?? 0} {t('messagesCount')}
                            </span>
                          </div>
                          {c.lastSnippet && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.lastSnippet}
                            </div>
                          )}
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                            {new Date(c.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="press"
                            onClick={() => handleOpenGuestChat(c.id)}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: 'var(--surface-1)',
                              border: 'none',
                              borderRadius: 'var(--r-s)',
                              color: 'var(--text)',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Eye size={12} />
                            <span>{t('openBtn')}</span>
                          </button>
                          <button
                            type="button"
                            className="press"
                            onClick={(e) => handleDeleteGuestChat(c.id, e)}
                            style={{
                              padding: '6px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--hairline)',
                              borderRadius: 'var(--r-s)',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Active Sessions List */}
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Active Sessions ({Array.isArray(sessionsList) ? sessionsList.length : 0})
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={loadSessions}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>

              {(!Array.isArray(sessionsList) || sessionsList.length === 0) ? (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', padding: '6px 0' }}>
                  No active sessions found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Array.isArray(sessionsList) && sessionsList.map((s) => (
                    <div
                      key={s.id_hash || s.id}
                      style={{
                        backgroundColor: 'var(--surface-3)',
                        padding: '10px 12px',
                        borderRadius: 'var(--r-s)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 'var(--fw-medium)' }}>
                            {s.is_current ? t('thisDevice') : s.access_class || t('remoteDevice')}
                          </span>
                          {s.role === 'guest' ? (
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-dim)',
                                backgroundColor: 'var(--surface-1)',
                                padding: '1px 6px',
                                borderRadius: 'var(--r-pill)',
                              }}
                            >
                              {t('guestLabel')}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                backgroundColor: 'var(--surface-1)',
                                padding: '1px 6px',
                                borderRadius: 'var(--r-pill)',
                              }}
                            >
                              {t('adminLabel')}
                            </span>
                          )}
                          {s.is_current && (
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-2)',
                                backgroundColor: 'var(--surface-1)',
                                padding: '1px 6px',
                                borderRadius: 'var(--r-pill)',
                              }}
                            >
                              {t('currentDeviceBadge')}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={s.user_agent}
                        >
                          {s.user_agent ? s.user_agent.slice(0, 48) : 'Unknown browser'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          Last seen: {new Date(s.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {!s.is_current && (
                        <button
                          type="button"
                          className="press"
                          onClick={() => handleRevokeSession(s.id_hash || s.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--danger)',
                            borderRadius: 'var(--r-s)',
                            color: 'var(--danger)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Regenerate Token Button */}
            <button
              type="button"
              className="press"
              disabled={isRegenerating}
              onClick={handleRegenerateToken}
              style={{
                height: '42px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                border: '1px solid var(--hairline)',
                color: 'var(--danger)',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: 'auto',
              }}
            >
              <RefreshCw size={14} className={isRegenerating ? 'spin' : ''} />
              <span>Regenerate Token</span>
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: SKILLS */}
        {/* ======================================================== */}
        {activeScreen === 'skills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
            {/* Hidden file input for .md and .zip uploads */}
            <input
              type="file"
              ref={skillFileInputRef}
              accept=".md,.zip"
              style={{ display: 'none' }}
              onChange={handleUploadSkillFile}
            />

            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                  {t('skillsTitle')}
                </span>
                <button
                  type="button"
                  className="press"
                  disabled={uploadingSkill}
                  onClick={() => skillFileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--r-s)',
                    border: 'none',
                    background: 'var(--selected)',
                    color: 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} strokeWidth={2} />
                  <span>{uploadingSkill ? t('loading') : t('uploadSkillBtn')}</span>
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {t('skillsDesc')}
              </p>
            </div>

            {/* List of skills */}
            {loadingSkills ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {t('loading')}
              </div>
            ) : (!Array.isArray(skillsList) || skillsList.length === 0) ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                {t('noSkills')}
              </div>
            ) : (
              (Array.isArray(skillsList) ? skillsList : []).map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileCode size={15} color="var(--accent)" strokeWidth={2} />
                      <span style={{ fontSize: '14px', fontWeight: 'var(--fw-medium)', color: 'var(--text)' }}>
                        {skill.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: 'var(--r-s)',
                          background: 'var(--surface-3)',
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {skill.filename}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        role="switch"
                        aria-checked={skill.enabled}
                        className="toggle-switch"
                        data-checked={skill.enabled}
                        onClick={() => handleToggleSkill(skill.id, skill.enabled)}
                      >
                        <div className="toggle-switch-thumb" />
                      </div>
                      <button
                        type="button"
                        className="press"
                        onClick={() => handleDeleteSkill(skill.id)}
                        title={t('delete')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>

                  {skill.description && (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      {skill.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: AGENT SETTINGS */}
        {/* ======================================================== */}
        {activeScreen === 'agent_settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {/* Agent Web Search */}
            <div
              style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 'var(--fw-medium)' }}>
                  {t('agentWebSearch')}
                </span>
                <div
                  className="toggle-switch"
                  data-checked={agentWebSearch}
                  onClick={() => {
                    const newVal = !agentWebSearch;
                    setAgentWebSearch(newVal);
                    api.updateConfig({ agentWebSearch: newVal });
                    showToast(t('saved'));
                  }}
                >
                  <div className="toggle-switch-thumb" />
                </div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {t('agentWebSearchDesc')}
              </span>
            </div>

            {/* Max steps */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('maxAgentSteps')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ maxAgentSteps: Math.max(5, maxSteps - 5) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text)', minWidth: '24px', textAlign: 'center' }}>
                  {maxSteps}
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ maxAgentSteps: Math.min(50, maxSteps + 5) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Command timeout */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('commandTimeout')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ commandTimeoutSec: Math.max(10, timeoutSec - 10) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text)', minWidth: '32px', textAlign: 'center' }}>
                  {timeoutSec}s
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ commandTimeoutSec: Math.min(180, timeoutSec + 10) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Auto-approve commands */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('autoApprove')}</span>
              <div
                className="toggle-switch"
                data-checked={autoApprove}
                onClick={() => handleUpdateAgentSetting({ autoApproveCommands: !autoApprove })}
              >
                <div className="toggle-switch-thumb" />
              </div>
            </div>

            {/* Quota */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('workQuota')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ workQuotaGB: Math.max(1, workQuotaGB - 1) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  -
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text)', minWidth: '32px', textAlign: 'center' }}>
                  {workQuotaGB} GB
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={() => handleUpdateAgentSetting({ workQuotaGB: Math.min(50, workQuotaGB + 1) })}
                  style={{
                    background: 'var(--surface-3)',
                    border: 'none',
                    color: 'var(--text)',
                    borderRadius: 'var(--r-s)',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Work Mode Toggle */}
            <div
              style={{
                height: '48px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('workModeEnabledLabel')}</span>
              <div
                className="toggle-switch"
                data-checked={workModeEnabled}
                onClick={() => handleUpdateAgentSetting({ workModeEnabled: !workModeEnabled })}
              >
                <div className="toggle-switch-thumb" />
              </div>
            </div>

            {/* Allow work mode over tunnel toggle */}
            <div
              style={{
                height: 'auto',
                minHeight: '44px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                  {t('workModeOverTunnel')}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {t('workModeOverTunnelWarn')}
                </span>
              </div>
              <div
                className="toggle-switch"
                data-checked={allowWorkOverTunnel}
                onClick={() => handleUpdateAgentSetting({ allowWorkOverTunnel: !allowWorkOverTunnel })}
              >
                <div className="toggle-switch-thumb" />
              </div>
            </div>

            {/* Allow admin settings over tunnel toggle */}
            <div
              style={{
                height: 'auto',
                minHeight: '44px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                  {t('adminOverTunnel')}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {t('adminOverTunnelDesc')}
                </span>
              </div>
              <div
                className="toggle-switch"
                data-checked={allowAdminOverTunnel}
                onClick={() => handleUpdateAgentSetting({ allowAdminOverTunnel: !allowAdminOverTunnel })}
              >
                <div className="toggle-switch-thumb" />
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: PERSONAL CONTEXT / PRE-PROMPT */}
        {/* ======================================================== */}
        {activeScreen === 'context' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              {t('prePromptDesc')}
            </div>
            <textarea
              value={prePrompt}
              onChange={(e) => setPrePrompt(e.target.value)}
              placeholder={t('prePromptInputPlaceholder')}
              style={{
                width: '100%',
                minHeight: '180px',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-m)',
                border: 'none',
                color: 'var(--text)',
                fontSize: '14px',
                padding: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none',
                lineHeight: '1.5',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '11px', color: 'var(--text-dim)' }}>
              {prePrompt.length} {t('charsCount')}
            </div>
            <button
              type="button"
              className="press"
              onClick={handleSavePrePrompt}
              style={{
                height: '44px',
                backgroundColor: 'var(--selected)',
                borderRadius: 'var(--r-m)',
                border: 'none',
                color: 'var(--text)',
                fontSize: '14px',
                fontWeight: 'var(--fw-medium)',
                cursor: 'pointer',
              }}
            >
              {prePromptSaved ? t('instructionsSaved') : t('saveInstructions')}
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: MODELS LIST & MODEL CONFIG */}
        {/* ======================================================== */}
        {activeScreen === 'models' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {selectedModel ? (
              /* Selected Model Configuration */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 'var(--fw-medium)' }}>
                    {selectedModel.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t('sizeLabel')}: {selectedModel.sizeFormatted || (selectedModel.sizeBytes ? `${(selectedModel.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : '—')} · {t('quantLabel')}: {selectedModel.quantization || 'Q4'}
                  </div>
                </div>

                {/* Context tokens row */}
                <div
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>{t('contextWindowLabel')}</span>
                  <select
                    value={modelContext}
                    onChange={(e) => setModelContext(Number(e.target.value))}
                    style={{
                      backgroundColor: 'var(--surface-3)',
                      color: 'var(--text)',
                      borderRadius: 'var(--r-s)',
                      padding: '6px 10px',
                      fontSize: '13px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={4096}>4 096</option>
                    <option value={8192}>8 192</option>
                    <option value={16384}>16 384</option>
                    <option value={32768}>32 768</option>
                    <option value={65536}>65 536</option>
                  </select>
                </div>

                {/* GPU layers row */}
                <div
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '14px', color: 'var(--text)' }}>GPU Layers</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="press"
                      onClick={() => setModelGpuLayers((p) => Math.max(0, p - 10))}
                      style={{
                        background: 'var(--surface-3)',
                        border: 'none',
                        color: 'var(--text)',
                        borderRadius: 'var(--r-s)',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                      }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '14px', color: 'var(--text)', minWidth: '32px', textAlign: 'center' }}>
                      {modelGpuLayers}
                    </span>
                    <button
                      type="button"
                      className="press"
                      onClick={() => setModelGpuLayers((p) => Math.min(99, p + 10))}
                      style={{
                        background: 'var(--surface-3)',
                        border: 'none',
                        color: 'var(--text)',
                        borderRadius: 'var(--r-s)',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Save model settings button */}
                <button
                  type="button"
                  className="press"
                  onClick={handleSaveModelSettings}
                  style={{
                    height: '42px',
                    backgroundColor: 'var(--surface-2)',
                    borderRadius: 'var(--r-m)',
                    border: '1px solid var(--hairline)',
                    color: 'var(--text)',
                    fontSize: '13px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                  }}
                >
                  {modelSavedNotice ? t('saved') : t('saveSettingsBtn')}
                </button>

                {/* Action buttons: Load / Aux */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="press"
                    disabled={modelLoading}
                    onClick={() => handleToggleLoadModel(selectedModel)}
                    style={{
                      flex: 1,
                      height: '44px',
                      backgroundColor: selectedModel.id === activeModelId ? 'var(--surface-1)' : 'var(--selected)',
                      borderRadius: 'var(--r-m)',
                      border: 'none',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedModel.id === activeModelId ? t('unloadModel') : t('loadAsMain')}
                  </button>

                  <button
                    type="button"
                    className="press"
                    disabled={modelLoading}
                    onClick={() => handleToggleAuxModel(selectedModel)}
                    style={{
                      flex: 1,
                      height: '44px',
                      backgroundColor: selectedModel.id === activeAuxModelId ? 'var(--surface-1)' : 'var(--surface-2)',
                      borderRadius: 'var(--r-m)',
                      border: '1px solid var(--hairline)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontWeight: 'var(--fw-medium)',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedModel.id === activeAuxModelId ? t('removeAux') : t('setAsAux')}
                  </button>
                </div>
              </div>
            ) : (
              /* Models list */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(Array.isArray(modelsList) ? modelsList : []).map((m) => {
                  const isMain = m.id === activeModelId;
                  const isAux = m.id === activeAuxModelId;
                  return (
                    <div
                      key={m.id}
                      className="press"
                      onClick={() => handleSelectModelToConfigure(m)}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--surface-2)',
                        borderRadius: 'var(--r-m)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: 'var(--r-pill)',
                            backgroundColor: isMain ? '#4ade80' : isAux ? '#38bdf8' : 'var(--text-dim)',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '13px',
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isMain && (
                          <span style={{ fontSize: '11px', color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            Main
                          </span>
                        )}
                        {isAux && (
                          <span style={{ fontSize: '11px', color: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            Aux
                          </span>
                        )}
                        <ChevronRight size={15} strokeWidth={1.75} color="var(--text-dim)" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCREEN: SYSTEM INFO */}
        {/* ======================================================== */}
        {activeScreen === 'system' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {loadingStats ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '13px' }}>
                {t('hardwareStatsLoading')}
              </div>
            ) : systemStats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>OS</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>{systemStats.os}</div>
                </div>

                <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>CPU</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                    {systemStats.cpu?.model} ({systemStats.cpu?.cores} cores)
                  </div>
                </div>

                <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>RAM</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                    {Math.round((systemStats.ram?.usedBytes || 0) / (1024 * 1024 * 1024))} GB / {Math.round((systemStats.ram?.totalBytes || 0) / (1024 * 1024 * 1024))} GB ({systemStats.ram?.usedPercent}%)
                  </div>
                </div>

                {systemStats.gpu && (
                  <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>GPU</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                      {systemStats.gpu.name} · {systemStats.gpu.temperatureC}°C
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      VRAM: {systemStats.gpu.usedVramMB} MB / {systemStats.gpu.totalVramMB} MB ({systemStats.gpu.utilizationPercent}%)
                    </div>
                  </div>
                )}

                <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Security & Audit</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>Server security event logs</div>
                  </div>
                  <a
                    href="/api/admin/audit?download=1"
                    download="audit.json"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: 'var(--surface-3)',
                      color: 'var(--text)',
                      borderRadius: 'var(--r-s)',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      textDecoration: 'none',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    Download audit.json
                  </a>
                </div>

                <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-m)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Setup Wizard</div>
                    <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>Re-run initial configuration wizard</div>
                  </div>
                  <a
                    href="/setup"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: 'var(--surface-3)',
                      color: 'var(--text)',
                      borderRadius: 'var(--r-s)',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      textDecoration: 'none',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    Open Wizard
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '13px' }}>
                {t('hardwareStatsUnavailable')}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Selected Guest Chat Inspection Modal */}
        {selectedGuestChat && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setSelectedGuestChat(null)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '560px',
                maxHeight: '85vh',
                backgroundColor: 'var(--surface-1)',
                borderRadius: 'var(--r-l)',
                border: '1px solid var(--hairline)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog Header */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{ fontSize: '15px', fontWeight: 'var(--fw-medium)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedGuestChat.chat?.title || t('guestChatTitle')}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {selectedGuestChat.chat?.model_id} • {new Date(selectedGuestChat.chat?.created_at).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className="press"
                  onClick={() => setSelectedGuestChat(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Dialog Messages Body */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {(!selectedGuestChat.messages || selectedGuestChat.messages.length === 0) ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center', padding: '30px 0' }}>
                    {t('noMessagesInGuestChat')}
                  </div>
                ) : (
                  selectedGuestChat.messages.map((m: any) => {
                    const isUser = m.role === 'user';
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignSelf: isUser ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          backgroundColor: isUser ? 'var(--surface-3)' : 'var(--surface-2)',
                          border: '1px solid var(--hairline)',
                          borderRadius: 'var(--r-m)',
                          padding: '10px 12px',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <span style={{ fontSize: '10px', color: isUser ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 'var(--fw-medium)', textTransform: 'uppercase' }}>
                            {isUser ? t('guestLabel') : t('modelLabel')}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                            {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        {m.reasoning && (
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-dim)',
                              fontStyle: 'italic',
                              backgroundColor: 'var(--surface-1)',
                              padding: '6px 8px',
                              borderRadius: 'var(--r-s)',
                              whiteSpace: 'pre-wrap',
                              maxHeight: '120px',
                              overflowY: 'auto',
                            }}
                          >
                            {m.reasoning}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                          {m.content}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Dialog Footer */}
              <div
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <button
                  type="button"
                  className="press"
                  onClick={() => handleDeleteGuestChat(selectedGuestChat.chat.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--danger)',
                    borderRadius: 'var(--r-s)',
                    color: 'var(--danger)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Trash2 size={13} />
                  <span>{t('deleteChatAction')}</span>
                </button>
                <button
                  type="button"
                  className="press"
                  onClick={() => setSelectedGuestChat(null)}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: 'var(--surface-3)',
                    border: 'none',
                    borderRadius: 'var(--r-s)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
};
