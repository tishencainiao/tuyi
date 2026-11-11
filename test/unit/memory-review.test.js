'use strict';

// 单元测试：记忆治理（v3.6.0）——元操作标签黑名单 + 合并建议/冲突提醒的执行
// 运行：node --test test/unit/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-review-'));
const memory = require('../../brain/memory');
const { cleanTags, isMetaTag } = require('../../brain/meta-tags');

test('cleanTags：过滤元操作标签、去空去重', () => {
  const tags = ['慢节奏', '记忆修改', '  ', '带父母', '删除记忆', '带父母', '行程管理'];
  const out = cleanTags(tags, 4);
  assert.deepEqual(out, ['慢节奏', '带父母']);
});

test('isMetaTag：包含匹配也判黑名单', () => {
  assert.ok(isMetaTag('记忆修改完成'));
  assert.ok(isMetaTag('修改行程'));
  assert.ok(!isMetaTag('喜欢慢节奏'));
});

test('addFacts：元操作标签不落库', () => {
  const record = memory.load('u-tags');
  memory.addFacts(record, [{ text: '喜欢慢节奏旅行', tags: ['慢节奏', '记忆修改'] }]);
  memory.save(record);
  const saved = memory.load('u-tags');
  const item = saved.memories.find((memory) => memory.text.includes('慢节奏'));
  assert.deepEqual(item.tags, ['慢节奏']);
});

test('digestDue：条数达到 review_trigger_count 也触发', () => {
  const record = memory.load('u-count');
  record.state = { memoriesSinceDigest: 0, lastDigestAt: null };
  for (let index = 0; index < 80; index += 1) {
    memory.addFacts(record, [{ text: '事实 ' + index + ' 条内容用于占位', tags: [] }]);
  }
  const { due } = memory.digestDue(record, { review_trigger_count: 80, digest_trigger_count: 3 });
  assert.ok(due);
});

test('applyMemoryReview：apply_merge 删源并合并', () => {
  const record = memory.load('u-merge');
  memory.addFacts(record, [{ text: '喜欢吃川菜', tags: ['川菜'] }]);
  memory.addFacts(record, [{ text: '喜欢川菜口味', tags: [] }]);
  memory.save(record);
  const saved = memory.load('u-merge');
  const ids = saved.memories.map((memory) => memory.id);
  saved.memoryReview = {
    updated: new Date().toISOString(),
    state: 'pending',
    merges: [{ ids, suggestion: '喜欢吃川菜' }],
    conflicts: [],
  };
  memory.save(saved);

  const result = memory.applyMemoryReview('u-merge', 'apply_merge', 0);
  assert.ok(result.ok);
  const after = memory.load('u-merge');
  assert.equal(after.memories.length, 1);
  assert.equal(after.memories[0].text, '喜欢吃川菜');
  assert.equal(after.memoryReview.state, 'none');
});

test('applyMemoryReview：keep_first 冲突二选一', () => {
  const record = memory.load('u-conflict');
  memory.addFacts(record, [{ text: '不吃辣', tags: [] }]);
  memory.addFacts(record, [{ text: '能吃微辣', tags: [] }]);
  memory.save(record);
  const saved = memory.load('u-conflict');
  const [a, b] = saved.memories;
  saved.memoryReview = {
    updated: new Date().toISOString(),
    state: 'pending',
    merges: [],
    conflicts: [{ aId: a.id, bId: b.id, a: a.text, b: b.text }],
  };
  memory.save(saved);

  const result = memory.applyMemoryReview('u-conflict', 'keep_first', 0);
  assert.ok(result.ok);
  const after = memory.load('u-conflict');
  assert.equal(after.memories.length, 1);
  assert.equal(after.memories[0].text, '不吃辣');
  assert.equal(after.memoryReview.state, 'none');
});

test('applyMemoryReview：dismiss 不改数据只移除建议', () => {
  const record = memory.load('u-dismiss');
  memory.addFacts(record, [{ text: '喜欢爬山', tags: [] }]);
  memory.addFacts(record, [{ text: '喜欢徒步', tags: [] }]);
  memory.save(record);
  const saved = memory.load('u-dismiss');
  const ids = saved.memories.map((memory) => memory.id);
  saved.memoryReview = {
    updated: new Date().toISOString(),
    state: 'pending',
    merges: [{ ids, suggestion: '喜欢户外运动' }],
    conflicts: [],
  };
  memory.save(saved);

  const result = memory.applyMemoryReview('u-dismiss', 'dismiss', 0);
  assert.ok(result.ok);
  const after = memory.load('u-dismiss');
  assert.equal(after.memories.length, 2);
  assert.equal(after.memoryReview.state, 'none');
});

test('applyMemoryReview：没有 pending 建议时拒绝', () => {
  const result = memory.applyMemoryReview('u-empty', 'apply_merge', 0);
  assert.ok(!result.ok);
});

test('renderBlock：pending 建议注入提示块', () => {
  const record = memory.load('u-render');
  memory.addFacts(record, [{ text: '不吃辣', tags: [] }]);
  memory.addFacts(record, [{ text: '能吃微辣', tags: [] }]);
  memory.save(record);
  const saved = memory.load('u-render');
  saved.memoryReview = {
    updated: new Date().toISOString(),
    state: 'pending',
    merges: [],
    conflicts: [{ aId: '', bId: '', a: '不吃辣', b: '能吃微辣' }],
  };
  const block = memory.renderBlock(saved, '今天想吃什么');
  assert.match(block, /待处理的记忆整理建议/);
  assert.match(block, /不吃辣/);
});
