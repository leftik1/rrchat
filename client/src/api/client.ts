import type { Chat, Message, ModelInfo, ModelProgressEvent } from '../types';

export const API_BASE = '/api';

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body !== undefined && options.body !== null && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    let errorCode = '';
    try {
      const body = await res.json();
      errorCode = body.error || '';
      errMessage = body.message || body.error || errMessage;
    } catch {
      // ignore
    }
    const err: any = new Error(errMessage);
    err.status = res.status;
    err.code = errorCode;
    throw err;
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  if (!text || !text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}

export const api = {
  async checkAuth(): Promise<{ ok: boolean; role?: 'admin' | 'guest' }> {
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        credentials: 'include',
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: true, role: body.role || 'admin' };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  },

  async login(token: string): Promise<{ ok: boolean; status: number; role?: 'admin' | 'guest'; retryAfter?: number }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
      let retryAfter: number | undefined;
      let role: 'admin' | 'guest' | undefined;
      if (res.ok) {
        try {
          const body = await res.json();
          role = body.role || 'admin';
        } catch {}
      } else if (res.status === 429) {
        try {
          const body = await res.json();
          retryAfter = body.retryAfter;
        } catch {}
      }
      return { ok: res.ok, status: res.status, role, retryAfter };
    } catch {
      return { ok: false, status: 0 };
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  },

  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`Upload failed with HTTP ${res.status}`);
    }
    return res.json();
  },

  async getModels(): Promise<{
    models: ModelInfo[];
    activeModelId: string | null;
    activeAuxModelId?: string | null;
    availableProjectors?: Array<{ name: string; fullPath: string; size: number }>;
  }> {
    return request('/models');
  },

  async loadModel(id: string, opts?: any): Promise<void> {
    return request(`/models/${encodeURIComponent(id)}/load`, {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    });
  },

  async unloadModel(id: string): Promise<void> {
    return request(`/models/${encodeURIComponent(id)}/unload`, {
      method: 'POST',
    });
  },

  async loadAuxModel(id: string, opts?: any): Promise<void> {
    return request(`/models/${encodeURIComponent(id)}/load-aux`, {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    });
  },

  async unloadAuxModel(): Promise<void> {
    return request(`/models/unload-aux`, {
      method: 'POST',
    });
  },

  async setActiveAuxModel(modelId?: string | null): Promise<void> {
    return request(`/models/active-aux`, {
      method: 'PUT',
      body: JSON.stringify({ modelId }),
    });
  },

  async updateModelSettings(id: string, settings: any): Promise<void> {
    return request(`/models/${encodeURIComponent(id)}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async getChats(): Promise<Chat[]> {
    return request('/chats');
  },

  async getChat(id: string): Promise<{ chat: Chat; messages: any[] }> {
    return request(`/chats/${id}`);
  },

  async createChat(data: Partial<Chat>): Promise<Chat> {
    return request('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateChat(id: string, data: Partial<Chat>): Promise<void> {
    return request(`/chats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteChat(id: string): Promise<void> {
    return request(`/chats/${id}`, {
      method: 'DELETE',
    });
  },

  async addMessage(chatId: string, msg: Partial<Message>): Promise<Message> {
    return request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(msg),
    });
  },

  async editMessage(
    messageId: string,
    data: { content: string; reasoning?: string | null; truncateAfter?: boolean; chatId?: string; timestamp?: number }
  ): Promise<void> {
    return request(`/chats/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return request(`/chats/${chatId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  },

  async stopChat(chatId: string): Promise<void> {
    return request(`/chats/${chatId}/stop`, {
      method: 'POST',
    });
  },

  async getSettings(): Promise<{
    workModeEnabled: boolean;
    workQuotaGB: number;
    workDir: string;
    workUsedGB?: number;
    workModeAllowed?: boolean;
    allowWorkOverTunnel?: boolean;
    accessClass?: string;
  }> {
    return request('/settings');
  },

  async updateSettings(data: { workModeEnabled?: boolean; workQuotaGB?: number; workDir?: string }): Promise<any> {
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getWorkFiles(dirPath?: string): Promise<{ current: string; items: any[] }> {
    const q = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
    return request(`/work/files${q}`);
  },

  async getWorkFileContent(filePath: string): Promise<{
    relativePath: string;
    filename: string;
    size: number;
    isBinary: boolean;
    content: string;
  }> {
    return request(`/work/content?path=${encodeURIComponent(filePath)}`);
  },

  async getSystemStats(): Promise<{
    os: string;
    uptimeSec: number;
    cpu: { model: string; cores: number };
    ram: { totalBytes: number; usedBytes: number; freeBytes: number; usedPercent: number };
    gpu: {
      name: string;
      totalVramMB: number;
      usedVramMB: number;
      freeVramMB: number;
      temperatureC: number;
      utilizationPercent: number;
    } | null;
  }> {
    return request('/admin/system');
  },

  async approveTool(
    approvalId: string,
    approved: boolean,
    rememberForChat?: boolean,
    approvalToken?: string
  ): Promise<any> {
    return request('/work/approve', {
      method: 'POST',
      body: JSON.stringify({ approvalId, approvalToken, approved, rememberForChat }),
    });
  },

  streamChat(
    chatId: string,
    payload: {
      assistantMessageId: string;
      modelId: string;
      messages: { role: string; content: string; attachments?: any[] }[];
      isIncognito?: boolean;
      mode?: 'chat' | 'work';
      reasoningEffort?: 'low' | 'medium' | 'high';
      enableReasoning?: boolean;
      webSearch?: boolean;
      visionMode?: 'ocr' | 'vision';
      temperature?: number;
      topP?: number;
      minP?: number;
      repeatPenalty?: number;
      chatSystemPrompt?: string;
      autoCompact?: boolean;
    },
    callbacks: {
      onMeta?: (data: { messageId: string; model: string }) => void;
      onStatus?: (status: { type: string; message: string; text?: string; query?: string; results?: any[] }) => void;
      onReasoning?: (delta: string) => void;
      onContent?: (delta: string) => void;
      onToolCall?: (data: { id: string; name: string; args: any }) => void;
      onToolApproval?: (data: {
        id: string;
        token?: string;
        tool: string;
        args: any;
        message: string;
        command?: string;
        isDangerous?: boolean;
        canRemember?: boolean;
      }) => void;
      onToolResult?: (data: { id: string; ok: boolean; output: string }) => void;
      onStats?: (stats: any) => void;
      onContextCompacted?: (data: { compactedCount: number; estimatedTokensFreed: number }) => void;
      onError?: (err: { code: string; message: string }) => void;
      onDone?: () => void;
    }
  ): () => void {
    const controller = new AbortController();

    fetch(`${API_BASE}/chats/${chatId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            let eventType = '';
            let eventData = '';

            for (const l of lines) {
              if (l.startsWith('event: ')) {
                eventType = l.substring(7).trim();
              } else if (l.startsWith('data: ')) {
                eventData = l.substring(6).trim();
              }
            }

            if (!eventType || !eventData) continue;
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === 'meta') callbacks.onMeta?.(parsed);
              else if (eventType === 'status') callbacks.onStatus?.(parsed);
              else if (eventType === 'reasoning') callbacks.onReasoning?.(parsed.delta);
              else if (eventType === 'content') callbacks.onContent?.(parsed.delta);
              else if (eventType === 'tool_call') callbacks.onToolCall?.(parsed);
              else if (eventType === 'tool_approval') callbacks.onToolApproval?.(parsed);
              else if (eventType === 'tool_result') callbacks.onToolResult?.(parsed);
              else if (eventType === 'stats') callbacks.onStats?.(parsed);
              else if (eventType === 'context_compacted') callbacks.onContextCompacted?.(parsed);
              else if (eventType === 'error') callbacks.onError?.(parsed);
              else if (eventType === 'done') callbacks.onDone?.();
            } catch {
              // ignore parse errors
            }
          }
        }
        callbacks.onDone?.();
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;

        const isBg =
          document.visibilityState === 'hidden' ||
          err.message?.toLowerCase().includes('load failed') ||
          err.message?.toLowerCase().includes('failed to fetch') ||
          err.name === 'TypeError';

        callbacks.onError?.({
          code: isBg ? 'BACKGROUNDED' : 'STREAM_ERROR',
          message: err.message,
        });
      });

    return () => controller.abort();
  },

  subscribeModelEvents(onEvent: (event: ModelProgressEvent) => void): () => void {
    const url = `${API_BASE}/models/events`;
    const sse = new EventSource(url, { withCredentials: true });
    sse.addEventListener('model_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch {
        // ignore
      }
    });
    return () => sse.close();
  },

  async getAdminInfo(): Promise<any> {
    return request('/admin/info');
  },

  async updateConfig(cfg: any): Promise<any> {
    return request('/admin/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    });
  },

  async regenerateToken(): Promise<{ ok: boolean; plainToken: string; config: any }> {
    return request('/admin/token/regenerate', {
      method: 'POST',
    });
  },

  async getSessions(): Promise<{
    sessions: Array<{
      id: string;
      id_hash: string;
      created_at: number;
      last_seen: number;
      user_agent: string;
      access_class: string;
      is_current: boolean;
    }>;
  }> {
    return request('/auth/sessions');
  },

  async revokeSession(id: string): Promise<void> {
    return request(`/auth/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getModelSettings(id: string): Promise<any> {
    return request(`/models/${encodeURIComponent(id)}/settings`);
  },

  async estimateModel(
    id: string,
    params: { gpuLayers?: number; contextTokens?: number; kvCacheType?: string }
  ): Promise<any> {
    const q = new URLSearchParams();
    if (params.gpuLayers !== undefined) q.set('gpuLayers', params.gpuLayers.toString());
    if (params.contextTokens !== undefined) q.set('contextTokens', params.contextTokens.toString());
    if (params.kvCacheType) q.set('kvCacheType', params.kvCacheType);
    return request(`/models/${encodeURIComponent(id)}/estimate?${q.toString()}`);
  },

  async clearChatContext(chatId: string): Promise<any> {
    return request(`/chats/${encodeURIComponent(chatId)}/context/clear`, {
      method: 'POST',
    });
  },

  async compactChatContext(chatId: string): Promise<any> {
    return request(`/chats/${encodeURIComponent(chatId)}/context/compact`, {
      method: 'POST',
    });
  },

  async undoChatContext(chatId: string): Promise<any> {
    return request(`/chats/${encodeURIComponent(chatId)}/context/undo`, {
      method: 'POST',
    });
  },

  async getUsageSnapshot(chatId?: string | null, modelId?: string | null): Promise<any> {
    const params = new URLSearchParams();
    if (chatId) params.set('chatId', chatId);
    if (modelId) params.set('modelId', modelId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request(`/usage/snapshot${qs}`);
  },

  subscribeUsage(
    chatId: string | null | undefined,
    modelId: string | null | undefined,
    onSnapshot: (data: any) => void
  ): () => void {
    const params = new URLSearchParams();
    if (chatId) params.set('chatId', chatId);
    if (modelId) params.set('modelId', modelId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const url = `${API_BASE}/usage/stream${qs}`;
    const sse = new EventSource(url, { withCredentials: true });
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onSnapshot(data);
      } catch {
        // ignore
      }
    };
    return () => sse.close();
  },

  async getSkills(): Promise<{ skills: any[] }> {
    return request('/skills');
  },

  async toggleSkill(id: string, enabled: boolean): Promise<{ ok: boolean; skills: any[] }> {
    return request(`/skills/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  async deleteSkill(id: string): Promise<{ ok: boolean; skills: any[] }> {
    return request(`/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async uploadSkill(file: File): Promise<{ ok: boolean; skill: any; skills: any[] }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/skills/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async generateGuestToken(): Promise<{
    ok: boolean;
    plainGuestToken: string;
    guestConnectUrl: string;
    guestQrCodeDataUrl: string;
    config: any;
  }> {
    return request('/admin/guest-token/generate', {
      method: 'POST',
    });
  },

  async revokeGuestToken(): Promise<{ ok: boolean; config: any }> {
    return request('/admin/guest-token/revoke', {
      method: 'POST',
    });
  },

  async getGuestChats(): Promise<{
    chats: Array<{
      id: string;
      title: string;
      mode: string;
      model_id: string;
      guest_session_id: string;
      created_at: number;
      updated_at: number;
      messageCount: number;
      lastSnippet: string;
    }>;
  }> {
    return request('/admin/guest-chats');
  },

  async getGuestChat(id: string): Promise<{ chat: any; messages: any[] }> {
    return request(`/admin/guest-chats/${encodeURIComponent(id)}`);
  },

  async deleteGuestChat(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/guest-chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getSetupStatus(): Promise<{
    isConfigured: boolean;
    isLocal: boolean;
    detectedLlamaPath: string | null;
    defaultModelsPath: string;
    defaultWorkPath: string;
    defaultModelsCount: number;
    gpu: { hasNvidia: boolean; name: string | null };
  }> {
    return request('/setup/status');
  },

  async browseFile(): Promise<{ selectedPath: string | null }> {
    return request('/setup/browse-file', { method: 'POST' });
  },

  async browseFolder(): Promise<{ selectedPath: string | null }> {
    return request('/setup/browse-folder', { method: 'POST' });
  },

  async scanModels(dirPath: string): Promise<{ count: number; models: string[] }> {
    return request('/setup/scan-models', {
      method: 'POST',
      body: JSON.stringify({ dirPath }),
    });
  },

  downloadLlamaServer(variant: 'cuda' | 'vulkan' | 'cpu', onProgress: (data: any) => void): () => void {
    const sse = new EventSource(`${API_BASE}/setup/download?variant=${variant}`, { withCredentials: true });
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onProgress(data);
      } catch {}
    };
    return () => sse.close();
  },

  async saveSetup(payload: any): Promise<{
    ok: boolean;
    plainToken: string;
    connectUrl: string;
    lanIp: string;
    qrCodeDataUrl: string;
    config: any;
  }> {
    return request('/setup/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};



