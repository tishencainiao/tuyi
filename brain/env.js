'use strict';

/**
 * 读取 .env（兼容 Node 18：没有 process.loadEnvFile 时手动解析）。
 * 已存在的环境变量优先，不会被 .env 覆盖。
 */

const fs = require('node:fs');
const path = require('node:path');

function loadEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      return;
    } catch {
      /* 没有 .env 时继续走手动解析 */
    }
  }
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* 没有 .env 时忽略 */
  }
}

module.exports = { loadEnv };
