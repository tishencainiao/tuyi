'use strict';

/**
 * 个人资料（v3.2.0）
 *
 * - 资料：昵称 / 年龄 / 性别 / 同行家人朋友 / 偏好标签 / 旅行风格 / 健康备注
 * - 来源标记：每字段带 sources[field] = 'confirmed'（用户填写，当前唯一来源）；
 *   结构上预留 'inferred'（对话抽取，后续版本实现，借 Momo user-profile.js 思路）
 * - 存储：data/user-profile/<userId>.json（与记忆 data/memory/<userId>.json 分开）
 * - 注入：renderProfileBlock() 生成【用户资料】提示块，由 agent.js 拼进系统提示
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'user-profile');

const FIELDS = ['nickname', 'age', 'gender', 'companions', 'preferences', 'travel_style', 'health_notes'];
const GENDERS = ['男', '女', '保密'];
const PROFILE_SCHEMA = 1; // v3.4.0：资料文件 schema 版本（读时容忍缺失，写时补齐）

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  value.schemaVersion = PROFILE_SCHEMA; // v3.4.0：写盘时统一打上 schema 版本
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function fileOf(userId) {
  return path.join(PROFILE_DIR, userId + '.json');
}

function emptyProfile(userId) {
  return {
    userId,
    nickname: '',
    age: null,
    gender: '',
    companions: [],
    preferences: [],
    travel_style: '',
    health_notes: '',
    sources: {},
    updatedAt: null,
  };
}

function getProfile(userId) {
  const raw = readJSON(fileOf(userId), null);
  const base = emptyProfile(userId);
  if (!raw || typeof raw !== 'object') return base;
  const merged = { ...base, ...raw, sources: { ...(raw.sources || {}) } };
  // 老文件可能缺新字段
  for (const field of FIELDS) {
    if (merged[field] === undefined) merged[field] = base[field];
  }
  return merged;
}

function cleanString(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanAge(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 120) return { error: '年龄需为 1~120 的整数' };
  return n;
}

function cleanCompanions(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return { error: '同行人需为列表' };
  if (value.length > 10) return { error: '同行人最多 10 位' };
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return { error: '同行人格式不对' };
    const name = cleanString(item.name, 20);
    const relation = cleanString(item.relation, 20);
    if (!name && !relation) continue; // 空行跳过
    const age = cleanAge(item.age);
    if (age && age.error) return { error: '同行人' + (name || relation) + '：' + age.error };
    out.push({ name, relation, age: age === null ? null : age });
  }
  return out;
}

function cleanPreferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return { error: '偏好标签需为列表' };
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const text = cleanString(item, 20);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * 校验并合并更新；只允许白名单字段，其余忽略。
 * 返回 { ok: true, profile } 或 { ok: false, error }
 */
function updateProfile(userId, patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: '资料格式不对' };
  const profile = getProfile(userId);
  const next = { ...profile };
  const touched = [];

  if ('nickname' in patch) {
    const value = cleanString(patch.nickname, 20);
    next.nickname = value;
    touched.push('nickname');
  }
  if ('age' in patch) {
    const value = cleanAge(patch.age);
    if (value && value.error) return { ok: false, error: value.error };
    next.age = value === null || value === undefined ? null : value;
    touched.push('age');
  }
  if ('gender' in patch) {
    const value = cleanString(patch.gender, 6);
    if (value && !GENDERS.includes(value)) return { ok: false, error: '性别只能是 男 / 女 / 保密' };
    next.gender = value;
    touched.push('gender');
  }
  if ('companions' in patch) {
    const value = cleanCompanions(patch.companions);
    if (value && value.error) return { ok: false, error: value.error };
    next.companions = value;
    touched.push('companions');
  }
  if ('preferences' in patch) {
    const value = cleanPreferences(patch.preferences);
    if (value && value.error) return { ok: false, error: value.error };
    next.preferences = value;
    touched.push('preferences');
  }
  if ('travel_style' in patch) {
    const value = cleanString(patch.travel_style, 20);
    next.travel_style = value;
    touched.push('travel_style');
  }
  if ('health_notes' in patch) {
    const value = cleanString(patch.health_notes, 200);
    next.health_notes = value;
    touched.push('health_notes');
  }

  next.sources = { ...(profile.sources || {}) };
  for (const field of touched) next.sources[field] = 'confirmed';
  next.updatedAt = new Date().toISOString();

  writeJSON(fileOf(userId), next);
  return { ok: true, profile: next };
}

function profileLine(label, value) {
  return '  - ' + label + '：' + value;
}

/**
 * 生成注入提示的【用户资料】块；资料为空时返回空字符串（不注入）。
 */
function renderProfileBlock(profile) {
  const lines = [];
  if (profile.nickname) lines.push(profileLine('昵称', profile.nickname));
  if (profile.age != null) lines.push(profileLine('年龄', profile.age + ' 岁'));
  if (profile.gender) lines.push(profileLine('性别', profile.gender));
  if (profile.companions && profile.companions.length > 0) {
    const list = profile.companions
      .map((c) => {
        const parts = [c.relation || '', c.name || ''].filter(Boolean).join('');
        return c.age != null ? parts + '（' + c.age + ' 岁）' : parts;
      })
      .join('、');
    lines.push(profileLine('同行家人朋友', list));
  }
  if (profile.preferences && profile.preferences.length > 0) {
    lines.push(profileLine('旅行偏好', profile.preferences.join('、')));
  }
  if (profile.travel_style) lines.push(profileLine('喜欢的旅行风格', profile.travel_style));
  if (profile.health_notes) lines.push(profileLine('健康备注', profile.health_notes));

  if (lines.length === 0) return '';
  return ['【用户资料】（用户自己填写的个人信息，排行程时务必参考）', ...lines].join('\n');
}

module.exports = {
  FIELDS,
  emptyProfile,
  getProfile,
  updateProfile,
  renderProfileBlock,
};
