'use strict';

/**
 * 手动验证「对话式记忆编辑」（v1.2.0）：先 node server.js，再 node test/live-memory-edit.js
 * 需要 test1 账号（scripts/seed-accounts.js）；会真实调用 DeepSeek 3 次（几分钱）。
 */

const base = process.env.TUYI_BASE || 'http://127.0.0.1:8787';
const username = process.env.TUYI_TEST_USER || 'test1';
const password = process.env.TUYI_TEST_PASS || '123456';

async function chat(cookie, message) {
  const resp = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) return '[HTTP ' + resp.status + '] ' + (await resp.text());
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  let reply = '';
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    try {
      const evt = JSON.parse(trimmed.slice(5).trim());
      if (evt.type === 'delta') reply += evt.text;
    } catch (err) {
      /* 忽略坏块 */
    }
  }
  return reply;
}

async function memories(cookie) {
  const resp = await fetch(base + '/api/profile', { headers: { cookie } });
  const data = await resp.json();
  return data.memories || [];
}

(async () => {
  const testUser = 'memtest' + Date.now().toString(36).slice(-5);
  const reg = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testUser, password: '123456' }),
  });
  const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
  if (!reg.ok) {
    console.log('注册失败：' + (await reg.text()));
    process.exitCode = 1;
    return;
  }
  console.log('新账号 ' + testUser + ' 已注册，开始对话式记忆编辑测试……\n');

  console.log('1) 添加：记住我不吃辣，海鲜过敏');
  console.log('   小忆：' + (await chat(cookie, '记住：我不吃辣，海鲜过敏')).slice(0, 100));
  let list = await memories(cookie);
  console.log('   记忆数：' + list.length);

  console.log('2) 修改：把「不吃辣」改成「能吃微辣」');
  console.log('   小忆：' + (await chat(cookie, '把「不吃辣」那条记忆改成「能吃微辣」')).slice(0, 100));
  list = await memories(cookie);
  console.log('   含「微辣」：' + list.some((item) => String(item.text).includes('微辣')));

  console.log('3) 删除：删掉「海鲜过敏」那条');
  console.log('   小忆：' + (await chat(cookie, '删掉「海鲜过敏」那条记忆')).slice(0, 100));
  list = await memories(cookie);
  console.log('   「海鲜」还在：' + list.some((item) => String(item.text).includes('海鲜')) + '（应为 false）');
})();
