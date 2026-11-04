#!/usr/bin/env node
'use strict';

/**
 * 途忆 · HTTP 服务
 * - 静态页面：web/ 下的三页前端
 * - POST /api/chat：SSE 流式对话（打字机效果 + 工具事件 + 行程卡片事件）
 * - GET  /api/health：健康检查（是否配置密钥、可用工具）
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
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

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: '请求体不是合法 JSON' });
  }
  const message = String(body.message || '').trim();
  if (!message) return sendJSON(res, 400, { error: 'message 不能为空' });

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
      userId: String(body.userId || 'demo'),
      userText: message,
    })) {
      sse(event);
    }
  } catch (err) {
    sse({ type: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    res.end();
  }
}

function health() {
  return {
    ok: true,
    model: cfg.llm.model,
    hasKey: Boolean(process.env.DEEPSEEK_API_KEY),
    tools: tools.defs().map((def) => def.function.name),
  };
}

function handleProfile(url, res) {
  const userId = String(url.searchParams.get('userId') || '').trim();
  if (!userId) return sendJSON(res, 400, { error: '缺少 userId' });
  const record = memory.load(userId);
  return sendJSON(res, 200, {
    userId: record.userId,
    created: record.created,
    insights: record.insights,
    memories: (record.memories || []).slice(-20).reverse(),
    itineraries: (record.itineraries || []).slice(-10).reverse(),
    turnsCount: (record.turns || []).length,
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJSON(res, 200, health());
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    return sendJSON(res, 200, stats.computeStats(stats.collectRecords()));
  }
  if (req.method === 'GET' && url.pathname === '/api/profile') return handleProfile(url, res);
  if (req.method === 'GET' || req.method === 'HEAD') return sendStatic(res, url.pathname);
  return sendJSON(res, 405, { error: 'method not allowed' });
});

server.listen(cfg.server.port, cfg.server.host, () => {
  const base = 'http://' + cfg.server.host + ':' + cfg.server.port;
  console.log('[server] 已启动 ' + base);
  console.log('[server] 模型：' + cfg.llm.model);
  console.log('[server] 密钥：' + (process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置（复制 .env.example 为 .env 并填写 DEEPSEEK_API_KEY）'));
  console.log('[server] 工具：' + (tools.defs().map((d) => d.function.name).join(', ') || '无'));
});
