'use strict';

/**
 * 消融实验助手（手动运行，会真实调用 DeepSeek，产生少量费用）：
 *   node scripts/ablation.js
 *
 * 对比：
 *   A 组：关闭记忆消化（TUYI_DISABLE_MEMORY=1）
 *   B 组：开启记忆消化（先预热产生记忆，再跑同一场景）
 *
 * 输出：两组回复 + 指标（字符数 / 工具调用数 / 行程完整率 / 耗时）。
 * 说明：网络偶发超时会自动重试，最多 3 次。
 */

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

process.chdir(path.join(__dirname, '..'));
require('../brain/env').loadEnv(process.cwd());

const { runAgent } = require('../brain/agent');
const memory = require('../brain/memory');
const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));

const SCENARIO =
  process.argv[2] || '帮我排一个带爸妈去成都玩三天的行程，预算中等，不想太累';
const USER_ID = 'ablation-' + Date.now().toString(36);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function completeness(itinerary) {
  if (!itinerary) return 0;
  let total = 0;
  let ok = 0;
  for (const day of itinerary.days || []) {
    for (const item of day.items || []) {
      total += 1;
      if (item.time && item.place && item.activity) ok += 1;
    }
  }
  return total ? Math.round((ok / total) * 100) : 0;
}

async function runOnce(label, disableMemory) {
  process.env.TUYI_DISABLE_MEMORY = disableMemory ? '1' : '0';
  const started = Date.now();
  const events = [];
  let text = '';
  for await (const evt of runAgent({ cfg, userId: USER_ID, userText: SCENARIO })) {
    if (evt.type === 'delta') text += evt.text;
    else events.push(evt);
  }
  const itinerary = events.find((evt) => evt.type === 'itinerary');
  return {
    label,
    disableMemory,
    replyChars: text.length,
    toolCalls: events.filter((evt) => evt.type === 'tool_start').length,
    itineraryCompleteRate: completeness(itinerary ? itinerary.value : null),
    itineraryDays: itinerary ? (itinerary.value.days || []).length : 0,
    seconds: Math.round((Date.now() - started) / 1000),
    text,
  };
}

async function run(label, disableMemory) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await runOnce(label, disableMemory);
      console.log('\n=== ' + label + ' ===');
      console.log(result.text.slice(0, 260) + (result.text.length > 260 ? '…' : ''));
      console.log('指标：' + JSON.stringify({ ...result, text: undefined }));
      return result;
    } catch (err) {
      lastError = err;
      console.log('[ablation] ' + label + ' 第 ' + attempt + ' 次失败：' + (err && err.message ? err.message : err) + '，重试…');
      await sleep(3000);
    }
  }
  throw lastError;
}

function hasInsights() {
  const record = memory.load(USER_ID);
  return Boolean(record.insights && record.insights.summary);
}

async function waitInsights(timeoutSec = 40) {
  for (let i = 0; i < timeoutSec; i += 1) {
    if (hasInsights()) return true;
    await sleep(1000);
  }
  return false;
}

(async () => {
  console.log('场景：' + SCENARIO);
  console.log('用户 ID：' + USER_ID + '\n');

  const off = await run('A 组：关闭记忆（对照组）', true).catch(() => null);

  console.log('\n=== 预热：开启记忆跑一次，产生记忆并消化 ===');
  await run('预热轮', false).catch(() => null);
  let ok = await waitInsights(40);
  if (!ok) {
    console.log('[ablation] 自动消化未完成，手动触发 py/digest.py …');
    try {
      execFileSync(process.platform === 'win32' ? 'python' : 'python3', [
        path.join(process.cwd(), 'py', 'digest.py'),
        '--user',
        USER_ID,
        '--force',
      ], { stdio: 'ignore', timeout: 120000 });
    } catch (err) {
      console.log('[ablation] 手动消化失败：' + (err && err.message ? err.message : err));
    }
    ok = await waitInsights(20);
  }
  console.log('[ablation] 记忆消化：' + (ok ? '完成' : '未完成（B 组结果可能不完整）'));

  const on = await run('B 组：开启记忆（实验组）', false).catch(() => null);

  console.log('\n=== 汇总 ===');
  console.log(JSON.stringify({ A: off && { ...off, text: undefined }, B: on && { ...on, text: undefined } }, null, 2));
})();
