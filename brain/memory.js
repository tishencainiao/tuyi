'use strict';

/**
 * 分层记忆（轻量版）
 *
 * - 短期：最近若干轮对话（turns，最多 40 条）
 * - 长期：从对话里抽取的「关于用户的事实」（memories）
 * - 消化：Python py/digest.py 把 memories 反思合成 insights（偏好标签 + 一句话认识）
 *
 * 存储：data/memory/<userId>.json（data/ 已 gitignore，不会进版本库）
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chatOnce, parseJsonLoose } = require('./llm');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data', 'memory');
const MAX_TURNS = 40;
const MAX_MEMORIES = 200;
const MAX_ITINERARIES = 20;

const promptCache = new Map();

function loadPrompt(name) {
  if (!promptCache.has(name)) {
    promptCache.set(name, fs.readFileSync(path.join(__dirname, 'prompts', name), 'utf8'));
  }
  return promptCache.get(name);
}

function sanitizeUserId(userId) {
  return String(userId || '').replace(/[^\w-]/g, '_').slice(0, 64) || 'anonymous';
}

function userFile(userId) {
  return path.join(DATA_DIR, sanitizeUserId(userId) + '.json');
}

function emptyRecord(userId) {
  return {
    userId: sanitizeUserId(userId),
    created: new Date().toISOString(),
    turns: [],
    memories: [],
    itineraries: [],
    insights: null,
    state: { lastDigestAt: null, memoriesSinceDigest: 0 },
  };
}

function load(userId) {
  try {
    const raw = fs.readFileSync(userFile(userId), 'utf8');
    const record = JSON.parse(raw);
    record.turns = Array.isArray(record.turns) ? record.turns : [];
    record.memories = Array.isArray(record.memories) ? record.memories : [];
    record.itineraries = Array.isArray(record.itineraries) ? record.itineraries : [];
    record.state = record.state || { lastDigestAt: null, memoriesSinceDigest: 0 };
    return record;
  } catch {
    return emptyRecord(userId);
  }
}

function save(record) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = userFile(record.userId);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function appendTurn(record, role, text) {
  const value = String(text || '').trim();
  if (!value) return;
  record.turns.push({ ts: new Date().toISOString(), role, text: value.slice(0, 2000) });
  if (record.turns.length > MAX_TURNS) record.turns = record.turns.slice(-MAX_TURNS);
}

function normalizeFact(text) {
  return String(text || '')
    .replace(/[\s，。,.!！?？、；;：:"'“”‘’]/g, '')
    .toLowerCase();
}

function addFacts(record, facts) {
  if (!Array.isArray(facts) || !facts.length) return 0;
  const existing = new Set(record.memories.map((memory) => normalizeFact(memory.text)));
  let added = 0;
  for (const fact of facts) {
    const text = String((fact && fact.text) || '').trim();
    const key = normalizeFact(text);
    if (!key || key.length < 2 || existing.has(key)) continue;
    existing.add(key);
    record.memories.push({
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      text: text.slice(0, 200),
      tags: Array.isArray(fact.tags)
        ? fact.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 4)
        : [],
    });
    added += 1;
  }
  if (record.memories.length > MAX_MEMORIES) record.memories = record.memories.slice(-MAX_MEMORIES);
  record.state.memoriesSinceDigest = (record.state.memoriesSinceDigest || 0) + added;
  return added;
}

function appendItinerary(record, itinerary) {
  if (!itinerary || !itinerary.destination || !Array.isArray(itinerary.days)) return false;
  record.itineraries.push({
    ts: new Date().toISOString(),
    title: String(itinerary.title || ''),
    destination: String(itinerary.destination),
    budget_cny: Number(itinerary.budget_cny) || 0,
    days: itinerary.days.slice(0, 10),
  });
  if (record.itineraries.length > MAX_ITINERARIES) {
    record.itineraries = record.itineraries.slice(-MAX_ITINERARIES);
  }
  return true;
}

function bigrams(text) {
  const clean = String(text || '').replace(/[\s，。,.!！?？、；;：:"'“”‘’]/g, '');
  const set = new Set();
  for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2));
  return set;
}

function scoreMemory(queryBigrams, memory, now) {
  const target = bigrams(memory.text + ' ' + (memory.tags || []).join(' '));
  let overlap = 0;
  for (const gram of queryBigrams) if (target.has(gram)) overlap += 1;
  if (!overlap) return 0;
  const ageDays = Math.max(0, (now - Date.parse(memory.ts || '')) / 86400000);
  return overlap / (1 + ageDays / 30);
}

function retrieve(record, query, limit = 5) {
  const queryBigrams = bigrams(query);
  const now = Date.now();
  return record.memories
    .map((memory) => ({ memory, score: scoreMemory(queryBigrams, memory, now) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((item) => item.memory);
}

function renderBlock(record, userText, memoryCfg = {}) {
  const lines = [];
  const insights = record.insights;
  if (insights && Array.isArray(insights.tags) && insights.tags.length) {
    lines.push('偏好标签：' + insights.tags.join('、'));
  }
  if (insights && insights.summary) {
    lines.push('关于这位用户的认识：' + insights.summary);
  }
  const related = retrieve(record, userText, memoryCfg.max_inject_memories || 5);
  if (related.length) {
    lines.push('相关历史记忆：');
    for (const memory of related) lines.push('- ' + memory.text);
  }
  if (!lines.length) return '';
  return (
    '【用户记忆（来自历史对话，供参考）】\n' +
    lines.join('\n') +
    '\n（若与用户本次说法冲突，以本次说法为准；不要主动复述这些记忆，除非用户问起。）'
  );
}

function digestDue(record, memoryCfg = {}) {
  const trigger = Math.max(1, Number(memoryCfg.digest_trigger_count) || 3);
  const minIntervalMs = Math.max(1, Number(memoryCfg.digest_min_interval_minutes) || 10) * 60 * 1000;
  const since = record.state.memoriesSinceDigest || 0;
  const lastAt = record.state.lastDigestAt ? Date.parse(record.state.lastDigestAt) : 0;
  return { due: since >= trigger && Date.now() - lastAt >= minIntervalMs, since };
}

function markDigest(record) {
  record.state.lastDigestAt = new Date().toISOString();
  record.state.memoriesSinceDigest = 0;
}

function spawnDigest(userId) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = path.join(ROOT, 'py', 'digest.py');
  const child = spawn(python, [script, '--user', sanitizeUserId(userId), '--force'], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', () => {
    /* 没有 Python 时静默跳过，不影响对话 */
  });
  return child;
}

async function extractFacts({ cfg, userText, assistantText }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return [];
  const llmCfg = cfg.llm || {};
  const { text } = await chatOnce({
    apiKey,
    baseUrl: llmCfg.base_url,
    model: llmCfg.model,
    messages: [
      { role: 'system', content: loadPrompt('memory-extract.md') },
      {
        role: 'user',
        content: '用户说：' + userText + '\n助手回复：' + String(assistantText || '').slice(0, 1500),
      },
    ],
    temperature: 0.1,
    timeoutMs: 30000,
  });
  const parsed = parseJsonLoose(text);
  const facts = parsed && Array.isArray(parsed.facts) ? parsed.facts : [];
  return facts
    .filter((fact) => fact && String(fact.text || '').trim())
    .slice(0, 4)
    .map((fact) => ({
      text: String(fact.text).trim(),
      tags: Array.isArray(fact.tags) ? fact.tags : [],
    }));
}

async function rememberTurn({ cfg, userId, userText, assistantText, itinerary }) {
  const record = load(userId);
  appendTurn(record, 'user', userText);
  if (assistantText) appendTurn(record, 'assistant', assistantText);
  if (itinerary) appendItinerary(record, itinerary);
  try {
    const facts = await extractFacts({ cfg, userText, assistantText });
    addFacts(record, facts);
  } catch {
    /* 抽取失败不影响主流程 */
  }
  const { due } = digestDue(record, cfg.memory || {});
  save(record);
  if (due) {
    markDigest(record);
    save(record);
    spawnDigest(userId);
  }
  return record;
}

module.exports = {
  DATA_DIR,
  sanitizeUserId,
  emptyRecord,
  load,
  save,
  appendTurn,
  addFacts,
  appendItinerary,
  bigrams,
  retrieve,
  renderBlock,
  digestDue,
  markDigest,
  extractFacts,
  rememberTurn,
  spawnDigest,
};
