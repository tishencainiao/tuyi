// 与 server.js（v1.1.0+ 接口）契约一一对应，2026-11 已按源码核对。
// 所有请求带 credentials:'include'（httpOnly cookie 会话）。

export interface User {
  userId: string;
  username: string;
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}

export interface MemoryItem {
  id: string;
  ts: string;
  text: string;
  tags: string[];
}

export interface ItineraryDay {
  title: string;
  items: string[];
}

export interface Itinerary {
  ts: string;
  title: string;
  destination: string;
  budget_cny: number;
  days: ItineraryDay[];
  status?: 'draft' | 'confirmed' | 'in_progress' | 'completed'; // v3.1.0 行程生命周期
}

export interface Insights {
  summary?: string;
  tags?: string[];
}

export interface Profile {
  userId: string;
  username: string;
  created: string;
  insights: Insights | null;
  memories: MemoryItem[];
  itineraries: Itinerary[];
  turnsCount: number;
}

export interface CityStat {
  city: string;
  count: number;
  days: number;
  firstVisit: string;
  lastVisit: string;
}

export interface TagStat {
  label: string;
  value: number;
}

export interface PersonalStats {
  tripCount: number;
  cityCount: number;
  totalDays: number;
  totalBudget: number;
  avgBudget: number;
  cities: CityStat[];
  tags: TagStat[];
  memories: number;
  turnsCount: number;
  hasInsights: boolean;
  recentTrips: Array<{
    ts: string;
    title: string;
    destination: string;
    days: number;
    budget_cny: number;
  }>;
}

export interface Visit {
  name: string;
  level: 'province' | 'city';
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, { credentials: 'include', ...options });
  } catch {
    throw new ApiError(0, '网络连接失败，请确认服务已启动');
  }
  const text = await resp.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!resp.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : '请求失败（HTTP ' + resp.status + '）';
    throw new ApiError(resp.status, message);
  }
  return body as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  me: () => request<{ user: User }>('/api/me'),
  register: (username: string, password: string) =>
    request<{ user: User }>('/api/register', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: User }>('/api/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),

  history: (conversationId: string, limit = 40) =>
    request<{ conversationId: string; turns: Turn[] }>(
      '/api/history?conversationId=' + encodeURIComponent(conversationId) + '&limit=' + limit,
    ),
  profile: () => request<Profile>('/api/profile'),
  personalStats: () => request<PersonalStats>('/api/stats/personal'),

  visits: () => request<{ manual: Visit[] }>('/api/visits'),
  addVisit: (name: string, level: string) =>
    request<{ ok: boolean }>('/api/visits', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, level }),
    }),
  removeVisit: (name: string, level: string) =>
    request<{ ok: boolean }>(
      '/api/visits?name=' + encodeURIComponent(name) + '&level=' + encodeURIComponent(level),
      { method: 'DELETE' },
    ),

  createMemory: (text: string, tags: string[]) =>
    request<{ ok: boolean }>('/api/memory', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ text, tags }),
    }),
  updateMemory: (id: string, patch: { text?: string; tags?: string[] }) =>
    request<{ ok: boolean; memory: MemoryItem }>(
      '/api/memory/' + encodeURIComponent(id),
      { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(patch) },
    ),
  removeMemory: (id: string) =>
    request<{ ok: boolean }>('/api/memory/' + encodeURIComponent(id), { method: 'DELETE' }),
};

export interface ChatHandlers {
  onDelta?: (text: string) => void;
  onToolStart?: (name: string) => void;
  onToolResult?: (name: string, ok: boolean) => void;
  onItinerary?: (value: Itinerary) => void;
  onDone?: (steps: number, note?: string) => void;
  onError?: (message: string) => void;
}

// SSE 分帧：server.js 每条事件为 "data: {json}\n\n"
export async function chatStream(
  message: string,
  conversationId: string,
  handlers: ChatHandlers,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'include',
      headers: JSON_HEADERS,
      body: JSON.stringify({ message, conversationId }),
    });
  } catch {
    handlers.onError?.('网络连接失败，请确认服务已启动');
    return;
  }
  if (!resp.ok) {
    let messageText = '请求失败（HTTP ' + resp.status + '）';
    try {
      const body = await resp.json();
      if (body && typeof body.error === 'string') messageText = body.error;
    } catch {
      /* 忽略 */
    }
    handlers.onError?.(messageText);
    return;
  }
  if (!resp.body) {
    handlers.onError?.('当前浏览器不支持流式响应');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatch = (evt: unknown) => {
    if (!evt || typeof evt !== 'object') return;
    const event = evt as { type?: string; [key: string]: unknown };
    switch (event.type) {
      case 'delta':
        handlers.onDelta?.(String(event.text || ''));
        break;
      case 'tool_start':
        handlers.onToolStart?.(String(event.name || ''));
        break;
      case 'tool_result':
        handlers.onToolResult?.(String(event.name || ''), event.ok !== false);
        break;
      case 'itinerary':
        handlers.onItinerary?.(event.value as Itinerary);
        break;
      case 'done':
        handlers.onDone?.(Number(event.steps) || 0, event.note as string | undefined);
        break;
      case 'error':
        handlers.onError?.(String(event.message || '服务端出错，请稍后重试'));
        break;
    }
  };

  const process = (chunk: string) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const line = frame.split('\n').find((part) => part.startsWith('data: '));
      if (!line) continue;
      try {
        dispatch(JSON.parse(line.slice(6)));
      } catch {
        /* 坏帧跳过 */
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process(decoder.decode(value, { stream: true }));
  }
  process(decoder.decode());
  if (buffer.trim()) {
    // 兼容末尾缺空行的半帧
    const line = buffer.split('\n').find((part) => part.startsWith('data: '));
    if (line) {
      try {
        dispatch(JSON.parse(line.slice(6)));
      } catch {
        /* 忽略 */
      }
    }
  }
}
