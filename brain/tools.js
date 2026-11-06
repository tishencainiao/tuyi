'use strict';

/**
 * 工具注册与分发。
 * 约定：tools/*.js 导出 { def, run }，def 为 OpenAI 工具定义，run(args) 返回可 JSON 序列化的对象。
 * 启动时自动加载整个 tools/ 目录——加一个文件就多一个能力（与 Momo 插件平台同一思路）。
 */

const fs = require('node:fs');
const path = require('node:path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const registry = new Map();

function register(def, run) {
  if (!def || !def.function || !def.function.name) throw new Error('工具定义缺少 function.name');
  registry.set(def.function.name, { def, run });
}

function defs() {
  return [...registry.values()].map((item) => item.def);
}

async function dispatch(name, args, context = {}) {
  const item = registry.get(name);
  if (!item) throw new Error('未知工具：' + name);
  let parsed = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error('工具 ' + name + ' 的参数不是合法 JSON');
    }
  }
  return await item.run(parsed || {}, context);
}

for (const file of fs.readdirSync(TOOLS_DIR)) {
  if (!file.endsWith('.js') || file.startsWith('_')) continue;
  const mod = require(path.join(TOOLS_DIR, file));
  if (mod && mod.def && typeof mod.run === 'function') register(mod.def, mod.run);
}

module.exports = { register, defs, dispatch };
