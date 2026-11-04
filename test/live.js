'use strict';

/**
 * 手动联网联调（不进冒烟）：node test/live.js
 * 需要 .env 里配置 DEEPSEEK_API_KEY / AMAP_KEY，会真实调用 DeepSeek 与高德。
 *
 * 验证两件事：
 * 1）第一轮：查景点 → 查天气 → 排行程（里程碑 2）
 * 2）第二轮：记忆是否被注入（里程碑 3）——先抽取事实，再等 Python 消化出 insights
 */

const path = require('node:path');
const fs = require('node:fs');

process.chdir(path.join(__dirname, '..'));
require('../brain/env').loadEnv(process.cwd());
process.env.TUYI_DEBUG_MEMORY = '1';

const { runAgent } = require('../brain/agent');
const memory = require('../brain/memory');
const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));

const USER_ID = 'live-test';
const Q1 =
  process.argv[2] ||
  '我下个月想带爸妈去成都玩三天，预算中等，不想太累；帮我查一下宽窄巷子和熊猫基地的景点信息，再看一下成都未来三天的天气，然后排个行程';
const Q2 = '你还记得我的偏好吗？帮我推荐下一个适合我的目的地，简单说说理由就行。';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chat(label, question) {
  console.log('\n========== ' + label + ' ==========\n');
  const events = [];
  for await (const evt of runAgent({ cfg, userId: USER_ID, userText: question })) {
    if (evt.type === 'delta') process.stdout.write(evt.text);
    else events.push(evt);
  }
  console.log('\n\n--- 事件 ---');
  for (const evt of events) {
    console.log(evt.type + (evt.name ? ':' + evt.name : '') + (evt.ok !== undefined ? ' ok=' + evt.ok : ''));
  }
  const itinerary = events.find((evt) => evt.type === 'itinerary');
  if (itinerary) console.log('行程卡片：已生成（' + (itinerary.value.days || []).length + ' 天）');
  return events;
}

(async () => {
  await chat('第一轮：查景点 + 排行程', Q1);

  let record = memory.load(USER_ID);
  console.log('\n[记忆] 抽到 ' + record.memories.length + ' 条事实：');
  for (const item of record.memories) console.log('  - ' + item.text);

  console.log('\n[消化] 等待 Python 记忆消化（最多 45 秒）…');
  for (let i = 0; i < 45; i += 1) {
    await sleep(1000);
    record = memory.load(USER_ID);
    if (record.insights && record.insights.summary) break;
  }
  record = memory.load(USER_ID);
  console.log('[消化] 结果：' + (record.insights ? JSON.stringify(record.insights) : '（未完成）'));

  await chat('第二轮：验证记忆注入', Q2);

  record = memory.load(USER_ID);
  console.log('\n[最终] memories=' + record.memories.length + ' insights=' + JSON.stringify(record.insights));
})();
