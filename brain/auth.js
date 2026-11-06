'use strict';

/**
 * 本地账号与会话（v1.1.0）
 *
 * - 账号：用户名 + 密码（scrypt 加盐哈希），存 data/users.json
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

function createUser(username, password) {
  const name = String(username || '').trim();
  if (name.length < 2 || name.length > 20) return { ok: false, error: '用户名需 2~20 个字符' };
  if (String(password || '').length < 6) return { ok: false, error: '密码至少 6 位' };
  const users = loadUsers();
  if (findUserByName(users, name)) return { ok: false, error: '用户名已存在' };
  const userId = 'u-' + crypto.randomBytes(6).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  users[userId] = {
    userId,
    username: name,
    salt,
    hash: hashPassword(password, salt),
    created: new Date().toISOString(),
  };
  saveUsers(users);
  return { ok: true, userId, username: name };
}

function verifyLogin(username, password) {
  const users = loadUsers();
  const found = findUserByName(users, username);
  if (!found) return { ok: false, error: '用户名或密码错误' };
  const [, user] = found;
  const hash = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  if (hash.length !== expected.length || !crypto.timingSafeEqual(hash, expected)) {
    return { ok: false, error: '用户名或密码错误' };
  }
  return { ok: true, userId: user.userId, username: user.username };
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
  return user ? { userId: user.userId, username: user.username } : null;
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
  createUser,
  verifyLogin,
  createSession,
  getSession,
  destroySession,
  getUserById,
  parseCookies,
  currentUser,
  sessionCookie,
  clearCookie,
  hashPassword,
};
