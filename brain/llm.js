'use strict';

/**
 * DeepSeek（OpenAI 兼容）流式客户端。
 * 事件流：{ delta } 文本增量 | { toolCalls } 工具调用（流结束前一次性产出）| { usage } 用量
 */

const DEFAULT_TIMEOUT_MS = 120000;

function buildEndpoint(baseUrl) {
  const base = String(baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  return base.endsWith('/v1') ? base + '/chat/completions' : base + '/v1/chat/completions';
}

function emptyToolCall() {
  return { id: '', type: 'function', function: { name: '', arguments: '' } };
}

async function* chatStream({
  apiKey,
  baseUrl,
  model,
  messages,
  tools,
  temperature = 0.7,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (!apiKey) {
    throw new Error('缺少 DEEPSEEK_API_KEY：请复制 .env.example 为 .env 并填写密钥');
  }
  const payload = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }
  if (typeof temperature === 'number') payload.temperature = temperature;

  const resp = await fetch(buildEndpoint(baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error('LLM 请求失败（HTTP ' + resp.status + '）：' + detail.slice(0, 300));
  }
  if (!resp.body) throw new Error('LLM 响应缺少 body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map();
  let buffer = '';
  let toolCallsEmitted = false;

  function* emitToolCalls() {
    if (toolCallsEmitted || toolCalls.size === 0) return;
    toolCallsEmitted = true;
    yield { toolCalls: [...toolCalls.values()].filter((tc) => tc.function.name) };
  }

  function accumulate(tc) {
    const index = Number.isInteger(tc.index) ? tc.index : 0;
    const acc = toolCalls.get(index) || emptyToolCall();
    if (tc.id) acc.id = tc.id;
    if (tc.function && tc.function.name) acc.function.name += tc.function.name;
    if (tc.function && tc.function.arguments) acc.function.arguments += tc.function.arguments;
    toolCalls.set(index, acc);
  }

  function* handleLine(rawLine) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') {
      yield* emitToolCalls();
      return;
    }
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (json.usage) yield { usage: json.usage };
    const choice = json.choices && json.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.content) yield { delta: delta.content };
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) accumulate(tc);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      yield* handleLine(line);
    }
  }
  if (buffer.trim()) yield* handleLine(buffer);
  yield* emitToolCalls();
}

module.exports = { chatStream, buildEndpoint };
