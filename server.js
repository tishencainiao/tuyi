#!/usr/bin/env node
'use strict';

/**
 * 途忆 · HTTP 服务（v1.1.0：本地账号 + 多轮会话历史）
 *
 * 页面：/login.html 公开；/、/dashboard.html、/profile.html 需登录（未登录 302 到登录页）
 * 接口：
 *   POST /api/register  {username,password}   注册并自动登录
 *   POST /api/login     {username,password}   登录（httpOnly cookie）
 *   POST /api/logout                          退出
 *   GET  /api/me                              当前用户
 *   POST /api/chat      {message,conversationId?}  SSE 流式对话（userId 从 session 取）
 *   GET  /api/history   ?conversationId=      会话历史
 *   GET  /api/profile   ?conversationId=      本人画像 / 记忆 / 行程
 *   GET  /api/stats     全局统计（含演示数据）
 *   GET  /api/health    健康检查（无需登录）
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');

// .env 缺失也能启动：只有真正调用模型时才需要密钥（兼容 Node 18）
require('./brain/env').loadEnv(ROOT);

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const { runAgent } = require('./brain/agent');
const tools = require('./brain/tools');
const memory = require('./brain/memory');
const stats = require('./brain/stats');
const auth = require('./brain/auth');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PROTECTED_PAGES = new Set(['/', '/index.html', '/dashboard.html', '/profile.html']);

function sendJSON(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendStatic(res, urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return sendJSON(res, 400, { error: 'bad url' });
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const abs = path.resolve(WEB_DIR, rel);
  if (!abs.startsWith(WEB_DIR + path.sep)) {
    return sendJSON(res, 403, { error: 'forbidden' });
  }
  fs.readFile(abs, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  try {
    const raw = await readBody(req);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function currentUser(req) {
  const session = auth.currentUser(req);
  return session ? session.user : null;
}

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = auth.createUser(body.username, body.password);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  const token = auth.createSession(result.userId);
  res.setHeader('Set-Cookie', auth.sessionCookie(token));
  return sendJSON(res, 200, { user: { userId: result.userId, username: result.username } });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = auth.verifyLogin(body.username, body.password);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  const token = auth.createSession(result.userId);
  res.setHeader('Set-Cookie', auth.sessionCookie(token));
  return sendJSON(res, 200, { user: { userId: result.userId, username: result.username } });
}

function handleLogout(req, res) {
  const token = auth.parseCookies(req.headers.cookie).tuyi_session;
  if (token) auth.destroySession(token);
  res.setHeader('Set-Cookie', auth.clearCookie());
  return sendJSON(res, 200, { ok: true });
}

function handleMe(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  return sendJSON(res, 200, { user });
}

async function handleChat(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const message = String(body.message || '').trim();
  if (!message) return sendJSON(res, 400, { error: 'message 不能为空' });
  const conversationId = String(body.conversationId || 'default');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sse = (obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n');

  try {
    for await (const event of runAgent({
      cfg,
      userId: user.userId,
      userText: message,
      conversationId,
    })) {
      sse(event);
    }
  } catch (err) {
    sse({ type: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    res.end();
  }
}

function handleHistory(url, req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const conversationId = String(url.searchParams.get('conversationId') || 'default');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 40, 1), 100);
  const turns = memory.getHistory(user.userId, conversationId, limit).map((turn) => ({
    role: turn.role,
    text: turn.text,
    ts: turn.ts,
  }));
  return sendJSON(res, 200, { conversationId, turns });
}

function handleProfile(url, req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const record = memory.load(user.userId);
  return sendJSON(res, 200, {
    userId: record.userId,
    username: user.username,
    created: record.created,
    insights: record.insights,
    memories: (record.memories || []).slice(-20).reverse(),
    itineraries: (record.itineraries || []).slice(-10).reverse(),
    turnsCount: (record.turns || []).length,
  });
}

async function handleMemoryCreate(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const text = String(body.text || '').trim();
  if (text.length < 2) return sendJSON(res, 400, { error: '内容太短' });
  const result = memory.addMemory(user.userId, text, Array.isArray(body.tags) ? body.tags : []);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true });
}

async function handleMemoryUpdate(req, res, id) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = memory.updateMemory(user.userId, id, body);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true, memory: result.memory });
}

function handleMemoryRemove(req, res, id) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const result = memory.removeMemory(user.userId, id);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true });
}

function health() {
  return {
    ok: true,
    model: cfg.llm.model,
    hasKey: Boolean(process.env.DEEPSEEK_API_KEY),
    tools: tools.defs().map((def) => def.function.name),
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  const method = req.method;
  const pathname = url.pathname;

  // 接口
  if (method === 'POST' && pathname === '/api/register') return handleRegister(req, res);
  if (method === 'POST' && pathname === '/api/login') return handleLogin(req, res);
  if (method === 'POST' && pathname === '/api/logout') return handleLogout(req, res);
  if (method === 'GET' && pathname === '/api/me') return handleMe(req, res);
  if (method === 'GET' && pathname === '/api/health') return sendJSON(res, 200, health());
  if (method === 'POST' && pathname === '/api/chat') return handleChat(req, res);
  if (method === 'GET' && pathname === '/api/history') return handleHistory(url, req, res);
  if (method === 'GET' && pathname === '/api/profile') return handleProfile(url, req, res);
  if (method === 'POST' && pathname === '/api/memory') return handleMemoryCreate(req, res);
  const memoryPath = pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (memoryPath && method === 'PUT') return handleMemoryUpdate(req, res, decodeURIComponent(memoryPath[1]));
  if (memoryPath && method === 'DELETE') return handleMemoryRemove(req, res, decodeURIComponent(memoryPath[1]));
  if (method === 'GET' && pathname === '/api/stats/personal') {
    const user = currentUser(req);
    if (!user) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, stats.computePersonalStats(memory.load(user.userId)));
  }
  if (method === 'GET' && pathname === '/api/stats') {
    if (!currentUser(req)) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, stats.computeStats(stats.collectRecords()));
  }

  // 页面
  if (method === 'GET' || method === 'HEAD') {
    const user = currentUser(req);
    if (pathname === '/login.html') {
      return user ? redirect(res, '/') : sendStatic(res, pathname);
    }
    if (PROTECTED_PAGES.has(pathname) && !user) {
      return redirect(res, '/login.html');
    }
    return sendStatic(res, pathname);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
});

server.listen(cfg.server.port, cfg.server.host, () => {
  const base = 'http://' + cfg.server.host + ':' + cfg.server.port;
  console.log('[server] 已启动 ' + base);
  console.log('[server] 模型：' + cfg.llm.model);
  console.log('[server] 密钥：' + (process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置（复制 .env.example 为 .env 并填写 DEEPSEEK_API_KEY）'));
  console.log('[server] 工具：' + (tools.defs().map((d) => d.function.name).join(', ') || '无'));
  console.log('[server] 账号：本地账号（data/users.json），测试账户见 scripts/seed-accounts.js');
});
