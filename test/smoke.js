'use strict';

/**
 * 冒烟测试（不联网）：node test/smoke.js
 * v3.1.0：使用临时数据目录（TUYI_DATA_DIR），不污染真实 data/memory。
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-smoke-'));

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

  await check('记忆：行程入库（v3.1.0 状态机）', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-trip');
    const created = memory.upsertItinerary(record.userId, { destination: '成都', title: '成都三天', budget_cny: 3000, days: [{}, {}] }, { mode: 'create' });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.created, true);
    assert.ok(created.itinerary.id, 'create 应生成 plan_id');
    assert.strictEqual(created.itinerary.status, 'draft');

    const reloaded = memory.load(record.userId);
    assert.strictEqual(reloaded.itineraries.length, 1);
    assert.strictEqual(reloaded.itineraries[0].destination, '成都');
  });

  await check('记忆：行程状态机流转', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-status');
    const created = memory.upsertItinerary(record.userId, { destination: '成都', days: [{}] }, { mode: 'create' });
    const planId = created.itinerary.id;

    const s1 = memory.setItineraryStatus(record.userId, planId, 'confirmed');
    assert.strictEqual(s1.ok, true);
    const s2 = memory.setItineraryStatus(record.userId, planId, 'in_progress');
    assert.strictEqual(s2.ok, true);
    const s3 = memory.setItineraryStatus(record.userId, planId, 'completed');
    assert.strictEqual(s3.ok, true);
    const back = memory.setItineraryStatus(record.userId, planId, 'draft');
    assert.strictEqual(back.ok, true, 'v3.5.0：completed 可以回退到 draft');

    const bad = memory.setItineraryStatus(record.userId, planId, 'flying');
    assert.strictEqual(bad.ok, false, '非法状态应拒绝');
    assert.strictEqual(memory.getPlan(record.userId, planId).status, 'draft');
  });

  await check('记忆：连续修改同一方案', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-revise');
    const created = memory.upsertItinerary(record.userId, {
      destination: '云南',
      days: [{ date: '第 1 天', items: [] }, { date: '第 2 天', items: [] }, { date: '第 3 天', items: [] }],
    }, { mode: 'create' });
    const planId = created.itinerary.id;

    // 只改第 2 天：第 1 天被替换进 previousDays，第 2/3 天仍是当前天
    const updated = memory.upsertItinerary(record.userId, {
      id: planId,
      destination: '云南',
      title: '云南改期版',
      days: [{ date: '第 2 天', items: [] }, { date: '第 3 天', items: [] }],
    }, { mode: 'update', planId });
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.updated, true);
    assert.strictEqual(updated.itinerary.id, planId, '修改后仍是同一 plan_id');
    assert.strictEqual(updated.itinerary.revisions, 1);
    assert.strictEqual(updated.itinerary.days.length, 2);
    assert.strictEqual(updated.itinerary.previousDays.length, 1, '只有被替换的第 1 天进入 previousDays');
    assert.strictEqual(updated.itinerary.previousDays[0].date, '第 1 天');

    // v3.5.0：再改一次但保留所有日期 → previousDays 不变多
    const updated2 = memory.upsertItinerary(record.userId, {
      id: planId,
      destination: '云南',
      days: [{ date: '第 2 天', items: [] }, { date: '第 3 天', items: [] }],
    }, { mode: 'update', planId });
    assert.strictEqual(updated2.itinerary.previousDays.length, 1, '未替换的天不会重复进 previousDays');

    const list = memory.listPlans(record.userId);
    assert.strictEqual(list.length, 1, '修改不产生新方案');
  });

  await check('行程改名（v3.5.0）', () => {
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-rename');
    const created = memory.upsertItinerary(record.userId, { destination: '云南', days: [{}] }, { mode: 'create' });
    const renamed = memory.renameItinerary(record.userId, created.itinerary.id, '云南蜜月之旅');
    assert.strictEqual(renamed.ok, true);
    assert.strictEqual(renamed.itinerary.title, '云南蜜月之旅');
    const tooLong = memory.renameItinerary(record.userId, created.itinerary.id, '字'.repeat(61));
    assert.strictEqual(tooLong.ok, false, '超长名字应拒绝');
  });

  await check('统计：仅统计非草稿行程', () => {
    const stats = require('../brain/stats');
    const memory = require('../brain/memory');
    const record = memory.emptyRecord('smoke-draftstats');
    memory.upsertItinerary(record.userId, { destination: '成都', budget_cny: 3000, days: [{ items: [] }] }, { mode: 'create' });
    const confirmed = memory.upsertItinerary(record.userId, { destination: '成都', budget_cny: 4000, days: [{ items: [] }] }, { mode: 'create' });
    memory.setItineraryStatus(record.userId, confirmed.itinerary.id, 'confirmed');
    const result = stats.computePersonalStats(memory.load(record.userId));
    assert.strictEqual(result.tripCount, 1, '草稿不计入旅行次数');
    assert.strictEqual(result.draftCount, 1);
    assert.strictEqual(result.totalBudget, 4000, '预算只统计已确认行程');
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

  // v3.4.0：全局统计（computeStats/collectRecords）已删除，不再有对应用例；
  // 个人统计见「统计：个人画像只算已确认行程」用例。

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
      { ts: '2026-10-01T00:00:00Z', destination: '成都', days: [{}, {}], budget_cny: 3000, status: 'completed' },
      { ts: '2026-11-01T00:00:00Z', destination: '西安', days: [{}], budget_cny: 1500, status: 'completed' },
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

  await check('统计：个人旅行画像（目的地归一化与聚合）', () => {
    const stats = require('../brain/stats');
    const record = {
      userId: 'p1',
      memories: [{ text: '带父母去成都，预算中等', tags: ['带父母'] }],
      insights: { summary: 's', tags: ['慢节奏'] },
      itineraries: [
        { ts: '2026-09-10T00:00:00Z', destination: '成都', budget_cny: 3000, days: [{}, {}], status: 'completed' },
        { ts: '2026-11-01T00:00:00Z', destination: '成都市', budget_cny: 4000, days: [{}, {}, {}], status: 'completed' },
      ],
      turns: [{ role: 'user', text: '你好' }],
    };
    const result = stats.computePersonalStats(record);
    assert.strictEqual(result.tripCount, 2);
    assert.strictEqual(result.cityCount, 1);
    assert.strictEqual(result.cities[0].city, '成都');
    assert.strictEqual(result.cities[0].count, 2);
    assert.strictEqual(result.cities[0].days, 5);
    assert.strictEqual(result.totalDays, 5);
    assert.strictEqual(result.avgBudget, 3500);
    assert.ok(result.tags.length >= 1);
  });

  await check('记忆：手动标记去过（增 / 删 / 去重）', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const memory = require('../brain/memory');
    const userId = 'smoke-visit';
    try {
      assert.strictEqual(memory.addVisit(userId, '成都市', 'city').ok, true);
      assert.strictEqual(memory.addVisit(userId, '成都市', 'city').existed, true);
      assert.strictEqual(memory.listVisits(userId).length, 1);
      assert.strictEqual(memory.listVisits(userId)[0].level, 'city');
      assert.strictEqual(memory.removeVisit(userId, '成都市', 'city').removed, 1);
      assert.strictEqual(memory.listVisits(userId).length, 0);
    } finally {
      fs.rmSync(path.join(memory.DATA_DIR, userId + '.json'), { force: true });
    }
  });

  await check('账号：账号类型识别（用户名 / 邮箱 / 手机）', () => {
    const auth = require('../brain/auth');
    assert.strictEqual(auth.classifyAccount('xiaoyi').type, 'username');
    assert.strictEqual(auth.classifyAccount('test@qq.com').type, 'email');
    assert.strictEqual(auth.classifyAccount('13800138000').type, 'phone');
    assert.strictEqual(auth.classifyAccount('a'), null);
    assert.strictEqual(auth.classifyAccount(''), null);
  });

  await check('账号：邮箱注册需要验证码（错码拒绝 / 对码通过 / 重复注册拒绝）', () => {
    const auth = require('../brain/auth');
    const issue = auth.issueVerifyCode('tuyi-v32@test.com');
    assert.strictEqual(issue.ok, true);
    assert.ok(/^\d{6}$/.test(issue.mockCode));
    const bad = auth.createUser('tuyi-v32@test.com', '123456', { code: '000000' });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.error.includes('验证码'));
    const good = auth.createUser('tuyi-v32@test.com', '123456', { code: issue.mockCode });
    assert.strictEqual(good.ok, true);
    assert.ok(good.userId.startsWith('u-'));
    const again = auth.issueVerifyCode('tuyi-v32@test.com');
    const dup = auth.createUser('tuyi-v32@test.com', '123456', { code: again.mockCode });
    assert.strictEqual(dup.ok, false);
    assert.ok(dup.error.includes('已注册'));
  });

  await check('账号：用户名注册免验证码 + 邮箱登录 + 密码校验', () => {
    const auth = require('../brain/auth');
    const created = auth.createUser('smokeuser32', '123456');
    assert.strictEqual(created.ok, true);
    assert.strictEqual(auth.verifyLogin('smokeuser32', '123456').ok, true);
    assert.strictEqual(auth.verifyLogin('tuyi-v32@test.com', '123456').ok, true);
    assert.strictEqual(auth.verifyLogin('smokeuser32', 'badbad').ok, false);
  });

  await check('账号：onboarded 引导标记可写可读', () => {
    const auth = require('../brain/auth');
    const created = auth.createUser('smokeonboard', '123456');
    assert.strictEqual(created.ok, true);
    assert.strictEqual(auth.getUserById(created.userId).onboarded, false);
    auth.markOnboarded(created.userId);
    assert.strictEqual(auth.getUserById(created.userId).onboarded, true);
  });

  await check('资料：更新校验（年龄 / 性别 / 同行人 / 未知字段忽略）', () => {
    const profile = require('../brain/profile');
    const userId = 'smoke-profile';
    const first = profile.updateProfile(userId, {
      nickname: '小忆测试', age: 25, gender: '女',
      companions: [{ name: '妈妈', relation: '妈妈', age: 50 }, { name: '', relation: '' }],
      preferences: ['拍照', '美食', '拍照'],
      travel_style: '松弛',
      health_notes: '膝盖不好，少爬楼梯',
      hacker: '忽略我',
    });
    assert.strictEqual(first.ok, true);
    const saved = profile.getProfile(userId);
    assert.strictEqual(saved.nickname, '小忆测试');
    assert.strictEqual(saved.companions.length, 1);
    assert.strictEqual(saved.companions[0].name, '妈妈');
    assert.strictEqual(saved.preferences.length, 2);
    assert.strictEqual(saved.sources.nickname, 'confirmed');
    assert.strictEqual(saved.hacker, undefined);
    assert.strictEqual(profile.updateProfile(userId, { age: 500 }).ok, false);
    assert.strictEqual(profile.updateProfile(userId, { gender: '外星人' }).ok, false);
    assert.strictEqual(profile.updateProfile(userId, { companions: '不是数组' }).ok, false);
  });

  await check('资料：提示块渲染（有值才注入）', () => {
    const profile = require('../brain/profile');
    const empty = profile.renderProfileBlock(profile.emptyProfile('x'));
    assert.strictEqual(empty, '');
    const block = profile.renderProfileBlock({
      nickname: '小林', age: 24, companions: [{ name: '妈妈', relation: '妈妈', age: 52 }], preferences: ['美食'],
    });
    assert.ok(block.includes('【用户资料】'));
    assert.ok(block.includes('妈妈（52 岁）'));
    assert.ok(block.includes('美食'));
  });

  console.log('\n冒烟测试：' + passed + ' 通过 / ' + failed + ' 失败');
  if (failed) process.exitCode = 1;
})();
