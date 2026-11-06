'use strict';

/**
 * 手动验证「第一次 / 上次」时序（v1.2.0）：node test/live-timeline.js
 * 需要 .env；会真实调用 DeepSeek 一次（约几分钱）。
 */

const path = require('node:path');
const fs = require('node:fs');

process.chdir(path.join(__dirname, '..'));
require('../brain/env').loadEnv(process.cwd());

const { runAgent } = require('../brain/agent');
const memory = require('../brain/memory');
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const userId = 'timeline-test';
const record = memory.emptyRecord(userId);
record.itineraries.push(
  {
    ts: '2026-09-10T00:00:00Z',
    title: '云南五日',
    destination: '云南',
    budget_cny: 5000,
    days: [{}, {}, {}, {}, {}],
  },
  {
    ts: '2026-11-01T00:00:00Z',
    title: '成都三天',
    destination: '成都',
    budget_cny: 3000,
    days: [{}, {}, {}],
  },
);
memory.save(record);

const question = process.argv[2] || '我第一次的出行是去哪？第二次又是去哪？';

(async () => {
  console.log('--- 注入用的行程时间线 ---');
  console.log(memory.renderBlock(record, '我第一次的出行是去哪？'));
  console.log('\n--- 问题：' + question + ' ---\n');

  let text = '';
  for await (const evt of runAgent({ cfg, userId, userText: question })) {
    if (evt.type === 'delta') text += evt.text;
    else if (evt.type === 'tool_start') console.log('[tool] ' + evt.name);
  }
  console.log(text);
  const okFirst = text.includes('云南');
  const okSecond = text.includes('成都');
  console.log('\n结论：第一次命中=' + okFirst + '，第二次命中=' + okSecond);
  if (!okFirst || !okSecond) {
    process.exitCode = 1;
  }
})();
