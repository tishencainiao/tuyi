'use strict';

// 单元测试：账号个性化（brain/account.js + brain/auth.js 头像元信息）
// 运行：node --test test/unit/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-account-'));
const auth = require('../../brain/auth');
const account = require('../../brain/account');

// 1x1 透明 PNG
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeUser(email) {
  return auth.createUser(email, 'pass1234', { code: auth.issueVerifyCode(email).mockCode });
}

test('头像：保存 PNG → 元信息可读、文件存在', () => {
  const user = makeUser('av1@y.com');
  const result = account.saveAvatar(user.userId, TINY_PNG);
  assert.ok(result.ok);
  assert.equal(result.ext, 'png');
  const meta = auth.getUserById(user.userId);
  assert.equal(meta.avatarExt, 'png');
  assert.ok(meta.avatarAt);
  const found = account.existingAvatar(user.userId);
  assert.ok(found);
  assert.ok(fs.statSync(found.file).isFile());
});

test('头像：非法格式 / 空数据拒绝', () => {
  const user = makeUser('av2@y.com');
  const bad = account.saveAvatar(user.userId, 'data:text/plain;base64,aGVsbG8=');
  assert.equal(bad.ok, false);
  const empty = account.saveAvatar(user.userId, 'data:image/png;base64,');
  assert.equal(empty.ok, false);
  assert.equal(account.existingAvatar(user.userId), null);
});

test('头像：换扩展名后旧文件被清理', () => {
  const user = makeUser('av3@y.com');
  assert.ok(account.saveAvatar(user.userId, TINY_PNG).ok);
  const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  assert.ok(account.saveAvatar(user.userId, jpg).ok);
  const found = account.existingAvatar(user.userId);
  assert.equal(found.ext, 'jpg');
  assert.equal(fs.existsSync(path.join(found.file, '..', user.userId + '.png')), false);
});
