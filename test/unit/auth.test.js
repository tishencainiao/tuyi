'use strict';

// 单元测试：账号模块（brain/auth.js）
// 运行：node --test test/unit/   （Node 18.19 自带 test runner）

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-auth-'));
const auth = require('../../brain/auth');

test('classifyAccount：用户名 / 邮箱 / 手机号 / 非法', () => {
  assert.deepEqual(auth.classifyAccount('alice'), { type: 'username', value: 'alice' });
  assert.deepEqual(auth.classifyAccount('a@b.com'), { type: 'email', value: 'a@b.com' });
  assert.deepEqual(auth.classifyAccount('13812345678'), { type: 'phone', value: '13812345678' });
  assert.equal(auth.classifyAccount('a'), null); // 用户名至少 2 字符
  assert.deepEqual(auth.classifyAccount('1234567'), { type: 'username', value: '1234567' }); // 不是手机号，但可当用户名
});

test('验证码：签发 → 校验一次 → 二次使用失败', () => {
  const issued = auth.issueVerifyCode('x@y.com');
  assert.ok(issued.ok);
  assert.match(String(issued.mockCode), /^\d{6}$/);
  assert.ok(auth.consumeVerifyCode('x@y.com', issued.mockCode).ok);
  const again = auth.consumeVerifyCode('x@y.com', issued.mockCode);
  assert.equal(again.ok, false); // 一次性
});

test('验证码：错误码被拒绝', () => {
  auth.issueVerifyCode('z@y.com');
  const bad = auth.consumeVerifyCode('z@y.com', '000000');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, '验证码错误');
});

test('邮箱注册：必须验码，密码不落明文', () => {
  const noCode = auth.createUser('nocode@y.com', 'secret123');
  assert.equal(noCode.ok, false); // 邮箱没验证码不许注册
  const code = auth.issueVerifyCode('reg@y.com').mockCode;
  const result = auth.createUser('reg@y.com', 'secret123', { code });
  assert.ok(result.ok);
  assert.equal(result.username, 'reg@y.com');
  const raw = JSON.parse(fs.readFileSync(path.join(process.env.TUYI_DATA_DIR, 'users.json'), 'utf8'));
  const entry = raw[result.userId];
  assert.equal(entry.hash.includes('secret123'), false);
  assert.ok(entry.salt);
  assert.ok(entry.hash);
});

test('邮箱重复注册：拒绝', () => {
  const code = auth.issueVerifyCode('dup@y.com').mockCode;
  assert.ok(auth.createUser('dup@y.com', 'secret123', { code }).ok);
  const code2 = auth.issueVerifyCode('dup@y.com').mockCode;
  const again = auth.createUser('dup@y.com', 'secret123', { code: code2 });
  assert.equal(again.ok, false);
});

test('用户名注册：已停用（v3.7.0），老账号登录仍可用', () => {
  const blocked = auth.createUser('unituser', 'pass1234');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /已停用/);
  const code = auth.issueVerifyCode('unit@y.com').mockCode;
  const created = auth.createUser('unit@y.com', 'pass1234', { code });
  assert.ok(created.ok);
  const renamed = auth.updateUsername(created.userId, 'unituser');
  assert.ok(renamed.ok);
  const ok = auth.verifyLogin('unituser', 'pass1234');
  assert.ok(ok.ok);
  assert.equal(ok.username, 'unituser');
  assert.equal(auth.verifyLogin('unituser', 'wrong123').ok, false);
  const raw = JSON.parse(fs.readFileSync(path.join(process.env.TUYI_DATA_DIR, 'users.json'), 'utf8'));
  assert.equal(raw[created.userId].hash.includes('pass1234'), false);
});

test('改用户名：重名拒绝、格式校验', () => {
  const code1 = auth.issueVerifyCode('n1@y.com').mockCode;
  const first = auth.createUser('n1@y.com', 'pass1234', { code: code1 });
  const code2 = auth.issueVerifyCode('n2@y.com').mockCode;
  const second = auth.createUser('n2@y.com', 'pass1234', { code: code2 });
  assert.ok(auth.updateUsername(second.userId, 'name-2').ok);
  const clash = auth.updateUsername(second.userId, 'name-2'); // 自己重名自己可以
  assert.ok(clash.ok);
  const other = auth.createUser('n3@y.com', 'pass1234', { code: auth.issueVerifyCode('n3@y.com').mockCode });
  assert.equal(auth.updateUsername(other.userId, 'NAME-2').ok, false); // 忽略大小写查重
  assert.equal(auth.updateUsername(first.userId, 'a').ok, false); // 太短
});

test('markOnboarded：引导标记可写可读', () => {
  const created = auth.createUser('unituser2@y.com', 'pass1234', { code: auth.issueVerifyCode('unituser2@y.com').mockCode });
  const before = auth.getUserById(created.userId);
  assert.equal(before.onboarded, false);
  auth.markOnboarded(created.userId);
  const after = auth.getUserById(created.userId);
  assert.equal(after.onboarded, true);
});
