'use strict';

/**
 * 本地账号与会话（v1.1.0；v3.2.0 支持邮箱/手机注册）
 *
 * - 账号：用户名 / 邮箱 / 手机号 + 密码（scrypt 加盐哈希），存 data/users.json
 * - 验证码：邮箱/手机注册用「模拟验证码」（本地生成、5 分钟有效、接口直接返回），
 *   正式环境换成短信/邮件服务即可，接口形状不变
 * - 会话：随机 token + httpOnly cookie，存 data/sessions.json（重启不失效，7 天过期）
 * - 注意：data/ 已被 .gitignore 与 pre-commit 钩子挡住，不会进版本库
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'tuyi_session';
const CODE_TTL_MS = 5 * 60 * 1000;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

// 模拟验证码：内存存储（重启即失效），{account} -> {code, expires}
const codeStore = new Map();

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadUsers() {
  return readJSON(USERS_FILE, {});
}

function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function loadSessions() {
  return readJSON(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
  writeJSON(SESSIONS_FILE, sessions);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function findUserByName(users, username) {
  const key = String(username || '').trim().toLowerCase();
  return Object.entries(users).find(([, user]) => String(user.username).toLowerCase() === key);
}

/** 判断账号类型：username | email | phone | null（不合法） */
function classifyAccount(account) {
  const value = String(account || '').trim();
  if (!value) return null;
  if (EMAIL_RE.test(value)) return { type: 'email', value: value.toLowerCase() };
  if (PHONE_RE.test(value)) return { type: 'phone', value };
  if (value.length >= 2 && value.length <= 20) return { type: 'username', value };
  return null;
}

/** 按用户名 / 邮箱 / 手机号任一字段找用户 */
function findUserByAccount(users, account) {
  const kind = classifyAccount(account);
  if (!kind) return undefined;
  const key = kind.value.toLowerCase();
  return Object.entries(users).find(([, user]) => {
    if (kind.type === 'username') return String(user.username || '').toLowerCase() === key;
    if (kind.type === 'email') return String(user.email || '').toLowerCase() === key;
    return String(user.phone || '') === kind.value;
  });
}

/** 生成模拟验证码并登记（仅邮箱/手机），返回 { ok, mockCode, expiresInSec } */
function issueVerifyCode(account) {
  const kind = classifyAccount(account);
  if (!kind || kind.type === 'username') return { ok: false, error: '邮箱 / 手机号注册才需要验证码' };
  const now = Date.now();
  for (const [key, value] of codeStore) {
    if (value.expires < now) codeStore.delete(key);
  }
  const code = String(crypto.randomInt(100000, 1000000));
  codeStore.set(kind.value.toLowerCase(), { code, expires: now + CODE_TTL_MS });
  return { ok: true, mockCode: code, expiresInSec: Math.floor(CODE_TTL_MS / 1000) };
}

function consumeVerifyCode(account, code) {
  const kind = classifyAccount(account);
  if (!kind) return { ok: false, error: '账号格式不对' };
  const entry = codeStore.get(kind.value.toLowerCase());
  if (!entry || entry.expires < Date.now()) return { ok: false, error: '验证码已过期，请重新获取' };
  if (String(code || '').trim() !== entry.code) return { ok: false, error: '验证码错误' };
  codeStore.delete(kind.value.toLowerCase());
  return { ok: true };
}

/**
 * 注册：account 为用户名（无需验证码）或邮箱/手机（需验证码）。
 * 兼容旧参数名 username。返回 { ok, userId, username, account } 或 { ok:false, error }
 */
function createUser(account, password, options = {}) {
  const rawAccount = account != null ? account : options.username;
  const kind = classifyAccount(rawAccount);
  if (!kind) return { ok: false, error: '账号格式不对（用户名 2~20 字符，或邮箱，或 11 位手机号）' };
  if (String(password || '').length < 6) return { ok: false, error: '密码至少 6 位' };

  if (kind.type !== 'username') {
    const checked = consumeVerifyCode(rawAccount, options.code);
    if (!checked.ok) return { ok: false, error: checked.error };
  }

  const users = loadUsers();
  if (findUserByAccount(users, rawAccount)) {
    return { ok: false, error: kind.type === 'username' ? '用户名已存在' : '该邮箱 / 手机号已注册' };
  }
  const userId = 'u-' + crypto.randomBytes(6).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    userId,
    salt,
    hash: hashPassword(password, salt),
    created: new Date().toISOString(),
    onboarded: false,
  };
  if (kind.type === 'username') user.username = kind.value;
  if (kind.type === 'email') user.email = kind.value;
  if (kind.type === 'phone') user.phone = kind.value;
  users[userId] = user;
  saveUsers(users);
  const accountName = user.username || user.email || user.phone;
  return { ok: true, userId, username: accountName, account: accountName };
}

function verifyLogin(account, password) {
  const users = loadUsers();
  const found = findUserByAccount(users, account);
  if (!found) return { ok: false, error: '账号或密码错误' };
  const [userId, user] = found;
  const hash = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  if (hash.length !== expected.length || !crypto.timingSafeEqual(hash, expected)) {
    return { ok: false, error: '账号或密码错误' };
  }
  const accountName = user.username || user.email || user.phone;
  return { ok: true, userId, username: accountName };
}

function createSession(userId) {
  const sessions = loadSessions();
  const now = Date.now();
  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = { userId, created: now, expires: now + SESSION_TTL_MS };
  for (const [key, value] of Object.entries(sessions)) {
    if (!value || value.expires < now) delete sessions[key];
  }
  saveSessions(sessions);
  return token;
}

function getSession(token) {
  const session = loadSessions()[token];
  if (!session || session.expires < Date.now()) return null;
  return session;
}

function destroySession(token) {
  const sessions = loadSessions();
  if (sessions[token]) {
    delete sessions[token];
    saveSessions(sessions);
  }
}

function getUserById(userId) {
  const user = loadUsers()[userId];
  if (!user) return null;
  return {
    userId: user.userId,
    username: user.username || user.email || user.phone,
    email: user.email || '',
    phone: user.phone || '',
    onboarded: user.onboarded === true,
    created: user.created || '',
  };
}

function markOnboarded(userId) {
  const users = loadUsers();
  const user = users[userId];
  if (!user) return { ok: false, error: '用户不存在' };
  if (user.onboarded !== true) {
    user.onboarded = true;
    saveUsers(users);
  }
  return { ok: true };
}

function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    });
  return out;
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const session = getSession(token);
  if (!session) return null;
  const user = getUserById(session.userId);
  return user ? { user, token } : null;
}

function sessionCookie(token) {
  return COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000);
}

function clearCookie() {
  return COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  classifyAccount,
  issueVerifyCode,
  consumeVerifyCode,
  createUser,
  verifyLogin,
  createSession,
  getSession,
  destroySession,
  getUserById,
  markOnboarded,
  parseCookies,
  currentUser,
  sessionCookie,
  clearCookie,
  hashPassword,
};
