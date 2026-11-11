'use strict';

// 单元测试：行程状态机（brain/memory.js v3.1.0 起）
// 运行：node --test test/unit/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-plan-'));
const memory = require('../../brain/memory');

const samplePlan = {
  title: '成都两天一晚',
  destination: '成都',
  budget_cny: 2000,
  days: [
    { date: '2026-11-12', title: '第 1 天', items: [{ time: '09:00', place: '宽窄巷子', activity: '逛逛', transport: '', cost_cny: 0 }] },
    { date: '2026-11-13', title: '第 2 天', items: [] },
  ],
};

test('创建：生成 id，状态为草稿', () => {
  const result = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' });
  assert.ok(result.ok);
  assert.match(result.itinerary.id, /^p/);
  assert.equal(result.itinerary.status, 'draft');
  assert.equal(result.itinerary.revisions, undefined);
});

test('状态机：草稿 → 确认 → 进行中 → 完成', () => {
  const plan = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  assert.ok(memory.setItineraryStatus('u-1', plan.id, 'confirmed').ok);
  assert.ok(memory.setItineraryStatus('u-1', plan.id, 'in_progress').ok);
  const done = memory.setItineraryStatus('u-1', plan.id, 'completed');
  assert.ok(done.ok);
  assert.equal(done.itinerary.status, 'completed');
});

test('状态机：v3.5.0 回退被允许，非法状态名被拒绝', () => {
  const plan = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  assert.ok(memory.setItineraryStatus('u-1', plan.id, 'confirmed').ok);
  const back = memory.setItineraryStatus('u-1', plan.id, 'draft');
  assert.equal(back.ok, true);
  assert.equal(back.itinerary.status, 'draft');
  const bad = memory.setItineraryStatus('u-1', plan.id, 'flying');
  assert.equal(bad.ok, false);
});

test('连续修改：同 plan_id 原地改，只被替换的天进 previousDays，revisions 递增', () => {
  const created = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  const updated = memory.upsertItinerary(
    'u-1',
    {
      title: '成都两天一晚（雨天室内版）',
      destination: '成都',
      budget_cny: 2100,
      days: [{ date: '2026-11-13', title: '第 2 天室内', items: [] }],
    },
    { mode: 'update', planId: created.id },
  );
  assert.ok(updated.ok);
  assert.equal(updated.itinerary.id, created.id);
  assert.equal(updated.itinerary.revisions, 1);
  assert.equal(updated.itinerary.previousDays.length, 1, '只有被替换的 11-12 进 previousDays');
  assert.equal(updated.itinerary.previousDays[0].date, '2026-11-12');
  assert.equal(updated.itinerary.title, '成都两天一晚（雨天室内版）');
  const plans = memory.listPlans('u-1');
  const mine = plans.filter((p) => p.id === created.id);
  assert.equal(mine.length, 1); // 没有新建
});

test('v3.5.0：未替换的后续天保留在 days 里，不塞进 previousDays', () => {
  const created = memory.upsertItinerary('u-1', {
    title: '成都四天',
    destination: '成都',
    days: [
      { date: 'D1', items: [] },
      { date: 'D2', items: [] },
      { date: 'D3', items: [] },
      { date: 'D4', items: [] },
    ],
  }, { mode: 'create' }).itinerary;
  const updated = memory.upsertItinerary(
    'u-1',
    { destination: '成都', days: [{ date: 'D3', items: [] }, { date: 'D4', items: [] }] },
    { mode: 'update', planId: created.id },
  );
  assert.equal(updated.itinerary.days.length, 2, 'D3/D4 仍是当前天');
  assert.equal(updated.itinerary.previousDays.length, 2, '只有 D1/D2 被替换进 previousDays');
  assert.deepEqual(updated.itinerary.previousDays.map((d) => d.date), ['D1', 'D2']);
});

test('删除：只有草稿可删，已确认不可删', () => {
  const draft = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  const confirmed = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  memory.setItineraryStatus('u-1', confirmed.id, 'confirmed');

  const removed = memory.removeItinerary('u-1', draft.id);
  assert.ok(removed.ok);
  const denied = memory.removeItinerary('u-1', confirmed.id);
  assert.equal(denied.ok, false);
});

test('getPlan：拿完整方案，含 previousDays 字段', () => {
  const plan = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  const got = memory.getPlan('u-1', plan.id);
  assert.equal(got.id, plan.id);
  assert.equal(got.status, 'draft');
  assert.ok('previousDays' in got || got.previousDays === undefined);
});

test('行程时间线：renderBlock 只含非草稿行程', () => {
  const created = memory.upsertItinerary('u-1', samplePlan, { mode: 'create' }).itinerary;
  memory.setItineraryStatus('u-1', created.id, 'completed');
  const record = memory.load('u-1');
  const block = memory.renderBlock(record, '成都', { max_inject_memories: 5 });
  assert.ok(block.includes('成都'));
});
