import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  HardDrive,
  Shield,
  CheckCircle,
  Folder,
  FileCode,
  Download,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Wifi,
  Globe,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';

export interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [lang, setLang] = useState<'en' | 'ru'>('en');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Status from backend
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [gpuInfo, setGpuInfo] = useState<{ hasNvidia: boolean; name: string | null }>({
    hasNvidia: false,
    name: null,
  });

  // Step 1: Engine
  const [llamaServerPath, setLlamaServerPath] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<'cuda' | 'vulkan' | 'cpu'>('vulkan');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    downloadedMB: string;
    totalMB: string;
    statusText: string;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Step 2: Storage
  const [modelsDir, setModelsDir] = useState('');
  const [modelsCount, setModelsCount] = useState<number>(0);
  const [isScanningModels, setIsScanningModels] = useState(false);
  const [workModeEnabled, setWorkModeEnabled] = useState(true);
  const [workDir, setWorkDir] = useState('');
  const [workQuotaGB, setWorkQuotaGB] = useState(5);

  // Step 3: Network & Security
  const [networkMode, setNetworkMode] = useState<'wifi' | 'funnel'>('wifi');
  const [allowAdminOverTunnel, setAllowAdminOverTunnel] = useState(false);
  const [allowWorkOverTunnel, setAllowWorkOverTunnel] = useState(false);

  // Step 4: Ready
  const [isSaving, setIsSaving] = useState(false);
  const [savedData, setSavedData] = useState<{
    plainToken: string;
    connectUrl: string;
    qrCodeDataUrl: string;
    lanIp: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Translations
  const t = {
    en: {
      badge: 'SETUP WIZARD',
      title: 'Welcome to rrchat',
      subtitle: 'Self-hosted AI chat with GPU acceleration & mobile PWA support.',
      step1Title: 'Inference Engine',
      step2Title: 'Storage & Models',
      step3Title: 'Network & Security',
      step4Title: 'Launch Ready',

      // Step 1
      engineHeading: 'Configure llama-server',
      engineSub: 'rrchat uses llama-server from llama.cpp to run your models locally with full VRAM management.',
      detectedBadge: 'Auto-detected',
      exePathLabel: 'Path to llama-server.exe',
      browseBtn: 'Browse...',
      orDownload: 'Or download automatically from GitHub Releases',
      downloadDesc: 'Download pre-compiled llama.cpp binary matching your hardware directly into ./bin/',
      gpuDetected: 'Detected GPU:',
      noGpuDetected: 'No NVIDIA GPU detected (Vulkan recommended for AMD/Intel/NVIDIA)',
      variantCuda: 'CUDA 12.4 (Fastest for NVIDIA RTX / GeForce)',
      variantVulkan: 'Vulkan (Universal for NVIDIA, AMD, Intel GPU)',
      variantCpu: 'CPU Only (AVX2 fallback, no GPU needed)',
      btnDownload: 'Download llama-server',
      downloadingText: 'Downloading binary archive...',
      extractingText: 'Extracting archive into ./bin/ ...',
      downloadSuccess: 'Successfully installed llama-server!',

      // Step 2
      storageHeading: 'Models & Workspace',
      storageSub: 'Specify where your GGUF models are stored and configure optional file agent workspace.',
      modelsFolderLabel: 'Models Folder (.gguf files)',
      modelsFound: 'model(s) found in directory',
      scanningDirectory: 'Scanning directory...',
      noModelsFound: 'No .gguf models found yet (you can place models here anytime)',
      workModeTitle: 'Enable Work Mode (Autonomous File Agent)',
      workModeSub: 'Allows the AI to inspect, edit, and create code & files within an isolated directory.',
      workFolderLabel: 'Work Sandbox Folder',
      workQuotaLabel: 'Disk Space Quota (GB)',

      // Step 3
      networkHeading: 'Network Access & Security',
      networkSub: 'Choose how you plan to connect to your local AI chat.',
      modeWifiTitle: 'Local Wi-Fi Network',
      modeWifiBadge: 'Recommended',
      modeWifiDesc: 'Accessible from your PC and any smartphone connected to your home/office Wi-Fi. Completely private, zero exposure to public internet.',
      modeFunnelTitle: 'Public Internet (Tailscale Funnel)',
      modeFunnelBadge: 'Remote Access',
      modeFunnelDesc: 'Access your models securely from outside home using mobile 4G/5G data without opening router ports or paying for static IP.',
      funnelGuideTitle: 'Tailscale Funnel Setup Guide:',
      funnelStep1: 'Install and start Tailscale on your host Windows PC (free).',
      funnelStep2: 'Open Command Prompt and run:',
      funnelStep3: 'Connect from your phone browser via your assigned HTTPS domain (e.g. https://your-pc.ts.net).',
      funnelSecurityHeader: 'Funnel Security Policies',
      funnelAllowAdmin: 'Allow remote settings & model management over Funnel',
      funnelAllowAdminSub: 'When disabled, admin settings are strictly restricted to physical PC (localhost).',
      funnelAllowWork: 'Allow file agent commands over Funnel',
      funnelAllowWorkSub: 'When disabled, agent file system operations are blocked over external tunnels for safety.',

      // Step 4
      readyHeading: "You're All Set!",
      readySub: 'Your local AI assistant is configured and ready for conversations.',
      tokenLabel: 'Master Access Token',
      copyToken: 'Copy Token',
      copied: 'Copied!',
      mobileQrHeading: 'Connect Mobile Phone',
      mobileQrSub: 'Open camera on your iPhone or Android and scan this QR code to launch the chat as a full-screen PWA app:',
      lanAddressLabel: 'Local Wi-Fi Address',
      btnLaunch: 'Launch rrchat',
      nextBtn: 'Next',
      backBtn: 'Back',
      finishBtn: 'Save & Finish',
    },
    ru: {
      badge: 'МАСТЕР НАСТРОЙКИ',
      title: 'Добро пожаловать в rrchat',
      subtitle: 'Локальный ИИ-чат с ускорением на GPU и поддержкой мобильного PWA-клиента.',
      step1Title: 'Движок',
      step2Title: 'Папки и модели',
      step3Title: 'Сеть и защита',
      step4Title: 'Запуск',

      // Step 1
      engineHeading: 'Настройка llama-server',
      engineSub: 'rrchat использует llama-server (llama.cpp) для локального инференса моделей и точного контроля VRAM.',
      detectedBadge: 'Обнаружен автоматически',
      exePathLabel: 'Путь к llama-server.exe',
      browseBtn: 'Обзор...',
      orDownload: 'Или скачать автоматически из официальных релизов GitHub',
      downloadDesc: 'Загрузка готовой сборки llama.cpp под ваше железо напрямую в папку ./bin/',
      gpuDetected: 'Обнаружена видеокарта:',
      noGpuDetected: 'Видеокарта NVIDIA не обнаружена (рекомендуется Vulkan для любых GPU)',
      variantCuda: 'CUDA 12.4 (Максимальная скорость для NVIDIA RTX / GeForce)',
      variantVulkan: 'Vulkan (Универсальный для любых видеокарт: NVIDIA, AMD, Intel)',
      variantCpu: 'Только CPU (AVX2, видеокарта не требуется)',
      btnDownload: 'Скачать llama-server',
      downloadingText: 'Загрузка архива со сборкой...',
      extractingText: 'Распаковка файлов в ./bin/ ...',
      downloadSuccess: 'llama-server успешно установлен!',

      // Step 2
      storageHeading: 'Модели и рабочая папка',
      storageSub: 'Укажите папку с файлами .gguf и настройте песочницу для автономного файлового агента.',
      modelsFolderLabel: 'Папка с моделями (.gguf)',
      modelsFound: 'моделей найдено в папке',
      scanningDirectory: 'Сканирование папки...',
      noModelsFound: 'Файлов .gguf пока нет (вы сможете добавить модели сюда в любой момент)',
      workModeTitle: 'Включить Work Mode (Файловый агент)',
      workModeSub: 'Позволяет ИИ анализировать, создавать и редактировать файлы в изолированной папке проекта.',
      workFolderLabel: 'Папка рабочей песочницы',
      workQuotaLabel: 'Квота диска (ГБ)',

      // Step 3
      networkHeading: 'Сетевой доступ и безопасность',
      networkSub: 'Выберите предпочтительный сценарий подключения к вашему чату.',
      modeWifiTitle: 'Домашняя сеть Wi-Fi',
      modeWifiBadge: 'Рекомендуется',
      modeWifiDesc: 'Доступен с вашего ПК и смартфонов, подключенных к домашнему/офисному Wi-Fi. Полная изоляция от внешнего интернета.',
      modeFunnelTitle: 'Интернет через Tailscale Funnel',
      modeFunnelBadge: 'Удаленный доступ',
      modeFunnelDesc: 'Безопасный доступ к моделям с телефона через мобильный интернет (4G/5G) без проброса портов на роутере.',
      funnelGuideTitle: 'Инструкция по настройке Tailscale Funnel:',
      funnelStep1: 'Установите и запустите бесплатный Tailscale на вашем ПК с Windows.',
      funnelStep2: 'Откройте командную строку и выполните команду:',
      funnelStep3: 'Подключайтесь с телефона по полученному HTTPS-адресу (например https://ваш-пк.ts.net).',
      funnelSecurityHeader: 'Политики безопасности при выходе в интернет',
      funnelAllowAdmin: 'Разрешить смену настроек и моделей с телефона через Funnel',
      funnelAllowAdminSub: 'Если выключено, админка строго ограничена локальным компьютером (localhost).',
      funnelAllowWork: 'Разрешить файловому агенту выполнять команды через Funnel',
      funnelAllowWorkSub: 'Если выключено, выполнение команд агента через интернет блокируется для безопасности.',

      // Step 4
      readyHeading: 'Все готово к запуску!',
      readySub: 'Ваш локальный ИИ-ассистент сконфигурирован и готов к работе.',
      tokenLabel: 'Мастер-токен доступа',
      copyToken: 'Скопировать токен',
      copied: 'Скопировано!',
      mobileQrHeading: 'Подключение с телефона',
      mobileQrSub: 'Наведите камеру смартфона на этот QR-код, чтобы открыть чат на телефоне и установить его как приложение PWA:',
      lanAddressLabel: 'Адрес для домашней сети Wi-Fi',
      btnLaunch: 'Открыть чат',
      nextBtn: 'Далее',
      backBtn: 'Назад',
      finishBtn: 'Сохранить и запустить',
    },
  }[lang];

  // Initialize status on mount
  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await api.getSetupStatus();
        if (res.gpu) {
          setGpuInfo(res.gpu);
          if (res.gpu.hasNvidia) {
            setSelectedVariant('cuda');
          } else {
            setSelectedVariant('vulkan');
          }
        }
        if (res.detectedLlamaPath) {
          setLlamaServerPath(res.detectedLlamaPath);
        }
        setModelsDir(res.defaultModelsPath);
        setWorkDir(res.defaultWorkPath);
        setModelsCount(res.defaultModelsCount || 0);
      } catch {
        // ignore
      } finally {
        setLoadingStatus(false);
      }
    }
    loadStatus();
  }, []);

  // Live scan models when modelsDir changes
  useEffect(() => {
    if (!modelsDir) return;
    const timer = setTimeout(async () => {
      setIsScanningModels(true);
      try {
        const res = await api.scanModels(modelsDir);
        setModelsCount(res.count);
      } catch {
        setModelsCount(0);
      } finally {
        setIsScanningModels(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [modelsDir]);

  // Browse file for llama-server.exe
  const handleBrowseLlama = async () => {
    try {
      const res = await api.browseFile();
      if (res.selectedPath) {
        setLlamaServerPath(res.selectedPath);
      }
    } catch (err: any) {
      alert(`Browse error: ${err.message}`);
    }
  };

  // Browse folder for models
  const handleBrowseModels = async () => {
    try {
      const res = await api.browseFolder();
      if (res.selectedPath) {
        setModelsDir(res.selectedPath);
      }
    } catch (err: any) {
      alert(`Browse error: ${err.message}`);
    }
  };

  // Browse folder for work sandbox
  const handleBrowseWork = async () => {
    try {
      const res = await api.browseFolder();
      if (res.selectedPath) {
        setWorkDir(res.selectedPath);
      }
    } catch (err: any) {
      alert(`Browse error: ${err.message}`);
    }
  };

  // Start auto-download
  const handleStartDownload = () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress({
      percent: 0,
      downloadedMB: '0',
      totalMB: '...',
      statusText: t.downloadingText,
    });

    const unsubscribe = api.downloadLlamaServer(selectedVariant, (event) => {
      if (event.status === 'downloading') {
        setDownloadProgress({
          percent: event.percent,
          downloadedMB: event.downloadedMB,
          totalMB: event.totalMB,
          statusText: `${t.downloadingText} (${event.downloadedMB} / ${event.totalMB} MB)`,
        });
      } else if (event.status === 'extracting') {
        setDownloadProgress((prev) => ({
          percent: 95,
          downloadedMB: prev?.downloadedMB || '0',
          totalMB: prev?.totalMB || '0',
          statusText: t.extractingText,
        }));
      } else if (event.status === 'done') {
        setIsDownloading(false);
        setDownloadProgress(null);
        if (event.llamaServerPath) {
          setLlamaServerPath(event.llamaServerPath);
        }
        unsubscribe();
      } else if (event.status === 'error') {
        setIsDownloading(false);
        setDownloadError(event.message || 'Download failed');
        unsubscribe();
      }
    });
  };

  // Handle final save
  const handleSaveAndFinish = async () => {
    setIsSaving(true);
    try {
      const res = await api.saveSetup({
        llamaServerPath,
        modelsDir,
        workModeEnabled,
        workDir: workModeEnabled ? workDir : undefined,
        workQuotaGB,
        networkMode,
        allowAdminOverTunnel,
        allowWorkOverTunnel,
        language: lang,
      });

      if (res.ok) {
        setSavedData({
          plainToken: res.plainToken,
          connectUrl: res.connectUrl,
          qrCodeDataUrl: res.qrCodeDataUrl,
          lanIp: res.lanIp,
        });
        setStep(4);
      }
    } catch (err: any) {
      alert(`Setup save error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }}
    >
      {/* Header bar: Logo + Language switch */}
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--r-s)',
              background: 'var(--selected)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'var(--fw-bold)',
              color: '#ffffff',
              fontSize: '14px',
            }}
          >
            rr
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 'var(--fw-bold)', letterSpacing: '-0.3px' }}>
              rrchat
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.5px' }}>
              {t.badge}
            </div>
          </div>
        </div>

        {/* Language selector toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-m)',
            padding: '3px',
            border: '1px solid var(--hairline)',
            gap: '2px',
          }}
        >
          <button
            type="button"
            onClick={() => setLang('en')}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 'var(--fw-medium)',
              borderRadius: 'var(--r-s)',
              border: 'none',
              cursor: 'pointer',
              background: lang === 'en' ? 'var(--selected)' : 'transparent',
              color: lang === 'en' ? '#ffffff' : 'var(--text-muted)',
              transition: 'background 150ms ease',
            }}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('ru')}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 'var(--fw-medium)',
              borderRadius: 'var(--r-s)',
              border: 'none',
              cursor: 'pointer',
              background: lang === 'ru' ? 'var(--selected)' : 'transparent',
              color: lang === 'ru' ? '#ffffff' : 'var(--text-muted)',
              transition: 'background 150ms ease',
            }}
          >
            RU
          </button>
        </div>
      </div>

      {/* Main card */}
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-l)',
          border: '1px solid var(--hairline)',
          padding: '24px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Step indicator breadcrumbs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--hairline)',
            paddingBottom: '16px',
            gap: '8px',
          }}
        >
          {[
            { num: 1, label: t.step1Title, icon: Cpu },
            { num: 2, label: t.step2Title, icon: HardDrive },
            { num: 3, label: t.step3Title, icon: Shield },
            { num: 4, label: t.step4Title, icon: CheckCircle },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = step === item.num;
            const isDone = step > item.num;

            return (
              <div
                key={item.num}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isActive || isDone ? 1 : 0.4,
                  color: isActive ? 'var(--selected)' : isDone ? '#10b981' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 'var(--fw-medium)',
                }}
              >
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: isActive ? 'var(--selected)' : isDone ? '#10b981' : 'var(--surface-3)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  {isDone ? <Check size={13} strokeWidth={2.5} /> : item.num}
                </div>
                <span className="hide-mobile">{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: ENGINE */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 'var(--fw-bold)' }}>
                {t.engineHeading}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {t.engineSub}
              </p>
            </div>

            {/* Path input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t.exePathLabel}</span>
                {llamaServerPath && (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={12} /> {t.detectedBadge}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={llamaServerPath}
                  onChange={(e) => setLlamaServerPath(e.target.value)}
                  placeholder="C:\path\to\llama-server.exe"
                  style={{
                    flex: 1,
                    height: '40px',
                    background: 'var(--surface-3)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--r-m)',
                    padding: '0 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleBrowseLlama}
                  style={{
                    height: '40px',
                    padding: '0 16px',
                    borderRadius: 'var(--r-m)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FileCode size={15} />
                  <span>{t.browseBtn}</span>
                </button>
              </div>
            </div>

            {/* Auto-download card */}
            <div
              style={{
                background: 'var(--surface-3)',
                borderRadius: 'var(--r-m)',
                padding: '16px',
                border: '1px solid var(--hairline)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={16} color="var(--selected)" />
                <span style={{ fontSize: '13px', fontWeight: 'var(--fw-medium)' }}>{t.orDownload}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.downloadDesc}</div>

              {/* Hardware hint */}
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-s)',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Cpu size={15} color="#10b981" />
                <span>
                  {gpuInfo.hasNvidia ? `${t.gpuDetected} ${gpuInfo.name}` : t.noGpuDetected}
                </span>
              </div>

              {/* Variant choice */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { id: 'cuda', label: t.variantCuda, disabled: !gpuInfo.hasNvidia },
                  { id: 'vulkan', label: t.variantVulkan, disabled: false },
                  { id: 'cpu', label: t.variantCpu, disabled: false },
                ].map((v) => (
                  <label
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: v.disabled ? 'var(--text-dim)' : 'var(--text-primary)',
                      cursor: v.disabled ? 'not-allowed' : 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    <input
                      type="radio"
                      name="variant"
                      value={v.id}
                      checked={selectedVariant === v.id}
                      disabled={v.disabled}
                      onChange={() => setSelectedVariant(v.id as any)}
                      style={{ accentColor: 'var(--selected)' }}
                    />
                    <span>{v.label}</span>
                  </label>
                ))}
              </div>

              {/* Progress bar if downloading */}
              {isDownloading && downloadProgress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{downloadProgress.statusText}</span>
                    <span>{downloadProgress.percent}%</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'var(--surface-2)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${downloadProgress.percent}%`,
                        height: '100%',
                        background: 'var(--selected)',
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {downloadError && (
                <div style={{ fontSize: '12px', color: 'var(--danger)' }}>
                  Error: {downloadError}
                </div>
              )}

              {!isDownloading && (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  style={{
                    alignSelf: 'flex-start',
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: 'var(--r-m)',
                    border: 'none',
                    background: 'var(--selected)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 'var(--fw-medium)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Download size={14} />
                  <span>{t.btnDownload}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: STORAGE & MODELS */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 'var(--fw-bold)' }}>
                {t.storageHeading}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {t.storageSub}
              </p>
            </div>

            {/* Models folder */}
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                {t.modelsFolderLabel}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={modelsDir}
                  onChange={(e) => setModelsDir(e.target.value)}
                  style={{
                    flex: 1,
                    height: '40px',
                    background: 'var(--surface-3)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--r-m)',
                    padding: '0 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={handleBrowseModels}
                  style={{
                    height: '40px',
                    padding: '0 16px',
                    borderRadius: 'var(--r-m)',
                    border: 'none',
                    background: 'var(--surface-3)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Folder size={15} />
                  <span>{t.browseBtn}</span>
                </button>
              </div>

              {/* Models count badge */}
              <div style={{ marginTop: '6px', fontSize: '12px', color: modelsCount > 0 ? '#10b981' : 'var(--text-muted)' }}>
                {isScanningModels
                  ? t.scanningDirectory
                  : modelsCount > 0
                  ? `✓ ${modelsCount} ${t.modelsFound}`
                  : t.noModelsFound}
              </div>
            </div>

            {/* Work Mode Toggle Card */}
            <div
              style={{
                background: 'var(--surface-3)',
                borderRadius: 'var(--r-m)',
                padding: '16px',
                border: '1px solid var(--hairline)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>
                    {t.workModeTitle}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {t.workModeSub}
                  </div>
                </div>
                <div
                  className="toggle-switch"
                  data-checked={workModeEnabled}
                  onClick={() => setWorkModeEnabled(!workModeEnabled)}
                >
                  <div className="toggle-switch-thumb" />
                </div>
              </div>

              {workModeEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {t.workFolderLabel}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={workDir}
                        onChange={(e) => setWorkDir(e.target.value)}
                        style={{
                          flex: 1,
                          height: '38px',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--hairline)',
                          borderRadius: 'var(--r-m)',
                          padding: '0 12px',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleBrowseWork}
                        style={{
                          height: '38px',
                          padding: '0 14px',
                          borderRadius: 'var(--r-m)',
                          border: 'none',
                          background: 'var(--surface-2)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {t.browseBtn}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {t.workQuotaLabel}: {workQuotaGB} GB
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={workQuotaGB}
                      onChange={(e) => setWorkQuotaGB(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: 'var(--selected)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: NETWORK & SECURITY */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 'var(--fw-bold)' }}>
                {t.networkHeading}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {t.networkSub}
              </p>
            </div>

            {/* Radio cards: Wi-Fi vs Funnel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: Wi-Fi */}
              <div
                onClick={() => setNetworkMode('wifi')}
                style={{
                  background: networkMode === 'wifi' ? 'var(--surface-3)' : 'var(--surface-3)',
                  border: `2px solid ${networkMode === 'wifi' ? 'var(--selected)' : 'transparent'}`,
                  borderRadius: 'var(--r-m)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--r-m)',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                    flexShrink: 0,
                  }}
                >
                  <Wifi size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'var(--fw-bold)' }}>{t.modeWifiTitle}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: 'var(--r-s)',
                        background: '#10b98122',
                        color: '#10b981',
                        fontWeight: 'var(--fw-medium)',
                      }}
                    >
                      {t.modeWifiBadge}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                    {t.modeWifiDesc}
                  </div>
                </div>
              </div>

              {/* Option 2: Tailscale Funnel */}
              <div
                onClick={() => setNetworkMode('funnel')}
                style={{
                  background: networkMode === 'funnel' ? 'var(--surface-3)' : 'var(--surface-3)',
                  border: `2px solid ${networkMode === 'funnel' ? 'var(--selected)' : 'transparent'}`,
                  borderRadius: 'var(--r-m)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--r-m)',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3b82f6',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'var(--fw-bold)' }}>{t.modeFunnelTitle}</span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: 'var(--r-s)',
                        background: '#3b82f622',
                        color: '#3b82f6',
                        fontWeight: 'var(--fw-medium)',
                      }}
                    >
                      {t.modeFunnelBadge}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                    {t.modeFunnelDesc}
                  </div>
                </div>
              </div>
            </div>

            {/* Funnel Guide & Security Toggles if Funnel is selected */}
            {networkMode === 'funnel' && (
              <div
                style={{
                  background: 'var(--surface-3)',
                  borderRadius: 'var(--r-m)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  border: '1px solid var(--hairline)',
                }}
              >
                {/* Guide */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'var(--fw-bold)', color: '#3b82f6', marginBottom: '8px' }}>
                    {t.funnelGuideTitle}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-primary)' }}>
                    <div>1. {t.funnelStep1}</div>
                    <div>2. {t.funnelStep2}</div>
                    <div
                      style={{
                        background: 'var(--surface-1)',
                        padding: '6px 10px',
                        borderRadius: 'var(--r-s)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: 'var(--selected)',
                      }}
                    >
                      tailscale funnel 3000
                    </div>
                    <div>3. {t.funnelStep3}</div>
                  </div>
                </div>

                {/* Security Toggles */}
                <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'var(--fw-bold)', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    {t.funnelSecurityHeader}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Toggle: Admin over funnel */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                          {t.funnelAllowAdmin}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t.funnelAllowAdminSub}
                        </div>
                      </div>
                      <div
                        className="toggle-switch"
                        data-checked={allowAdminOverTunnel}
                        onClick={() => setAllowAdminOverTunnel(!allowAdminOverTunnel)}
                      >
                        <div className="toggle-switch-thumb" />
                      </div>
                    </div>

                    {/* Toggle: Work mode over funnel */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 'var(--fw-medium)' }}>
                          {t.funnelAllowWork}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t.funnelAllowWorkSub}
                        </div>
                      </div>
                      <div
                        className="toggle-switch"
                        data-checked={allowWorkOverTunnel}
                        onClick={() => setAllowWorkOverTunnel(!allowWorkOverTunnel)}
                      >
                        <div className="toggle-switch-thumb" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: READY */}
        {step === 4 && savedData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#10b98122',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle size={26} strokeWidth={2.5} />
              </div>
              <h2 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 'var(--fw-bold)' }}>
                {t.readyHeading}
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                {t.readySub}
              </p>
            </div>

            {/* QR Code and Mobile connect section */}
            <div
              style={{
                background: 'var(--surface-3)',
                borderRadius: 'var(--r-m)',
                padding: '20px',
                border: '1px solid var(--hairline)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 'var(--fw-bold)' }}>{t.mobileQrHeading}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '400px' }}>
                {t.mobileQrSub}
              </div>

              {savedData.qrCodeDataUrl && (
                <div
                  style={{
                    background: '#18181b',
                    padding: '12px',
                    borderRadius: 'var(--r-m)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  }}
                >
                  <img
                    src={savedData.qrCodeDataUrl}
                    alt="Connection QR Code"
                    style={{ width: '200px', height: '200px', display: 'block' }}
                  />
                </div>
              )}

              {/* Wi-Fi URL */}
              <div style={{ width: '100%', maxWidth: '440px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textAlign: 'left' }}>
                  {t.lanAddressLabel}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--r-s)',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {savedData.connectUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(savedData.connectUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedUrl ? '#10b981' : 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Launch button */}
            <button
              type="button"
              onClick={onComplete}
              style={{
                width: '100%',
                height: '46px',
                borderRadius: 'var(--r-m)',
                border: 'none',
                background: 'var(--selected)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 'var(--fw-bold)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(225, 29, 72, 0.4)',
              }}
            >
              <Sparkles size={18} />
              <span>{t.btnLaunch}</span>
            </button>
          </div>
        )}

        {/* Footer actions for Steps 1 - 3 */}
        {step < 4 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--hairline)',
              paddingTop: '16px',
              marginTop: '4px',
            }}
          >
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev - 1) as any)}
                style={{
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: 'var(--r-m)',
                  border: 'none',
                  background: 'var(--surface-3)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ChevronLeft size={16} />
                <span>{t.backBtn}</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !llamaServerPath.trim()) {
                    alert('Please specify or download llama-server.exe to continue');
                    return;
                  }
                  setStep((prev) => (prev + 1) as any);
                }}
                style={{
                  height: '38px',
                  padding: '0 20px',
                  borderRadius: 'var(--r-m)',
                  border: 'none',
                  background: 'var(--selected)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 'var(--fw-medium)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{t.nextBtn}</span>
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAndFinish}
                disabled={isSaving}
                style={{
                  height: '38px',
                  padding: '0 20px',
                  borderRadius: 'var(--r-m)',
                  border: 'none',
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 'var(--fw-bold)',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isSaving ? (
                  <RefreshCw size={15} className="spin" />
                ) : (
                  <CheckCircle size={15} />
                )}
                <span>{t.finishBtn}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
