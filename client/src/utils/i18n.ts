import React, { useState, useEffect } from 'react';

export type Language = 'ru' | 'en';

export const translations = {
  ru: {
    // App & Branding
    appName: 'rrchat',
    tagline: 'Быстрый локальный ИИ чат',

    // Common
    close: 'Закрыть',
    back: 'Назад',
    save: 'Сохранить',
    saved: 'Сохранено',
    delete: 'Удалить',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
    copied: 'Скопировано',
    copy: 'Копировать',
    loading: 'Загрузка...',
    error: 'Ошибка',
    enabled: 'Включено',
    disabled: 'Выключено',

    // Common alerts & notices
    fullModeOnly: 'Доступно только в полном режиме',
    selectModel: 'Выберите модель',
    workModeWifiOnly: 'Режим work доступен только по Wi-Fi или локально. Чтобы включить через интернет, активируйте туннели в настройках на ПК.',
    dragFilesHere: '📎 Перетащите файлы сюда для прикрепления',
    deleteChatConfirm: 'Удалить этот чат со всеми сообщениями?',
    deleteMessageChain: 'Удалить это и все последующие сообщения в этом чате',
    connectionError: 'Ошибка соединения',
    requestError: 'Ошибка запроса',
    failedCreateChat: 'Не удалось создать чат',
    failedRenameChat: 'Не удалось переименовать чат',
    failedDeleteChat: 'Не удалось удалить чат',
    failedDeleteMessage: 'Не удалось удалить сообщение',
    failedUploadPhoto: 'Ошибка загрузки фото',
    failedUploadFile: 'Ошибка загрузки файла',
    failedOcrScan: 'Ошибка поиска OCR модели',
    failedOcrLoad: 'Ошибка загрузки OCR модели',

    // Sidebar & Navigation
    newChat: 'Новый чат',
    basicChats: 'Обычные чаты',
    workChats: 'Ворк (Агент)',
    searchChats: 'Поиск чатов...',
    noChats: 'Нет чатов',
    confirmDelete: 'Удалить?',
    confirmDeleteSure: 'Точно удалить?',
    renameChat: 'Переименовать',
    deleteMessage: 'Удалить',
    confirmDeleteMessage: 'Удалить это сообщение?',
    generationParams: 'Параметры генерации',
    temperature: 'Температура',
    topP: 'Top-P',
    minP: 'Min-P',
    systemPrompt: 'Системный промпт',
    systemPromptPlaceholder: 'Дополнительные инструкции для этой модели...',
    autoCompact: 'Авто-сжатие контекста',
    autoCompactDesc: 'Сжимать контекст при заполнении > 78%',
    presetCode: 'Код',
    presetBalance: 'Баланс',
    presetCreative: 'Креатив',

    // Mode Toggle
    ask: 'Чат',
    work: 'Агент',

    // Web Search Sources
    searchSources: 'Поиск в сети',
    searchingWeb: 'Поиск в сети...',
    sourcesFound: 'источников',
    noSourcesFound: 'Источники не найдены',
    searchQuery: 'Запрос:',

    // Plus Menu / Actions
    camera: 'Камера',
    gallery: 'Галерея',
    file: 'Файл',
    mode: 'Режим',
    chatMode: 'Чат',
    workMode: 'Ворк (Агент)',
    reasoning: 'Рассуждения',
    effortLevel: 'Глубина мыслей',
    low: 'Низкая',
    medium: 'Средняя',
    high: 'Высокая',
    contextWindow: 'Контекст модели',
    visionOcr: 'Зрение / OCR',
    webSearch: 'Поиск в сети',
    webSearchSmartDesc: 'Умный режим: модель сама решает, когда искать информацию в интернете, и составляет краткий запрос.',
    searchActive: 'Поиск активен',
    searchOff: 'Поиск выкл',

    // Chat Input
    placeholderChat: 'Сообщение для rrchat...',
    placeholderWork: 'Поручите задачу агенту (код, файлы, консоль)...',
    clearContext: 'Очистить контекст',
    incognito: 'Инкогнито',

    // Model Selector & Loaded states
    modelsTab: 'Модели',
    contextLabel: 'Контекст',
    mainTab: 'Основная',
    extraTab: 'Вспомогательная',
    loadedBadge: 'загружена',
    loadingBadge: 'загрузка...',
    noModelsAvailable: 'Нет доступных моделей',

    // Directory Scene
    storageQuota: 'Квота хранилища',
    loadingFiles: 'Загрузка файлов...',
    directoryEmpty: 'Каталог пуст',

    // Preview Modal
    filePreview: 'Просмотр файла',
    loadingContent: 'Загрузка содержимого...',
    noTextContent: 'Нет текстового содержимого',
    failedLoadContent: 'Не удалось загрузить содержимое файла',
    failedOpenPdf: 'Не удалось открыть PDF',

    // Usage Drawer
    usage: 'Использование',
    model: 'Модель',
    contextTitle: 'Контекстное окно',
    hardwareTitle: 'Состояние ПК и GPU',
    sessionTitle: 'Сессия и токены',
    resetContextBtn: 'Сбросить контекст',
    compactContextBtn: 'Сжать контекст',
    undoContextBtn: 'Отменить сжатие',
    freeModelBtn: 'Выгрузить',
    loadModelBtn: 'Загрузить',
    deleteSessionBtn: 'Удалить сессию',
    modelSettingsBtn: 'Настройки',
    gpuOffloadLayers: 'Слои на GPU',
    estimatedVram: 'Расчет VRAM',
    ramMode: 'Режим RAM',
    activeContext: 'Занято в контексте',
    freeContext: 'Свободно',
    userMessagesLabel: 'Сообщения пользователя',
    assistantRepliesLabel: 'Ответы ассистента',
    toolResultsLabel: 'Результаты инструментов',
    summaryBlockLabel: 'Сжатая сводка',
    speedLabel: 'Скорость',
    totalGeneratedLabel: 'Всего сгенерировано',
    totalPromptLabel: 'Всего обработано',
    sessionDurationLabel: 'Длительность сессии',
    tokPerSec: 'ток/с',
    tokensUnit: 'токенов',
    deleteSessionConfirmTitle: 'Удалить сессию',
    deleteSessionConfirmDesc: 'Вы уверены, что хотите удалить этот чат? Все сообщения и файлы будут удалены навсегда.',
    clearContextConfirmTitle: 'Очистить контекст',
    clearContextConfirmDesc: 'Исключить активные сообщения из контекстного окна? Системные инструкции сохранятся, а память VRAM освободится.',
    compactContextConfirmTitle: 'Сжать контекст',
    compactContextConfirmDesc: 'Сжать ранние сообщения беседы в краткую сводку, чтобы освободить место в контексте?',

    // Model Settings Sheet
    modelSettingsTitle: 'Настройки модели',
    contextTokensLabel: 'Размер контекста (токенов)',
    kvCacheTypeLabel: 'Тип KV-кэша',
    cpuMoeLabel: 'Эксперты на CPU (MoE)',
    visionProjectorLabel: 'Проектор зрения (mmproj)',
    autoProjector: 'Автоопределение',
    noneProjector: 'Без проектора',
    saveSettingsBtn: 'Сохранить настройки',

    // Settings / Admin
    settings: 'Настройки',
    language: 'Язык интерфейса',
    theme: 'Тема оформления',
    models: 'Модели и кванты',
    directory: 'Рабочий каталог',
    skills: 'Система скиллов',
    agentSettings: 'Настройки агента',
    personalContext: 'Личный контекст / Пре-промпт',
    accessToken: 'Токен доступа и сеть',
    systemInfo: 'Состояние ПК и GPU',
    activeModel: 'Активная модель',
    auxModel: 'OCR модель (GLM-OCR)',

    // Admin Screens & Actions
    themeScreenTitle: 'Тема оформления',
    modelsScreenTitle: 'Модели и кванты',
    directoryScreenTitle: 'Рабочий каталог',
    tokenScreenTitle: 'Токен доступа и сеть',
    skillsScreenTitle: 'Система скиллов',
    agentSettingsScreenTitle: 'Настройки агента',
    contextScreenTitle: 'Личный контекст',
    systemScreenTitle: 'Состояние ПК и GPU',
    themeApplied: 'Тема применена',
    workDirSaved: 'Рабочая папка сохранена',
    tokenCopiedToast: 'Токен скопирован',
    urlCopiedToast: 'Ссылка подключения скопирована',
    regenTokenConfirmText: 'Сгенерировать новый токен? Старые сессии и подключения потребуется авторизовать заново.',
    newTokenGenerated: 'Создан новый токен',
    guestTokenLabel: 'Гостевой токен',
    guestTokenCreatedToast: 'Гостевой токен создан',
    revokeGuestConfirmText: 'Отозвать гостевой токен? Все активные сессии гостей будут немедленно отключены.',
    guestTokenRevokedToast: 'Гостевой токен отозван',
    allowWorkTunnelTitle: 'Разрешить режим Work через туннели',
    allowWorkTunnelDesc: 'По умолчанию выключено для безопасности при выходе в интернет через Tailscale Funnel',
    allowAdminTunnelTitle: 'Управление настройками через туннели',
    allowAdminTunnelDesc: 'Разрешает вход в админку с телефона через публичный Funnel',
    guestChatsHeader: 'Чаты гостей',
    noGuestChatsFound: 'Нет сохраненных чатов гостей',
    guestModeNoticeTitle: 'Гостевой режим',
    guestModeNoticeDesc: 'Гости могут общаться с моделью, но не имеют доступа к Work Mode, файлам и настройкам ПК.',
    createGuestTokenBtn: 'Выдать гостевой токен',
    revokeGuestTokenAction: 'Отозвать гостевой токен',
    viewChatBtn: 'Открыть чат',
    backToChatsBtn: 'Назад к чатам',
    author: 'Автор',

    // Skills System
    skillsTitle: 'Навыки и скиллы (CLI / Markdown)',
    skillsDesc: 'Загрузите файл .md или .zip архив со скиллом (как в современных агентских CLI). Инструкции автоматически добавляются в контекст модели.',
    uploadSkillBtn: 'Загрузить .md или .zip',
    noSkills: 'Установленных скиллов пока нет. Загрузите файл .md или архив .zip.',
    skillInstalled: 'Скилл успешно установлен',
    skillDeleted: 'Скилл удален',
    deleteSkillConfirm: 'Удалить этот скилл?',

    // Agent Settings
    agentWebSearch: 'Доступ к поиску в сети для агента',
    agentWebSearchDesc: 'Позволяет агенту в режиме Work искать информацию и документацию в интернете (DuckDuckGo)',
    maxAgentSteps: 'Максимум шагов агента',
    commandTimeout: 'Таймаут выполнения команд (сек)',
    autoApprove: 'Авто-подтверждение безопасных команд',
    workQuota: 'Квота рабочего каталога (ГБ)',

    // Context & pre-prompt
    prePromptTitle: 'Личные инструкции для модели',
    prePromptPlaceholder: 'Например: Всегда отвечай кратко на русском языке. Пиши чистый код с комментариями в стиле ASD-STE100.',
    prePromptHint: 'Этот текст незаметно добавляется ко всем запросам как системная инструкция.',

    // Token & Connect
    tokenTitle: 'Токен и подключение смартфона',
    scanQrCode: 'Отсканируйте QR-код камерой телефона для быстрого подключения:',
    directUrl: 'Прямая ссылка:',

    // Additional Admin & Settings
    cannotDeleteOwnToken: 'Вы не можете удалить свой токен',
    guestChatNotFound: 'Чат не найден',
    guestChatDeleteError: 'Ошибка удаления чата',
    guestChatDeletedToast: 'Чат гостя удален',
    deleteGuestChatConfirm: 'Удалить этот чат гостя?',
    loadGuestChatError: 'Не удалось загрузить диалог',
    instructionsSavedToast: 'Инструкции сохранены и подключены',
    modelSettingsSavedToast: 'Настройки модели сохранены',
    modelUnloadedToast: 'Модель выгружена',
    modelLoadedToast: 'Модель загружена',
    auxModelDisabledToast: 'Aux-модель отключена',
    auxModelAssignedToast: 'Модель назначена как Aux (OCR)',
    settingsModalError: 'Ошибка в окне настроек',
    redBasicDesc: 'Фирменный тёмно-красный градиент rrchat',
    darkMinimalDesc: 'Нейтральный тёмный графит',
    oledPureDesc: 'Абсолютный глубокий чёрный',
    workDirDesc: 'Рабочая папка для режима Work Mode. В неё сохраняются сгенерированные файлы, проекты и веб-страницы.',
    scanQrWifiDesc: 'Отсканируйте камерой смартфона для мгновенного входа из одной сети Wi-Fi:',
    scanGuestQrDesc: 'Отсканируйте камерой смартфона для быстрого входа гостя',
    activeBadge: 'Активен',
    notCreatedBadge: 'Не создан',
    regenerateBtn: 'Перевыпустить',
    guestTokensHelp: 'Гостевой токен позволяет безопасно делиться доступом к чату с друзьями или гостями без доступа к настройкам и файловой системе.',
    messagesCount: 'сообщ.',
    openBtn: 'Открыть',
    workModeOverTunnel: 'Разрешить режим work через туннель',
    workModeOverTunnelWarn: '(не рекомендуется, даёт доступ к терминалу ПК из интернета)',
    adminOverTunnel: 'Управление настройками через туннель',
    adminOverTunnelDesc: '(разрешает менять настройки и выдавать токены с телефона через Funnel)',
    prePromptDesc: 'Инструкции будут автоматически добавляться в начало каждого диалога (например, «Отвечай кратко на русском, пиши чистый TypeScript»).',
    prePromptInputPlaceholder: 'Введите персональные инструкции...',
    saveInstructions: 'Сохранить инструкции',
    instructionsSaved: 'Сохранено!',
    sizeLabel: 'Размер',
    quantLabel: 'Квантование',
    contextWindowLabel: 'Контекстное окно',
    unloadModel: 'Выгрузить модель',
    loadAsMain: 'Загрузить как основную',
    removeAux: 'Отключить Aux',
    setAsAux: 'Задать как Aux (OCR)',
    guestLabel: 'Гость',
    modelLabel: 'Модель',
    noMessagesInGuestChat: 'В этом диалоге пока нет сообщений',
    guestChatTitle: 'Чат гостя',
    deleteChatAction: 'Удалить чат',
    hardwareStatsLoading: 'Загрузка информации о системе и оборудовании...',
    hardwareStatsUnavailable: 'Информация об оборудовании недоступна на этом хосте',
    workModeEnabledLabel: 'Режим Work Mode включен',
    adminLabel: 'Админ',
    thisDevice: 'Это устройство',
    remoteDevice: 'Удаленное устройство',
    currentDeviceBadge: 'Текущее',
    emptyChars: 'пусто',
    charsCount: 'симв.',
  },
  en: {
    // App & Branding
    appName: 'rrchat',
    tagline: 'Fast local AI chat',

    // Common
    close: 'Close',
    back: 'Back',
    save: 'Save',
    saved: 'Saved',
    delete: 'Delete',
    cancel: 'Cancel',
    confirm: 'Confirm',
    copied: 'Copied',
    copy: 'Copy',
    loading: 'Loading...',
    error: 'Error',
    enabled: 'Enabled',
    disabled: 'Disabled',

    // Common alerts & notices
    fullModeOnly: 'Available only in full mode',
    selectModel: 'Select model',
    workModeWifiOnly: 'Work mode is only available over Wi-Fi or locally. To enable over the internet, allow tunnel access in PC settings.',
    dragFilesHere: '📎 Drag and drop files here to attach',
    deleteChatConfirm: 'Delete this chat and all its messages?',
    deleteMessageChain: 'Delete this and all subsequent messages in this chat',
    connectionError: 'Connection error',
    requestError: 'Request error',
    failedCreateChat: 'Failed to create chat',
    failedRenameChat: 'Failed to rename chat',
    failedDeleteChat: 'Failed to delete chat',
    failedDeleteMessage: 'Failed to delete message',
    failedUploadPhoto: 'Failed to upload photo',
    failedUploadFile: 'Failed to upload file',
    failedOcrScan: 'Failed to scan OCR model',
    failedOcrLoad: 'Failed to load OCR model',

    // Sidebar & Navigation
    newChat: 'New chat',
    basicChats: 'Basic Chats',
    workChats: 'Work Mode',
    searchChats: 'Search chats...',
    noChats: 'No chats',
    confirmDelete: 'Delete?',
    confirmDeleteSure: 'Are you sure?',
    renameChat: 'Rename',
    deleteMessage: 'Delete',
    confirmDeleteMessage: 'Delete this message?',
    generationParams: 'Generation Settings',
    temperature: 'Temperature',
    topP: 'Top-P',
    minP: 'Min-P',
    systemPrompt: 'System Prompt',
    systemPromptPlaceholder: 'Additional instructions for this model...',
    autoCompact: 'Auto Context Compaction',
    autoCompactDesc: 'Compact earlier messages when context > 78%',
    presetCode: 'Code',
    presetBalance: 'Balance',
    presetCreative: 'Creative',

    // Mode Toggle
    ask: 'Chat',
    work: 'Agent',

    // Web Search Sources
    searchSources: 'Web Search',
    searchingWeb: 'Searching web...',
    sourcesFound: 'sources',
    noSourcesFound: 'No sources found',
    searchQuery: 'Query:',

    // Plus Menu / Actions
    camera: 'Camera',
    gallery: 'Gallery',
    file: 'File',
    mode: 'Mode',
    chatMode: 'Chat',
    workMode: 'Work (Agent)',
    reasoning: 'Reasoning',
    effortLevel: 'Effort level',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    contextWindow: 'Context Window',
    visionOcr: 'Vision / OCR',
    webSearch: 'Web Search',
    webSearchSmartDesc: 'Smart mode: the model automatically decides when web search is needed and formulates concise queries.',
    searchActive: 'Search On',
    searchOff: 'Search Off',

    // Chat Input
    placeholderChat: 'Message rrchat...',
    placeholderWork: 'Assign a task to agent (code, files, shell)...',
    clearContext: 'Clear context',
    incognito: 'Incognito',

    // Model Selector & Loaded states
    modelsTab: 'Models',
    contextLabel: 'Context',
    mainTab: 'Main',
    extraTab: 'Extra',
    loadedBadge: 'loaded',
    loadingBadge: 'loading...',
    noModelsAvailable: 'No models available',

    // Directory Scene
    storageQuota: 'Storage Quota',
    loadingFiles: 'Loading files...',
    directoryEmpty: 'Directory is empty',

    // Preview Modal
    filePreview: 'File Preview',
    loadingContent: 'Loading content...',
    noTextContent: 'No text content',
    failedLoadContent: 'Failed to load file content',
    failedOpenPdf: 'Failed to open PDF',

    // Usage Drawer
    usage: 'Usage',
    model: 'Model',
    contextTitle: 'Context Window',
    hardwareTitle: 'PC & GPU Stats',
    sessionTitle: 'Session & Tokens',
    resetContextBtn: 'Reset Context',
    compactContextBtn: 'Compact Context',
    undoContextBtn: 'Undo Compaction',
    freeModelBtn: 'Unload Model',
    loadModelBtn: 'Load Model',
    deleteSessionBtn: 'Delete Session',
    modelSettingsBtn: 'Model Settings',
    gpuOffloadLayers: 'GPU Offload Layers',
    estimatedVram: 'Estimated VRAM',
    ramMode: 'RAM Mode',
    activeContext: 'Active in Context',
    freeContext: 'Free',
    userMessagesLabel: 'User Messages',
    assistantRepliesLabel: 'Assistant Replies',
    toolResultsLabel: 'Tool Results',
    summaryBlockLabel: 'Compressed Summary',
    speedLabel: 'Speed',
    totalGeneratedLabel: 'Total Generated',
    totalPromptLabel: 'Total Processed',
    sessionDurationLabel: 'Session Duration',
    tokPerSec: 'tok/s',
    tokensUnit: 'tokens',
    deleteSessionConfirmTitle: 'Delete Session',
    deleteSessionConfirmDesc: 'Are you sure you want to delete this chat session? All messages and attachments will be permanently removed.',
    clearContextConfirmTitle: 'Clear Context',
    clearContextConfirmDesc: 'Exclude active messages from the context window? System instructions will be retained and VRAM memory will be released.',
    compactContextConfirmTitle: 'Compact Context',
    compactContextConfirmDesc: 'Condense older messages in this conversation into a summary marker to free up context space?',

    // Model Settings Sheet
    modelSettingsTitle: 'Model Settings',
    contextTokensLabel: 'Context Window (tokens)',
    kvCacheTypeLabel: 'KV Cache Type',
    cpuMoeLabel: 'CPU Offload Experts (MoE)',
    visionProjectorLabel: 'Vision Projector (mmproj)',
    autoProjector: 'Auto-detect',
    noneProjector: 'None',
    saveSettingsBtn: 'Save Settings',

    // Settings / Admin
    settings: 'Settings',
    language: 'Language',
    theme: 'Theme',
    models: 'Models & Quantization',
    directory: 'Working Directory',
    skills: 'Skills System',
    agentSettings: 'Agent Settings',
    personalContext: 'Personal Context / Pre-prompt',
    accessToken: 'Access Token & Network',
    systemInfo: 'PC & GPU Stats',
    activeModel: 'Active Model',
    auxModel: 'OCR Model (GLM-OCR)',

    // Admin Screens & Actions
    themeScreenTitle: 'Theme',
    modelsScreenTitle: 'Models',
    directoryScreenTitle: 'Workspace Directory',
    tokenScreenTitle: 'Access Token',
    skillsScreenTitle: 'Skills',
    agentSettingsScreenTitle: 'Agent Settings',
    contextScreenTitle: 'Personal Context',
    systemScreenTitle: 'System Info',
    themeApplied: 'Theme applied',
    workDirSaved: 'Workspace directory saved',
    tokenCopiedToast: 'Token copied',
    urlCopiedToast: 'Connection link copied',
    regenTokenConfirmText: 'Generate a new token? Existing sessions and paired devices will need to re-authenticate.',
    newTokenGenerated: 'New token generated',
    guestTokenLabel: 'Guest Token',
    guestTokenCreatedToast: 'Guest token created',
    revokeGuestConfirmText: 'Revoke guest token? All active guest sessions will be disconnected immediately.',
    guestTokenRevokedToast: 'Guest token revoked',
    allowWorkTunnelTitle: 'Allow Work Mode over Tunnels',
    allowWorkTunnelDesc: 'Disabled by default for security when exposed via Tailscale Funnel',
    allowAdminTunnelTitle: 'Admin Access over Tunnels',
    allowAdminTunnelDesc: 'Allows accessing admin settings remotely over public Funnel',
    guestChatsHeader: 'Guest Chats',
    noGuestChatsFound: 'No guest chats saved',
    guestModeNoticeTitle: 'Guest Mode',
    guestModeNoticeDesc: 'Guests can chat with the model, but cannot access Work Mode, filesystem, or host settings.',
    createGuestTokenBtn: 'Generate Guest Token',
    revokeGuestTokenAction: 'Revoke Guest Token',
    viewChatBtn: 'View Chat',
    backToChatsBtn: 'Back to Chats',
    author: 'Author',

    // Skills System
    skillsTitle: 'Skills System (CLI / Markdown)',
    skillsDesc: 'Upload a .md file or a .zip archive containing a skill (standard CLI skill format). Skill instructions are automatically injected into the LLM context.',
    uploadSkillBtn: 'Upload .md or .zip',
    noSkills: 'No installed skills yet. Upload a .md or .zip file.',
    skillInstalled: 'Skill installed successfully',
    skillDeleted: 'Skill deleted',
    deleteSkillConfirm: 'Delete this skill?',

    // Agent Settings
    agentWebSearch: 'Agent Web Search Access',
    agentWebSearchDesc: 'Enables the agent in Work Mode to search the web and documentation using DuckDuckGo',
    maxAgentSteps: 'Maximum Agent Steps',
    commandTimeout: 'Command Execution Timeout (s)',
    autoApprove: 'Auto-approve Safe Commands',
    workQuota: 'Workspace Quota (GB)',

    // Context & pre-prompt
    prePromptTitle: 'Personal Model Instructions',
    prePromptPlaceholder: 'e.g. Always respond concisely. Write clean, modular code with concise comments.',
    prePromptHint: 'This text is seamlessly prepended to all queries as a system prompt.',

    // Token & Connect
    tokenTitle: 'Access Token & Phone Connect',
    scanQrCode: 'Scan QR code with your phone camera for instant pairing:',
    directUrl: 'Direct link:',

    // Additional Admin & Settings
    cannotDeleteOwnToken: 'You cannot delete your own token',
    guestChatNotFound: 'Chat not found',
    guestChatDeleteError: 'Failed to delete chat',
    guestChatDeletedToast: 'Guest chat deleted',
    deleteGuestChatConfirm: 'Delete this guest chat?',
    loadGuestChatError: 'Failed to load conversation',
    instructionsSavedToast: 'Instructions saved and applied',
    modelSettingsSavedToast: 'Model settings saved',
    modelUnloadedToast: 'Model unloaded',
    modelLoadedToast: 'Model loaded',
    auxModelDisabledToast: 'Aux model disabled',
    auxModelAssignedToast: 'Model assigned as Aux (OCR)',
    settingsModalError: 'Error in settings modal',
    redBasicDesc: 'Signature dark red rrchat gradient',
    darkMinimalDesc: 'Neutral dark graphite',
    oledPureDesc: 'Absolute deep black',
    workDirDesc: 'Working folder for Work Mode. Generated files, projects, and web pages are stored here.',
    scanQrWifiDesc: 'Scan with smartphone camera for instant pairing on the same Wi-Fi network:',
    scanGuestQrDesc: 'Scan with smartphone camera for instant guest access',
    activeBadge: 'Active',
    notCreatedBadge: 'Not created',
    regenerateBtn: 'Regenerate',
    guestTokensHelp: 'Guest token allows safe sharing of chat access with friends without access to settings or filesystem.',
    messagesCount: 'msgs',
    openBtn: 'Open',
    workModeOverTunnel: 'Allow Work Mode over tunnel',
    workModeOverTunnelWarn: '(not recommended, provides PC terminal access from the internet)',
    adminOverTunnel: 'Admin settings management over tunnel',
    adminOverTunnelDesc: '(allows modifying settings and issuing tokens from mobile via Funnel)',
    prePromptDesc: 'Instructions will be automatically prepended to each dialogue (e.g., "Respond concisely, write clean TypeScript").',
    prePromptInputPlaceholder: 'Enter personal instructions...',
    saveInstructions: 'Save Instructions',
    instructionsSaved: 'Saved!',
    sizeLabel: 'Size',
    quantLabel: 'Quantization',
    contextWindowLabel: 'Context window',
    unloadModel: 'Unload Model',
    loadAsMain: 'Load as Main',
    removeAux: 'Remove Aux',
    setAsAux: 'Set as Aux (OCR)',
    guestLabel: 'Guest',
    modelLabel: 'Model',
    noMessagesInGuestChat: 'No messages in this chat yet',
    guestChatTitle: 'Guest Chat',
    deleteChatAction: 'Delete Chat',
    hardwareStatsLoading: 'Loading system hardware information...',
    hardwareStatsUnavailable: 'Hardware stats unavailable on this host',
    workModeEnabledLabel: 'Work Mode enabled',
    adminLabel: 'Admin',
    thisDevice: 'This device',
    remoteDevice: 'Remote device',
    currentDeviceBadge: 'Current',
    emptyChars: 'empty',
    charsCount: 'chars',
  },
} as const;

export type TranslationKey = keyof typeof translations['en'];

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem('rrchat_language');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {}
  return 'en';
}

let currentLang: Language = getInitialLanguage();
const listeners = new Set<(lang: Language) => void>();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang === 'en' ? 'en' : 'ru';
  try {
    localStorage.setItem('rrchat_language', currentLang);
  } catch {}
  listeners.forEach((cb) => cb(currentLang));
}

export function useLanguage(): Language {
  const [lang, setLang] = useState<Language>(currentLang);
  useEffect(() => {
    listeners.add(setLang);
    return () => {
      listeners.delete(setLang);
    };
  }, []);
  return lang;
}

export function t(key: TranslationKey): string {
  const table = translations[currentLang] || translations.en;
  return (table as any)?.[key] || (translations.en as any)[key] || (key as string);
}
