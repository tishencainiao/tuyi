'use strict';

/**
 * 生成测试账户（写入本地 data/users.json，不进版本库）：
 *   node scripts/seed-accounts.js
 *
 * 默认创建 test1 / test2 / test3，密码都是 123456（仅用于本地演示）。
 */

const auth = require('../brain/auth');

const ACCOUNTS = [
  ['test1', '123456'],
  ['test2', '123456'],
  ['test3', '123456'],
];

let created = 0;
let skipped = 0;

for (const [username, password] of ACCOUNTS) {
  const result = auth.createUser(username, password);
  if (result.ok) {
    created += 1;
    console.log('[seed-accounts] 已创建 ' + username + ' / ' + password);
  } else {
    skipped += 1;
    console.log('[seed-accounts] 跳过 ' + username + '：' + result.error);
  }
}

console.log('[seed-accounts] 完成：新建 ' + created + '，跳过 ' + skipped);
