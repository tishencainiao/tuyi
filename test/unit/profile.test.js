'use strict';

// 单元测试：个人资料模块（brain/profile.js）
// 运行：node --test test/unit/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-profile-'));
const profile = require('../../brain/profile');

test('空资料：getProfile 返回空值，提示块为空串', () => {
  const p = profile.getProfile('u-none');
  assert.equal(p.nickname, '');
  assert.equal(p.companions.length, 0);
  assert.equal(profile.renderProfileBlock(p), '');
});

test('updateProfile：白名单字段写入，来源标 confirmed', () => {
  const result = profile.updateProfile('u-a', {
    nickname: '小林',
    age: 22,
    gender: '女',
    companions: [{ name: '外婆', relation: '外婆', age: 68 }],
    preferences: ['美食', '拍照'],
    travel_style: '松弛',
    health_notes: '膝盖不好，少爬楼',
    hacker_field: '应被忽略',
  });
  assert.ok(result.ok);
  const p = result.profile;
  assert.equal(p.nickname, '小林');
  assert.equal(p.age, 22);
  assert.equal(p.gender, '女');
  assert.equal(p.companions[0].relation, '外婆');
  assert.deepEqual(p.preferences, ['美食', '拍照']);
  assert.equal(p.hacker_field, undefined);
  assert.equal(p.sources.nickname, 'confirmed');
});

test('updateProfile：校验拦截（年龄越界 / 性别枚举 / 同行人超量）', () => {
  assert.equal(profile.updateProfile('u-b', { age: 200 }).ok, false);
  assert.equal(profile.updateProfile('u-b', { gender: '男男女女' }).ok, false);
  const many = Array.from({ length: 11 }, (_, i) => ({ name: 'x' + i, relation: '朋友', age: 30 }));
  assert.equal(profile.updateProfile('u-b', { companions: many }).ok, false);
});

test('updateProfile：偏好去重', () => {
  const result = profile.updateProfile('u-c', { preferences: ['美食', '美食', '拍照'] });
  assert.deepEqual(result.profile.preferences, ['美食', '拍照']);
});

test('renderProfileBlock：有值才注入，包含关键信息', () => {
  const block = profile.renderProfileBlock({
    nickname: '小林',
    age: 22,
    gender: '女',
    companions: [{ name: '外婆', relation: '外婆', age: 68 }],
    preferences: ['美食'],
    travel_style: '松弛',
    health_notes: '',
  });
  assert.ok(block.includes('【用户资料】'));
  assert.ok(block.includes('小林'));
  assert.ok(block.includes('68'));
  assert.ok(block.includes('松弛'));
});
