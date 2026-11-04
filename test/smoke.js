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

  console.log('\n冒烟测试：' + passed + ' 通过 / ' + failed + ' 失败');
  if (failed) process.exitCode = 1;
})();
