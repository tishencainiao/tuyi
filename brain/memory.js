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
const { cleanTags } = require('./meta-tags');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data', 'memory');
const MAX_TURNS = 120;
const MAX_MEMORIES = 200;
const MAX_ITINERARIES = 20;

// 记忆文件 schema 版本（v3.4.0）：1=初始，2=行程带 id/status/时间字段
const CURRENT_SCHEMA = 2;

// 行程状态机（v3.1.0）：生成后是草稿，用户确认后才算数
// v3.5.0：改为全连通——任意状态可回退到其他状态（回退由前端确认框把关）
const PLAN_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};
const STATUS_FLOW = {
  draft: [PLAN_STATUS.CONFIRMED, PLAN_STATUS.IN_PROGRESS, PLAN_STATUS.COMPLETED],
  confirmed: [PLAN_STATUS.DRAFT, PLAN_STATUS.IN_PROGRESS, PLAN_STATUS.COMPLETED],
  in_progress: [PLAN_STATUS.DRAFT, PLAN_STATUS.CONFIRMED, PLAN_STATUS.COMPLETED],
  completed: [PLAN_STATUS.DRAFT, PLAN_STATUS.CONFIRMED, PLAN_STATUS.IN_PROGRESS],
};

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
    schemaVersion: CURRENT_SCHEMA,
    turns: [],
    memories: [],
    itineraries: [],
    visits: [],
    insights: null,
    state: { lastDigestAt: null, memoriesSinceDigest: 0 },
  };
}

function load(userId) {
  try {
    const raw = fs.readFileSync(userFile(userId), 'utf8');
    const record = JSON.parse(raw);
    record.turns = Array.isArray(record.turns) ? record.turns : [];
    record.turns.forEach((turn) => {
      if (!turn.conversationId) turn.conversationId = 'default';
    });
    record.memories = Array.isArray(record.memories) ? record.memories : [];
    record.itineraries = Array.isArray(record.itineraries) ? record.itineraries : [];
    record.visits = Array.isArray(record.visits) ? record.visits : [];
    record.state = record.state || { lastDigestAt: null, memoriesSinceDigest: 0 };
    ensureItineraryShape(record);
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

function appendTurn(record, role, text, conversationId = 'default') {
  const value = String(text || '').trim();
  if (!value) return;
  record.turns.push({
    ts: new Date().toISOString(),
    role,
    text: value.slice(0, 2000),
    conversationId: String(conversationId || 'default'),
  });
  if (record.turns.length > MAX_TURNS) record.turns = record.turns.slice(-MAX_TURNS);
}

function getHistory(userId, conversationId = 'default', limit = 40) {
  const record = load(userId);
  return record.turns
    .filter((turn) => String(turn.conversationId || 'default') === String(conversationId))
    .slice(-Math.max(1, Number(limit) || 40));
}

function normalizeFact(text) {
  return String(text || '')
    .replace(/[\s，。,.!！?？、；;：:"'“”‘’]/g, '')
    .toLowerCase();
}

function similarText(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return false;
  let overlap = 0;
  for (const gram of left) if (right.has(gram)) overlap += 1;
  return overlap / Math.min(left.size, right.size) >= 0.8;
}

function addFacts(record, facts) {
  if (!Array.isArray(facts) || !facts.length) return 0;
  const existing = new Set(record.memories.map((memory) => normalizeFact(memory.text)));
  let added = 0;
  for (const fact of facts) {
    const text = String((fact && fact.text) || '').trim();
    const key = normalizeFact(text);
    if (!key || key.length < 2 || existing.has(key)) continue;
    if (record.memories.some((memory) => similarText(memory.text, text))) continue;
    existing.add(key);
    record.memories.push({
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      text: text.slice(0, 200),
      // v3.6.0：标签过元操作黑名单（记忆修改/删除记忆等不落库）
      tags: cleanTags(fact.tags, 4),
    });
    added += 1;
  }
  if (record.memories.length > MAX_MEMORIES) record.memories = record.memories.slice(-MAX_MEMORIES);
  record.state.memoriesSinceDigest = (record.state.memoriesSinceDigest || 0) + added;
  return added;
}

function newPlanId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ensureItineraryShape(record) {
  // v3.1.0 迁移：旧行程补 id / 状态 / 时间字段；旧行程一律置为「草稿」，等用户确认才算数
  let migrated = 0;
  for (const itinerary of record.itineraries || []) {
    if (!itinerary.id) {
      itinerary.id = newPlanId();
      migrated += 1;
    }
    if (!itinerary.status) {
      itinerary.status = PLAN_STATUS.DRAFT;
      migrated += 1;
    }
    if (!itinerary.createdAt) itinerary.createdAt = itinerary.ts || new Date().toISOString();
    if (!itinerary.updatedAt) itinerary.updatedAt = itinerary.createdAt;
  }
  // v3.4.0：schema 版本号（历史文件无该字段，补上并落盘；未来迁移按版本写）
  if (record.schemaVersion !== CURRENT_SCHEMA) {
    record.schemaVersion = CURRENT_SCHEMA;
    migrated += 1;
  }
  if (migrated) save(record);
}

function findPlan(record, planId) {
  const id = String(planId || '');
  return (record.itineraries || []).find((item) => String(item.id) === id) || null;
}

function upsertItinerary(userId, itinerary, options = {}) {
  if (!itinerary || !itinerary.destination || !Array.isArray(itinerary.days)) {
    return { ok: false, error: '行程缺少 destination 或 days' };
  }
  const record = load(userId);
  const mode = options.mode || itinerary.mode || (itinerary.id || itinerary.plan_id ? 'update' : 'create');
  const planId = String(options.planId || itinerary.plan_id || itinerary.id || '');
  const now = new Date().toISOString();

  if (mode === 'update') {
    const target = findPlan(record, planId);
    if (!target) return { ok: false, error: '找不到要修改的行程（plan_id=' + planId + '），请先用 get_plan 确认' };
    const before = {
      title: target.title,
      destination: target.destination,
      budget_cny: target.budget_cny,
      days: target.days,
    };
    // v3.5.0：previousDays 只收「这次真的被替换掉的天」——
    // 新 days 里日期仍在的天（未改动/保留的后续天）不进入 previousDays
    const newDateSet = new Set(
      (Array.isArray(itinerary.days) ? itinerary.days : []).map((day) => String(day && day.date)),
    );
    const replacedDays = before.days.filter((day) => !newDateSet.has(String(day && day.date)));
    const merged = new Map();
    const seenDates = new Set();
    const existing = Array.isArray(target.previousDays) ? target.previousDays : [];
    for (const day of [...existing, ...replacedDays]) {
      const key = String(day && day.date);
      if (!key || seenDates.has(key)) continue;
      seenDates.add(key);
      merged.set(key, day);
    }
    target.previousDays = [...merged.values()].slice(0, 20);
    target.title = String(itinerary.title || before.title);
    target.destination = String(itinerary.destination || before.destination);
    target.budget_cny = Number(itinerary.budget_cny) || before.budget_cny;
    target.days = itinerary.days.slice(0, 10);
    target.revisions = (target.revisions || 0) + 1;
    target.updatedAt = now;
    save(record);
    return { ok: true, itinerary: target, updated: true };
  }

  const stored = {
    id: newPlanId(),
    ts: now,
    createdAt: now,
    updatedAt: now,
    status: PLAN_STATUS.DRAFT,
    title: String(itinerary.title || ''),
    destination: String(itinerary.destination),
    budget_cny: Number(itinerary.budget_cny) || 0,
    days: itinerary.days.slice(0, 10),
  };
  record.itineraries.push(stored);
  if (record.itineraries.length > MAX_ITINERARIES) {
    record.itineraries = record.itineraries.slice(-MAX_ITINERARIES);
  }
  save(record);
  return { ok: true, itinerary: stored, created: true };
}

function getPlan(userId, planId) {
  const record = load(userId);
  return findPlan(record, planId);
}

function listPlans(userId) {
  const record = load(userId);
  return (record.itineraries || [])
    .slice()
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .map((plan) => ({ ...plan }));
}

function setItineraryStatus(userId, planId, status) {
  const record = load(userId);
  const plan = findPlan(record, planId);
  if (!plan) return { ok: false, error: '找不到该行程方案' };
  if (!PLAN_STATUS[String(status || '').toUpperCase()]) {
    return { ok: false, error: '状态不合法，可选：draft / confirmed / in_progress / completed' };
  }
  if (plan.status === status) return { ok: true, itinerary: plan, existed: true };
  const allowed = STATUS_FLOW[plan.status] || [];
  if (!allowed.includes(status)) {
    return { ok: false, error: '不能从「' + plan.status + '」改为「' + status + '」（允许：' + allowed.join('、') + '）' };
  }
  plan.status = status;
  plan.updatedAt = new Date().toISOString();
  save(record);
  return { ok: true, itinerary: plan };
}

function removeItinerary(userId, planId) {
  const record = load(userId);
  const plan = findPlan(record, planId);
  if (!plan) return { ok: false, error: '找不到该行程方案' };
  if (plan.status !== PLAN_STATUS.DRAFT) {
    return { ok: false, error: '只有「草稿」状态的方案可以删除；已确认的方案不能删除' };
  }
  record.itineraries = record.itineraries.filter((item) => String(item.id) !== String(planId));
  // v3.5.0：删除后补一条记事，让小忆知道这件事（时间线里不再有它）
  appendTurn(record, 'assistant', '记事：用户删除了行程方案「' + plan.title + '」。', 'default');
  save(record);
  return { ok: true, removed: plan };
}

function renameItinerary(userId, planId, title) {
  const record = load(userId);
  const plan = findPlan(record, planId);
  if (!plan) return { ok: false, error: '找不到该行程方案' };
  const clean = String(title || '').trim();
  if (clean.length < 1 || clean.length > 60) {
    return { ok: false, error: '行程名长度需在 1~60 字之间' };
  }
  plan.title = clean;
  plan.updatedAt = new Date().toISOString();
  save(record);
  return { ok: true, itinerary: plan };
}

function findMemories(userId, text) {
  const record = load(userId);
  const key = normalizeFact(text);
  if (!key) return [];
  return record.memories.filter((memory) => {
    const value = normalizeFact(memory.text);
    return value.includes(key) || key.includes(value);
  });
}

function addMemory(userId, text, tags) {
  const record = load(userId);
  const added = addFacts(record, [{ text, tags: Array.isArray(tags) ? tags : [] }]);
  if (!added) return { ok: false, error: '内容为空、太短或已存在' };
  save(record);
  return { ok: true };
}

function updateMemory(userId, id, patch = {}) {
  const record = load(userId);
  const item = record.memories.find((memory) => memory.id === id);
  if (!item) return { ok: false, error: '找不到这条记忆' };
  if (patch.text !== undefined) {
    const text = String(patch.text || '').trim();
    if (text.length < 2) return { ok: false, error: '记忆内容太短' };
    item.text = text.slice(0, 200);
  }
  if (Array.isArray(patch.tags)) {
    // v3.6.0：编辑记忆时同样过元操作黑名单
    item.tags = cleanTags(patch.tags, 4);
  }
  item.updated = new Date().toISOString();
  save(record);
  return { ok: true, memory: item };
}

function removeMemory(userId, id) {
  const record = load(userId);
  const index = record.memories.findIndex((memory) => memory.id === id);
  if (index < 0) return { ok: false, error: '找不到这条记忆' };
  const [removed] = record.memories.splice(index, 1);
  save(record);
  return { ok: true, removed };
}

function listVisits(userId) {
  const record = load(userId);
  return Array.isArray(record.visits) ? record.visits : [];
}

function addVisit(userId, name, level) {
  const clean = String(name || '').trim();
  const targetLevel = level === 'province' ? 'province' : 'city';
  if (!clean) return { ok: false, error: '缺少地名' };
  const record = load(userId);
  record.visits = Array.isArray(record.visits) ? record.visits : [];
  if (record.visits.some((item) => item.name === clean && item.level === targetLevel)) {
    return { ok: true, existed: true };
  }
  record.visits.push({ name: clean, level: targetLevel, ts: new Date().toISOString() });
  save(record);
  return { ok: true };
}

function removeVisit(userId, name, level) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: '缺少地名' };
  const record = load(userId);
  const before = Array.isArray(record.visits) ? record.visits.length : 0;
  record.visits = (record.visits || []).filter(
    (item) => !(item.name === clean && (!level || item.level === level)),
  );
  save(record);
  return { ok: true, removed: before - record.visits.length };
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
  // v3.6.0：偏好标签过元操作黑名单（存量脏标签在注入层兜底过滤）
  const insightTags = insights && Array.isArray(insights.tags) ? cleanTags(insights.tags, 8) : [];
  if (insightTags.length) {
    lines.push('偏好标签：' + insightTags.join('、'));
  }
  if (insights && insights.summary) {
    lines.push('关于这位用户的认识：' + insights.summary);
  }
  const review = record.memoryReview;
  if (review && review.state === 'pending') {
    const merges = Array.isArray(review.merges) ? review.merges : [];
    const conflicts = Array.isArray(review.conflicts) ? review.conflicts : [];
    if (merges.length || conflicts.length) {
      lines.push('【待处理的记忆整理建议】（主动用口语向用户汇报，征得同意后用 handle_memory_review 工具执行；不要擅自改记忆；用户没兴趣就跳过，最多提一次）');
      merges.forEach((item, index) => {
        const sources = Array.isArray(item.ids) ? item.ids.join('、') : '';
        lines.push(
          '合并建议 ' + index + '：可把记忆 ' + sources + '（' + String(item.a || '') +
            '；' + String(item.b || '') + '）合并为「' + String(item.suggestion || item.text || '') + '」',
        );
      });
      conflicts.forEach((item, index) => {
        lines.push(
          '冲突 ' + index + '：「' + String(item.a || '') + '」与「' + String(item.b || '') +
            '」矛盾，问用户以哪条为准',
        );
      });
    }
  }
  const itineraries = (Array.isArray(record.itineraries) ? record.itineraries : []).filter(
    (item) => item.status && item.status !== PLAN_STATUS.DRAFT,
  );
  if (itineraries.length) {
    const sorted = [...itineraries].sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
    const kept = sorted.slice(-8);
    const base = sorted.length - kept.length;
    lines.push('【行程时间线】（按时间先后排序，回答「第一次 / 上次 / 最近一次」时以此为准）');
    kept.forEach((itinerary, index) => {
      const date = itinerary.ts ? String(itinerary.ts).slice(0, 10) : '日期未知';
      lines.push(
        '第 ' + (base + index + 1) + ' 次：' + date + ' · ' + itinerary.destination +
          ' · ' + (itinerary.days || []).length + ' 天' +
          (itinerary.budget_cny ? ' · 预算约 ¥' + itinerary.budget_cny : ''),
      );
    });
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
  const reviewAt = Math.max(1, Number(memoryCfg.review_trigger_count) || 80);
  const minIntervalMs = Math.max(1, Number(memoryCfg.digest_min_interval_minutes) || 10) * 60 * 1000;
  const since = record.state.memoriesSinceDigest || 0;
  const lastAt = record.state.lastDigestAt ? Date.parse(record.state.lastDigestAt) : 0;
  // v3.6.0：记忆条数达到 review_trigger_count（默认 80）时也触发消化整理
  const countDue = (record.memories || []).length >= reviewAt;
  return { due: (since >= trigger || countDue) && Date.now() - lastAt >= minIntervalMs, since };
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

// ---------------------------------------------------------------------------
// 记忆治理（v3.6.0）：消化输出「合并建议 / 冲突提醒」，经用户确认后才生效
// 数据落在 record.memoryReview：{ updated, state:'pending'|'none', merges[], conflicts[] }
// ---------------------------------------------------------------------------

function getPendingReview(userId) {
  const record = load(userId);
  const review = record.memoryReview;
  if (!review || review.state !== 'pending') return null;
  return { merges: Array.isArray(review.merges) ? review.merges : [], conflicts: Array.isArray(review.conflicts) ? review.conflicts : [] };
}

function findMemoryByIdOrText(record, item) {
  const id = String(item.id || '');
  if (id) {
    const byId = record.memories.find((memory) => memory.id === id);
    if (byId) return byId;
  }
  const text = String(item.text || item.a || '').trim();
  if (!text) return null;
  const key = normalizeFact(text);
  return (
    record.memories.find((memory) => normalizeFact(memory.text) === key) ||
    record.memories.find((memory) => normalizeFact(memory.text).includes(key.slice(0, 8)) || key.includes(normalizeFact(memory.text).slice(0, 8))) ||
    null
  );
}

/**
 * 执行一条待处理建议。
 * decision: 'apply_merge'（按合并建议合并）| 'keep_first' / 'keep_second'（冲突二选一）| 'dismiss'（忽略）
 * index：建议序号（merges 与 conflicts 分开编号，由 handle_memory_review 工具算出类型）
 */
function applyMemoryReview(userId, decision, index) {
  const record = load(userId);
  const review = record.memoryReview;
  if (!review || review.state !== 'pending') {
    return { ok: false, error: '当前没有待处理的记忆整理建议' };
  }
  const merges = Array.isArray(review.merges) ? review.merges : [];
  const conflicts = Array.isArray(review.conflicts) ? review.conflicts : [];
  const kind = String(decision || '').startsWith('keep') ? 'conflict' : 'merge';
  const list = kind === 'conflict' ? conflicts : merges;
  const target = list[Math.max(0, Number(index) || 0)];
  if (!target) return { ok: false, error: '找不到第 ' + index + ' 条建议（该组只有 ' + list.length + ' 条）' };

  const applied = [];
  if (decision === 'apply_merge') {
    const ids = Array.isArray(target.ids) ? target.ids : [];
    const suggestion = String(target.suggestion || target.text || '').trim();
    for (const item of ids) {
      const hit = record.memories.find((memory) => String(memory.id) === String(item));
      if (hit) {
        record.memories = record.memories.filter((memory) => memory.id !== hit.id);
        applied.push(hit.text);
      }
    }
    if (suggestion && suggestion.length >= 2) {
      record.memories.push({
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: new Date().toISOString(),
        text: suggestion.slice(0, 200),
        tags: cleanTags(target.tags, 4),
      });
    }
  } else if (decision === 'keep_first' || decision === 'keep_second') {
    const keepText = decision === 'keep_first' ? String(target.a || '') : String(target.b || '');
    const dropText = decision === 'keep_first' ? String(target.b || '') : String(target.a || '');
    const drop = findMemoryByIdOrText(record, { id: decision === 'keep_first' ? target.bId : target.aId, text: dropText });
    if (drop) {
      record.memories = record.memories.filter((memory) => memory.id !== drop.id);
      applied.push(drop.text);
    }
    const keep = findMemoryByIdOrText(record, { id: decision === 'keep_first' ? target.aId : target.bId, text: keepText });
    if (keep) applied.unshift(keep.text);
  } else if (decision === 'dismiss') {
    /* 用户忽略这条建议，不改任何数据 */
  } else {
    return { ok: false, error: '不支持的 decision：' + decision };
  }

  if (kind === 'conflict') conflicts.splice(Math.max(0, Number(index) || 0), 1);
  else merges.splice(Math.max(0, Number(index) || 0), 1);
  if (!merges.length && !conflicts.length) review.state = 'none';
  review.updated = new Date().toISOString();
  save(record);
  return { ok: true, decision, applied, remaining: merges.length + conflicts.length };
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

async function rememberTurn({ cfg, userId, userText, assistantText, itinerary, conversationId = 'default' }) {
  const record = load(userId);
  appendTurn(record, 'user', userText, conversationId);
  if (assistantText) appendTurn(record, 'assistant', assistantText, conversationId);
  // 行程已由 runAgent 在工具结果里落库（upsertItinerary），这里不再重复写入
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
  getHistory,
  addFacts,
  PLAN_STATUS,
  STATUS_FLOW,
  ensureItineraryShape,
  upsertItinerary,
  getPlan,
  listPlans,
  setItineraryStatus,
  removeItinerary,
  renameItinerary,
  findMemories,
  addMemory,
  updateMemory,
  removeMemory,
  listVisits,
  addVisit,
  removeVisit,
  bigrams,
  retrieve,
  renderBlock,
  digestDue,
  markDigest,
  extractFacts,
  rememberTurn,
  spawnDigest,
  cleanTags,
  getPendingReview,
  applyMemoryReview,
};
