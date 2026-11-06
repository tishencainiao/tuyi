'use strict';

/**
 * 冒烟测试（不联网）：node test/smoke.js
 */

const assert = require('node:assert');
const { buildEndpoint } = require('../brain/llm');
const tools = require('../brain/tools');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    console.error('  ✗ ' + name + '\n    ' + (err && err.message ? err.message : err));
  }
}

const sample = {
  title: '成都三天两晚',
  destination: '成都',
  budget_cny: 3000,
  days: [
    {
      date: '第 1 天',
      title: '宽窄巷子',
      items: [
        { time: '09:00', place: '宽窄巷子', activity: '逛老街、喝茶', transport: '地铁 4 号线', cost_cny: 50 },
        { time: '12:00', place: '奎星楼街', activity: '吃冒菜', cost_cny: 60 },
      ],
    },
    {
      date: '第 2 天',
      title: '熊猫基地',
      items: [
        { time: '08:00', place: '成都大熊猫繁育研究基地', activity: '看熊猫', transport: '打车', cost_cny: 55 },
      ],
    },
  ],
};

(async function main() {
  await check('endpoint 拼接（带不带 /v1 都正确）', () => {
    assert.strictEqual(buildEndpoint('https://api.deepseek.com'), 'https://api.deepseek.com/v1/chat/completions');
    assert.strictEqual(buildEndpoint('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
    assert.strictEqual(buildEndpoint('https://api.deepseek.com/'), 'https://api.deepseek.com/v1/chat/completions');
  });

  await check('工具注册包含 plan_trip', () => {
    const names = tools.defs().map((def) => def.function.name);
    assert.ok(names.includes('plan_trip'), '缺少 plan_trip：' + names.join(','));
  });

  await check('plan_trip 接受合法行程', async () => {
    const result = await tools.dispatch('plan_trip', sample);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.itinerary.days.length, 2);
    assert.strictEqual(result.itinerary.days[1].items[0].place, '成都大熊猫繁育研究基地');
    assert.ok(Array.isArray(result.warnings));
  });

  await check('plan_trip 拒绝空目的地', async () => {
    const result = await tools.dispatch('plan_trip', { destination: '', days: [] });
    assert.strictEqual(result.ok, false);
  });

  await check('plan_trip 对缺字段给出 warning', async () => {
    const result = await tools.dispatch('plan_trip', {
      destination: '成都',
      days: [{ date: '第 1 天', items: [{ place: '宽窄巷子' }] }],
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.length > 0);
  });

  await check('未知工具会抛错', async () => {
    await assert.rejects(() => tools.dispatch('not_exist', {}), /未知工具/);
  });

  await check('工具注册包含 search_poi / get_weather', () => {
    const names = tools.defs().map((def) => def.function.name);
    assert.ok(names.includes('search_poi'), '缺少 search_poi：' + names.join(','));
    assert.ok(names.includes('get_weather'), '缺少 get_weather：' + names.join(','));
  });

  await check('高德 POI 结果解析', () => {
    const { formatPoi } = require('../tools/_amap');
    const poi = formatPoi({
      name: '宽窄巷子',
      address: '青羊区长顺上街',
      location: '104.055,30.669',
      type: '风景名胜',
      tel: '028-12345678',
      biz_ext: { rating: '4.5', cost: '0' },
    });
    assert.strictEqual(poi.name, '宽窄巷子');
    assert.deepStrictEqual(poi.location, { lng: 104.055, lat: 30.669 });
    assert.strictEqual(poi.rating, 4.5);
  });

  await check('天气结果解析', () => {
    const { formatWeatherDay } = require('../tools/_amap');
    const day = formatWeatherDay({
      date: '2026-11-05',
      week: '5',
      dayweather: '多云',
      nightweather: '小雨',
      daytemp: '19',
      nighttemp: '12',
      daywind: '北风',
      daypower: '3',
    });
    assert.strictEqual(day.date, '2026-11-05');
    assert.strictEqual(day.day, '多云');
    assert.strictEqual(day.dayTemp, 19);
    assert.strictEqual(day.wind, '北风3');
  });

  await check('缺少 AMAP_KEY 时 search_poi 优雅报错', async () => {
    const saved = process.env.AMAP_KEY;
    delete process.env.AMAP_KEY;
    try {
      const result = await tools.dispatch('search_poi', { keywords: '宽窄巷子', city: '成都' });
      assert.strictEqual(result.ok, false);
      assert.match(String(result.error), /AMAP_KEY/);
    } finally {
      if (saved !== undefined) process.env.AMAP_KEY = saved;
    }
  });

  await check('记忆：抽取 JSON 容错解析', () => {
    const { parseJsonLoose } = require('../brain/llm');
    const parsed = parseJsonLoose('```json\n{"facts":[{"text":"喜欢自然风光","tags":["自然风光"]}]}\n```');
    assert.ok(parsed && parsed.facts.length === 1);
    assert.strictEqual(parsed.facts[0].text, '喜欢自然风光');
  });

  await check('记忆：事实入库、去重与注入块', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-user');
    const added = memory.addFacts(record, [
      { text: '带父母出行，预算中等，怕累', tags: ['带父母', '预算中等'] },
      { text: '喜欢自然风光', tags: ['自然风光'] },
    ]);
    assert.strictEqual(added, 2);
    assert.strictEqual(record.state.memoriesSinceDigest, 2);

    const block = memory.renderBlock(record, '想带父母去成都');
    assert.match(block, /用户记忆/);
    assert.match(block, /带父母/);

    const again = memory.addFacts(record, [{ text: '带父母出行，预算中等，怕累' }]);
    assert.strictEqual(again, 0);
  });

  await check('记忆：消化触发与计数', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-user');
    record.state.memoriesSinceDigest = 3;
    assert.strictEqual(memory.digestDue(record, { digest_trigger_count: 3 }).due, true);
    memory.markDigest(record);
    assert.strictEqual(memory.digestDue(record, { digest_trigger_count: 3 }).due, false);
    assert.strictEqual(record.state.memoriesSinceDigest, 0);
  });

  await check('记忆：行程入库', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-trip');
    memory.appendItinerary(record, { destination: '成都', title: '成都三天', budget_cny: 3000, days: [{}, {}] });
    assert.strictEqual(record.itineraries.length, 1);
    assert.strictEqual(record.itineraries[0].destination, '成都');
  });

  await check('统计：意图分类与预算分档', () => {
    const stats = require('../brain/stats');
    assert.strictEqual(stats.classifyIntent('帮我排个三天行程'), '行程规划');
    assert.strictEqual(stats.classifyIntent('宽窄巷子门票多少'), '景点查询');
    assert.strictEqual(stats.classifyIntent('明天会不会下雨'), '天气');
    assert.strictEqual(stats.budgetBucket('预算 3000 元'), '中档（1500-4000）');
    assert.strictEqual(stats.budgetBucket('预算中等'), '中档（1500-4000）');
    assert.strictEqual(stats.budgetBucket('随便'), '未说明');
  });

  await check('统计：多用户汇总', () => {
    const stats = require('../brain/stats');
    const records = [
      {
        userId: 'a',
        memories: [{ text: '带父母去成都，预算中等', tags: ['带父母'] }],
        insights: { summary: 's', tags: ['慢节奏'] },
        itineraries: [{ destination: '成都' }],
        turns: [
          { role: 'user', text: '帮我排个行程' },
          { role: 'assistant', text: '好的' },
        ],
      },
      {
        userId: 'b',
        memories: [{ text: '预算 5000 元去云南', tags: ['自然风光'] }],
        itineraries: [],
        turns: [{ role: 'user', text: '云南天气怎么样' }],
      },
    ];
    const result = stats.computeStats(records);
    assert.strictEqual(result.totals.users, 2);
    assert.strictEqual(result.totals.memories, 2);
    assert.strictEqual(result.totals.itineraries, 1);
    assert.ok(result.tagDistribution.length >= 2);
    assert.ok(result.intentDistribution.length >= 2);
  });

  await check('账号：注册 / 登录 / 会话 / 密码不落明文', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-auth-'));
    process.env.TUYI_DATA_DIR = tmp;
    try {
      const auth = require('../brain/auth');
      const reg = auth.createUser('tester', 'secret123');
      assert.strictEqual(reg.ok, true);
      assert.strictEqual(auth.createUser('tester', 'secret123').ok, false);
      assert.strictEqual(auth.verifyLogin('tester', 'secret123').ok, true);
      assert.strictEqual(auth.verifyLogin('tester', 'wrong-pass').ok, false);
      const token = auth.createSession(reg.userId);
      assert.ok(auth.getSession(token));
      auth.destroySession(token);
      assert.strictEqual(auth.getSession(token), null);
      const users = JSON.parse(fs.readFileSync(path.join(tmp, 'users.json'), 'utf8'));
      const stored = Object.values(users)[0];
      assert.ok(stored.hash && stored.hash !== 'secret123');
      assert.ok(stored.salt && stored.salt.length >= 16);
    } finally {
      delete process.env.TUYI_DATA_DIR;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await check('记忆：会话历史按 conversationId 区分', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('hist-user');
    memory.appendTurn(record, 'user', '第一句', 'c1');
    memory.appendTurn(record, 'assistant', '回复一', 'c1');
    memory.appendTurn(record, 'user', '第二句', 'c2');
    assert.strictEqual(record.turns.filter((turn) => turn.conversationId === 'c1').length, 2);
    assert.strictEqual(record.turns.filter((turn) => turn.conversationId === 'c2').length, 1);
  });

  await check('记忆：行程时间线注入（第一次 / 第 N 次）', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('tl-user');
    record.itineraries.push(
      { ts: '2026-10-01T00:00:00Z', destination: '成都', days: [{}, {}], budget_cny: 3000 },
      { ts: '2026-11-01T00:00:00Z', destination: '西安', days: [{}], budget_cny: 1500 },
    );
    const block = memory.renderBlock(record, '我第一次去哪了');
    assert.match(block, /行程时间线/);
    assert.match(block, /第 1 次：2026-10-01 · 成都/);
    assert.match(block, /第 2 次：2026-11-01 · 西安/);
  });

  await check('记忆：手动改 / 删 / 按内容定位', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const memory = require('../brain/memory');
    const userId = 'smoke-edit';
    const record = memory.emptyRecord(userId);
    memory.addFacts(record, [{ text: '我不吃辣', tags: ['忌口'] }]);
    memory.save(record);
    try {
      const id = memory.load(userId).memories[0].id;
      assert.strictEqual(memory.updateMemory(userId, id, { text: '我能吃微辣' }).ok, true);
      assert.strictEqual(memory.load(userId).memories[0].text, '我能吃微辣');
      assert.strictEqual(memory.findMemories(userId, '微辣').length, 1);
      assert.strictEqual(memory.removeMemory(userId, id).ok, true);
      assert.strictEqual(memory.load(userId).memories.length, 0);
    } finally {
      fs.rmSync(path.join(memory.DATA_DIR, userId + '.json'), { force: true });
    }
  });

  await check('工具：memory_edit 带用户上下文（只改自己）', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const memory = require('../brain/memory');
    const userId = 'smoke-tool-edit';
    try {
      const add = await tools.dispatch('memory_edit', { action: 'add', text: '我喜欢海边', tags: ['海岛'] }, { userId });
      assert.strictEqual(add.ok, true);
      assert.strictEqual(memory.load(userId).memories.length, 1);
      const removed = await tools.dispatch('memory_edit', { action: 'remove', match: '海边' }, { userId });
      assert.strictEqual(removed.ok, true);
      assert.strictEqual(memory.load(userId).memories.length, 0);
      const noCtx = await tools.dispatch('memory_edit', { action: 'add', text: '没有上下文' });
      assert.strictEqual(noCtx.ok, false);
    } finally {
      fs.rmSync(path.join(memory.DATA_DIR, userId + '.json'), { force: true });
    }
  });

  console.log('\n冒烟测试：' + passed + ' 通过 / ' + failed + ' 失败');
  if (failed) process.exitCode = 1;
})();
