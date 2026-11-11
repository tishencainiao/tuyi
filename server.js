#!/usr/bin/env node
'use strict';

/**
 * 途忆 · HTTP 服务（v3.0.0：React 前端 + SPA 路由）
 *
 * 页面：/login、/register 公开；/、/travel、/profile、/onboarding 需登录（未登录 302 到 /login）
 * 旧版页面保留在 /legacy/ 下（过渡期参考，v3.4.0 删除）
 * 接口：
 *   POST /api/verify-code  {account}          模拟验证码（邮箱/手机注册用，正式版换短信/邮件）
 *   POST /api/register  {account,password,code?}   注册并自动登录（用户名无需验证码）
 *   POST /api/login     {account,password}     登录（httpOnly cookie）
 *   POST /api/logout                          退出
 *   GET  /api/me                              当前用户（含 onboarded 引导标记）
 *   GET  /api/userinfo / PUT /api/userinfo    个人资料（昵称/年龄/性别/同行人/偏好等）
 *   POST /api/onboard                         完成注册引导（写入资料并标记 onboarded）
 *   POST /api/chat      {message,conversationId?}  SSE 流式对话（userId 从 session 取）
 *   GET  /api/history   ?conversationId=      会话历史
 *   GET  /api/profile                         本人画像 / 记忆 / 行程
 *   GET  /api/stats/personal                  个人统计
 *   GET  /api/visits                          去过地（手动点亮）
 *   GET  /api/health                          健康检查（无需登录）
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');
const WEB_DIST = path.join(WEB_DIR, 'dist');
const LEGACY_DIR = path.join(WEB_DIR, 'legacy');

// .env 缺失也能启动：只有真正调用模型时才需要密钥（兼容 Node 18）
require('./brain/env').loadEnv(ROOT);

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const { runAgent } = require('./brain/agent');
const tools = require('./brain/tools');
const memory = require('./brain/memory');
const stats = require('./brain/stats');
const auth = require('./brain/auth');
const profile = require('./brain/profile');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

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

function serveFile(res, abs) {
  fs.readFile(abs, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// 新前端（web/dist，vite 构建产物）：文件优先，无扩展名路径回退 index.html（SPA）
function serveDist(res, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  } catch {
    return sendJSON(res, 400, { error: 'bad url' });
  }
  rel = rel || 'index.html';
  const abs = path.resolve(WEB_DIST, rel);
  if (!abs.startsWith(WEB_DIST + path.sep)) return sendJSON(res, 403, { error: 'forbidden' });
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return serveFile(res, abs);
  if (!path.extname(rel)) return serveFile(res, path.join(WEB_DIST, 'index.html'));
  return sendJSON(res, 404, { error: 'not found' });
}

// 旧版页面（web/legacy，过渡期参考；v3.4.0 随演示信息清理删除）
function serveLegacy(res, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/legacy\/?/, '').replace(/^\/+/, '');
  } catch {
    return sendJSON(res, 400, { error: 'bad url' });
  }
  rel = rel || 'index.html';
  const abs = path.resolve(LEGACY_DIR, rel);
  if (!abs.startsWith(LEGACY_DIR + path.sep)) return sendJSON(res, 403, { error: 'forbidden' });
  return serveFile(res, abs);
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

async function handleVerifyCode(req, res) {
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = auth.issueVerifyCode(body.account);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  // 模拟验证码：正式环境由短信 / 邮件下发，这里直接在响应里返回（演示用）
  return sendJSON(res, 200, { ok: true, mock: true, mockCode: result.mockCode, expiresInSec: result.expiresInSec });
}

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = auth.createUser(body.account, body.password, { username: body.username, code: body.code });
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  const token = auth.createSession(result.userId);
  res.setHeader('Set-Cookie', auth.sessionCookie(token));
  return sendJSON(res, 200, { user: { userId: result.userId, username: result.username } });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = auth.verifyLogin(body.account != null ? body.account : body.username, body.password);
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

function handleUserinfoGet(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  return sendJSON(res, 200, {
    user: { userId: user.userId, username: user.username, email: user.email, phone: user.phone, onboarded: user.onboarded },
    profile: profile.getProfile(user.userId),
  });
}

async function handleUserinfoPut(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = profile.updateProfile(user.userId, body);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true, profile: result.profile });
}

async function handleOnboard(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  const result = profile.updateProfile(user.userId, body || {});
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  auth.markOnboarded(user.userId);
  return sendJSON(res, 200, { ok: true, profile: result.profile });
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

function handleVisitsList(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  return sendJSON(res, 200, { manual: memory.listVisits(user.userId) });
}

// ---- 行程方案（v3.1.0 状态机）----

function handlePlansList(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const plans = memory.listPlans(user.userId).map((item) => ({
    id: item.id,
    ts: item.ts,
    title: item.title,
    destination: item.destination,
    status: item.status,
    budget_cny: item.budget_cny,
    days: item.days,
    previousDays: item.previousDays || [],
    revisions: item.revisions || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  return sendJSON(res, 200, { plans });
}

async function handlePlanStatus(req, res, id) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = memory.setItineraryStatus(user.userId, id, String(body.status || '').trim());
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true, itinerary: result.itinerary });
}

function handlePlanRemove(req, res, id) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const result = memory.removeItinerary(user.userId, id);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, { ok: true });
}

async function handleVisitCreate(req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const body = await readJsonBody(req);
  if (!body) return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  const result = memory.addVisit(user.userId, body.name, body.level);
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, result);
}

function handleVisitRemove(url, req, res) {
  const user = currentUser(req);
  if (!user) return sendJSON(res, 401, { error: '未登录' });
  const result = memory.removeVisit(
    user.userId,
    url.searchParams.get('name'),
    url.searchParams.get('level'),
  );
  if (!result.ok) return sendJSON(res, 400, { error: result.error });
  return sendJSON(res, 200, result);
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
  if (method === 'POST' && pathname === '/api/verify-code') return handleVerifyCode(req, res);
  if (method === 'POST' && pathname === '/api/register') return handleRegister(req, res);
  if (method === 'POST' && pathname === '/api/login') return handleLogin(req, res);
  if (method === 'POST' && pathname === '/api/logout') return handleLogout(req, res);
  if (method === 'GET' && pathname === '/api/me') return handleMe(req, res);
  if (method === 'GET' && pathname === '/api/userinfo') return handleUserinfoGet(req, res);
  if (method === 'PUT' && pathname === '/api/userinfo') return handleUserinfoPut(req, res);
  if (method === 'POST' && pathname === '/api/onboard') return handleOnboard(req, res);
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
  if (method === 'GET' && pathname === '/api/visits') return handleVisitsList(req, res);
  if (method === 'POST' && pathname === '/api/visits') return handleVisitCreate(req, res);
  if (method === 'DELETE' && pathname === '/api/visits') return handleVisitRemove(url, req, res);
  if (method === 'GET' && pathname === '/api/plans') return handlePlansList(req, res);
  const planPath = pathname.match(/^\/api\/plans\/([^/]+)$/);
  if (planPath && method === 'DELETE') return handlePlanRemove(req, res, decodeURIComponent(planPath[1]));
  const planStatusPath = pathname.match(/^\/api\/plans\/([^/]+)\/status$/);
  if (planStatusPath && method === 'PUT') return handlePlanStatus(req, res, decodeURIComponent(planStatusPath[1]));
  if (method === 'GET' && pathname === '/api/stats') {
    if (!currentUser(req)) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, stats.computeStats(stats.collectRecords()));
  }

  // 页面
  if (method === 'GET' || method === 'HEAD') {
    const user = currentUser(req);

    // 旧地址友好跳转
    const LEGACY_REDIRECTS = {
      '/index.html': '/',
      '/dashboard.html': '/travel',
      '/profile.html': '/profile',
      '/login.html': '/login',
    };
    if (LEGACY_REDIRECTS[pathname]) return redirect(res, LEGACY_REDIRECTS[pathname]);

    // 旧版页面（过渡期参考）
    if (pathname.startsWith('/legacy')) {
      if (pathname.endsWith('login.html')) {
        return user ? redirect(res, '/') : serveLegacy(res, pathname);
      }
      if (!user) return redirect(res, '/login');
      return serveLegacy(res, pathname);
    }

    // 静态资源（登录页也需要）
    if (pathname.startsWith('/assets/') || pathname.startsWith('/vendor/') || pathname.startsWith('/favicon')) {
      return serveDist(res, pathname);
    }

    // SPA：登录/注册公开，其余需登录
    if (pathname === '/login' || pathname === '/register') {
      return user ? redirect(res, '/') : serveDist(res, pathname);
    }
    if (!user) return redirect(res, '/login');
    return serveDist(res, pathname);
  }

  return sendJSON(res, 405, { error: 'method not allowed' });
});

server.listen(cfg.server.port, cfg.server.host, () => {
  const base = 'http://' + cfg.server.host + ':' + cfg.server.port;
  console.log('[server] 已启动 ' + base);
  console.log('[server] 模型：' + cfg.llm.model);
  console.log('[server] 密钥：' + (process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置（复制 .env.example 为 .env 并填写 DEEPSEEK_API_KEY）'));
  console.log('[server] 工具：' + (tools.defs().map((d) => d.function.name).join(', ') || '无'));
  console.log('[server] 账号：本地账号（data/users.json），注册入口：/register');
});
