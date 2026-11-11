'use strict';

/**
 * ReAct 主循环：思考 → 工具调用 → 结果回喂 → …（最多 max_agent_steps 步）
 * 产出事件：{type:'delta'} | {type:'tool_start'} | {type:'tool_result'} | {type:'itinerary'} | {type:'done'} | {type:'error'}
 *
 * 记忆：开轮时把「分层记忆」注入系统提示；收尾时抽取本轮事实、必要时触发 Python 记忆消化。
 */

const fs = require('node:fs');
const path = require('node:path');
const { chatStream } = require('./llm');
const tools = require('./tools');
const memory = require('./memory');
const profile = require('./profile');

const PROMPT_DIR = path.join(__dirname, 'prompts');
const promptCache = new Map();

function loadPrompt(name) {
  if (!promptCache.has(name)) {
    promptCache.set(name, fs.readFileSync(path.join(PROMPT_DIR, name), 'utf8'));
  }
  return promptCache.get(name);
}

async function rememberSafely(args) {
  try {
    await memory.rememberTurn(args);
  } catch {
    /* 记忆写入失败不影响本轮对话 */
  }
}

async function* runAgent({ cfg, userId, userText, conversationId = 'default' }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const llmCfg = cfg.llm || {};
  const maxSteps = Math.max(1, Number(llmCfg.max_agent_steps) || 6);

  const memoryEnabled = process.env.TUYI_DISABLE_MEMORY !== '1';
  const record = memoryEnabled ? memory.load(userId) : memory.emptyRecord(userId);
  const memoryBlock = memoryEnabled ? memory.renderBlock(record, userText, cfg.memory || {}) : '';
  if (memoryEnabled && process.env.TUYI_DEBUG_MEMORY && memoryBlock) {
    console.error('[memory-block]\n' + memoryBlock);
  }

  const history = memoryEnabled
    ? memory.getHistory(userId, conversationId, 20).map((turn) => ({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: String(turn.text || '').slice(0, 1200),
      }))
    : [];

  // v3.2.0：用户资料注入（注册引导页 / 个人中心填写的资料，排行程时参考）
  const profileBlock = profile.renderProfileBlock(profile.getProfile(userId));

  const messages = [
    {
      role: 'system',
      content: loadPrompt('persona.md') + (profileBlock ? '\n\n' + profileBlock : '') + (memoryBlock ? '\n\n' + memoryBlock : ''),
    },
    ...history,
    { role: 'user', content: userText },
  ];
  let finalText = '';
  let lastItinerary = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    const toolCalls = [];
    let text = '';

    for await (const event of chatStream({
      apiKey,
      baseUrl: llmCfg.base_url,
      model: llmCfg.model,
      messages,
      tools: tools.defs(),
      temperature: llmCfg.temperature,
      timeoutMs: llmCfg.request_timeout_ms,
    })) {
      if (event.delta) {
        text += event.delta;
        yield { type: 'delta', text: event.delta };
      }
      if (event.toolCalls) toolCalls.push(...event.toolCalls);
    }
    finalText = text;

    if (toolCalls.length === 0) {
      if (memoryEnabled) {
        await rememberSafely({ cfg, userId, userText, assistantText: finalText, itinerary: lastItinerary, conversationId });
      }
      yield { type: 'done', steps: step };
      return;
    }

    const normalized = toolCalls.map((tc, index) => ({
      id: tc.id || 'call_' + step + '_' + index,
      name: tc.function.name,
      arguments: tc.function.arguments || '{}',
    }));

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: normalized.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const call of normalized) {
      yield { type: 'tool_start', name: call.name };
      let result;
      try {
        result = await tools.dispatch(call.name, call.arguments, { userId, conversationId });
      } catch (err) {
        result = { ok: false, error: err && err.message ? err.message : String(err) };
      }
      yield { type: 'tool_result', name: call.name, ok: result.ok !== false };
      if (result && result.itinerary) {
        // v3.1.0：行程落库在工具循环里直接完成（而非收尾 rememberTurn），
        // 前端拿到的 itinerary 事件带 id/status，可原地渲染「草稿待确认」卡片。
        if (memoryEnabled && result.itinerary.mode) {
          const stored = memory.upsertItinerary(userId, result.itinerary, {
            mode: result.itinerary.mode,
            planId: result.itinerary.id,
          });
          if (stored && stored.ok && stored.itinerary) {
            result.itinerary = stored.itinerary;
            lastItinerary = stored.itinerary;
            yield { type: 'itinerary', value: stored.itinerary };
          } else {
            lastItinerary = result.itinerary;
            yield { type: 'itinerary', value: result.itinerary };
          }
        } else {
          lastItinerary = result.itinerary;
          yield { type: 'itinerary', value: result.itinerary };
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  if (memoryEnabled) {
    await rememberSafely({ cfg, userId, userText, assistantText: finalText, itinerary: lastItinerary, conversationId });
  }
  yield { type: 'done', steps: maxSteps, note: '达到最大步数，已停止工具循环' };
}

module.exports = { runAgent, loadPrompt };
