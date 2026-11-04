'use strict';

/**
 * 自检：不联网，检查语法 / 配置 / 工具注册。
 * 用法：node check.js
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
let failed = 0;

function ok(msg) {
  console.log('  ✓ ' + msg);
}
function bad(msg) {
  failed += 1;
  console.error('  ✗ ' + msg);
}

function collectJs(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'data' || name.startsWith('.')) continue;
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) collectJs(abs, out);
    else if (name.endsWith('.js')) out.push(abs);
  }
}

console.log('[1/3] 语法检查');
const files = [];
collectJs(ROOT, files);
let syntaxErrors = 0;
for (const file of files) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (err) {
    syntaxErrors += 1;
    bad(path.relative(ROOT, file) + '：' + err.message);
  }
}
if (!syntaxErrors) ok(files.length + ' 个 JS 文件语法通过');

console.log('[2/3] 配置检查');
let cfg = null;
try {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  ok('config.json 可解析');
} catch (err) {
  bad('config.json 解析失败：' + err.message);
}
if (cfg) {
  if (cfg.server && cfg.server.port) ok('服务端口 ' + cfg.server.port);
  else bad('config.server.port 缺失');
  if (cfg.llm && cfg.llm.model && cfg.llm.base_url) ok('模型 ' + cfg.llm.model + ' @ ' + cfg.llm.base_url);
  else bad('config.llm 缺少 model / base_url');
}
if (fs.existsSync(path.join(ROOT, '.env'))) ok('.env 已存在');
else console.log('  ! .env 不存在（复制 .env.example 为 .env 并填写 DEEPSEEK_API_KEY）');

console.log('[3/3] 工具注册检查');
try {
  const tools = require('./brain/tools');
  const defs = tools.defs();
  if (defs.length === 0) bad('没有注册任何工具');
  for (const def of defs) ok('工具 ' + def.function.name);
} catch (err) {
  bad('加载工具失败：' + err.message);
}

if (failed) {
  console.error('\n自检失败：' + failed + ' 项');
  process.exitCode = 1;
} else {
  console.log('\n自检通过 ✓');
}
