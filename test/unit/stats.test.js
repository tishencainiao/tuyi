'use strict';

// 单元测试：个人统计模块（brain/stats.js，v3.4.0 起无全局统计）
// 运行：node --test test/unit/

const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../../brain/stats');

test('normalizeCity：城市词表包含匹配 + 去后缀', () => {
  assert.equal(stats.normalizeCity('成都'), '成都');
  assert.equal(stats.normalizeCity('四川省成都市'), '成都');
  assert.equal(stats.normalizeCity('云南大理'), '大理');
  assert.equal(stats.normalizeCity('九寨沟县'), '九寨沟');
});

test('classifyIntent / budgetBucket：规则分类', () => {
  assert.equal(stats.classifyIntent('帮我排个行程'), '行程规划');
  assert.equal(stats.classifyIntent('云南天气怎么样'), '天气');
  assert.equal(stats.classifyIntent('随便聊聊'), '其他');
  assert.equal(stats.budgetBucket('预算 800 元'), '经济（<1500）');
  assert.equal(stats.budgetBucket('预算 3000 元'), '中档（1500-4000）');
  assert.equal(stats.budgetBucket('没提预算'), '未说明');
});

test('computePersonalStats：只统计已确认行程，草稿另计', () => {
  const record = {
    memories: [{ tags: ['美食'] }],
    insights: { summary: '喜欢美食', tags: ['美食', '慢节奏'] },
    itineraries: [
      { ts: '2026-11-01T00:00:00Z', status: 'completed', destination: '成都', budget_cny: 2000, days: [{}, {}], id: 'p1' },
      { ts: '2026-11-10T00:00:00Z', status: 'draft', destination: '杭州', budget_cny: 1500, days: [{}], id: 'p2' },
    ],
    turns: [],
  };
  const result = stats.computePersonalStats(record);
  assert.equal(result.tripCount, 1);
  assert.equal(result.draftCount, 1);
  assert.equal(result.cityCount, 1);
  assert.equal(result.totalDays, 2);
  assert.equal(result.totalBudget, 2000);
  assert.equal(result.avgBudget, 2000);
  assert.equal(result.cities[0].city, '成都');
  assert.equal(result.cities[0].count, 1);
});

test('computePersonalStats：空记录', () => {
  const result = stats.computePersonalStats({ memories: [], itineraries: [], turns: [] });
  assert.equal(result.tripCount, 0);
  assert.equal(result.draftCount, 0);
  assert.equal(result.cityCount, 0);
});

test('全局统计已删除：computeStats/collectRecords 不再导出', () => {
  assert.equal(stats.computeStats, undefined);
  assert.equal(stats.collectRecords, undefined);
});
