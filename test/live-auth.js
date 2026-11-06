'use strict';

/**
 * 手动联网联调（v1.1.0 账号 + 历史）：先 node server.js，再 node test/live-auth.js
 * 依赖：服务已启动、test1 账号存在（scripts/seed-accounts.js）。
 * 可选环境变量：TUYI_BASE、TUYI_TEST_USER、TUYI_TEST_PASS
 */

const base = process.env.TUYI_BASE || 'http://127.0.0.1:8787';
const username = process.env.TUYI_TEST_USER || 'test1';
const password = process.env.TUYI_TEST_PASS || '123456';

async function postJSON(path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
}

(async () => {
  console.log('服务：' + base + '　账号：' + username);

  const login = await postJSON('/api/login', { username, password });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  console.log('1) 登录：HTTP ' + login.status + (cookie ? '（已拿到 session cookie）' : '（没有 cookie）'));
  if (!login.ok) {
    console.log('   登录失败：' + (await login.text()));
    process.exitCode = 1;
    return;
  }

  const me = await fetch(base + '/api/me', { headers: { cookie } });
  console.log('2) /api/me：HTTP ' + me.status + ' ' + (await me.text()));

  const chat = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ message: '你好，一句话介绍你自己' }),
  });
  console.log('3) /api/chat：HTTP ' + chat.status);
  if (!chat.ok || !chat.body) {
    console.log('   对话失败：' + (await chat.text()));
    process.exitCode = 1;
    return;
  }
  const reader = chat.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  const types = [...new Set((text.match(/"type":"([a-z_]+)"/g) || []).map((item) => item.slice(8, -1)))];
  console.log('   SSE 事件：' + types.join(', '));

  const history = await fetch(base + '/api/history?conversationId=default', { headers: { cookie } });
  const data = await history.json();
  console.log('4) /api/history：' + data.turns.length + ' 条（应 ≥ 2）');
  (data.turns || []).slice(-2).forEach((turn) => {
    console.log('   [' + turn.role + '] ' + String(turn.text || '').slice(0, 60));
  });
})();
