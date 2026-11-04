'use strict';

/**
 * 手动联网联调（不进冒烟）：node test/live.js
 * 需要 .env 里配置 DEEPSEEK_API_KEY / AMAP_KEY，会真实调用 DeepSeek 与高德。
 * 用途：改完工具 / 提示词后，验证「查景点 → 查天气 → 生成行程」整条链路。
 */

const path = require('node:path');
const fs = require('node:fs');

process.chdir(path.join(__dirname, '..'));
require('../brain/env').loadEnv(process.cwd());

const { runAgent } = require('../brain/agent');
const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));

const question =
  process.argv[2] ||
  '帮我查一下成都宽窄巷子和熊猫基地的景点信息，再看一下成都未来三天的天气，然后给我排个两天行程';

(async () => {
  const events = [];
  process.stdout.write('--- 模型输出 ---\n\n');
  for await (const evt of runAgent({ cfg, userId: 'live-test', userText: question })) {
    if (evt.type === 'delta') process.stdout.write(evt.text);
    else events.push(evt);
  }
  console.log('\n\n--- 事件序列 ---');
  for (const evt of events) {
    console.log(evt.type + (evt.name ? ':' + evt.name : '') + (evt.ok !== undefined ? ' ok=' + evt.ok : ''));
  }
  const itinerary = events.find((evt) => evt.type === 'itinerary');
  console.log('\n行程卡片：' + (itinerary ? '已生成（' + (itinerary.value.days || []).length + ' 天）' : '未生成'));
})();
