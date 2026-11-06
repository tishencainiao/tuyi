'use strict';

/**
 * memory_edit：让用户通过对话修改/删除/新增自己的记忆（v1.2.0）
 *
 * 安全边界：只操作「当前登录用户」的记忆（userId 来自 session，经 dispatch 的 context 传入）；
 * insights（消化产物）不在这里改，避免误伤。
 */

const memory = require('../brain/memory');

const def = {
  type: 'function',
  function: {
    name: 'memory_edit',
    description:
      '修改当前用户自己的记忆：add 新增一条关于用户的事实；update 按 id 或内容片段修改；remove 按 id 或内容片段删除。用户明确要求「记住 / 改掉 / 删掉」时调用。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'update', 'remove'], description: '操作类型' },
        id: { type: 'string', description: '记忆 id（update / remove 优先用）' },
        match: { type: 'string', description: '没有 id 时，按内容片段定位（唯一命中才生效）' },
        text: { type: 'string', description: 'add / update 时的记忆内容' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      },
      required: ['action'],
    },
  },
};

function resolveId(userId, args) {
  if (args.id) return { id: String(args.id) };
  const match = String(args.match || '').trim();
  if (!match) return { error: 'update / remove 需要 id 或 match' };
  const found = memory.findMemories(userId, match);
  if (found.length === 1) return { id: found[0].id };
  if (!found.length) return { error: '没有找到匹配「' + match + '」的记忆' };
  return {
    error:
      '匹配到多条记忆，请让用户确认具体是哪条：' +
      found.map((item) => item.id + '（' + item.text + '）').join('；'),
  };
}

async function run(args, context = {}) {
  const userId = context.userId;
  if (!userId) return { ok: false, error: '缺少用户上下文：只能在登录后修改记忆' };

  const action = String(args.action || '');
  if (action === 'add') {
    const text = String(args.text || '').trim();
    if (!text) return { ok: false, error: 'add 需要 text' };
    const result = memory.addMemory(userId, text, Array.isArray(args.tags) ? args.tags : []);
    return result.ok ? { ok: true, message: '已记下：' + text } : result;
  }

  if (action === 'remove') {
    if (args.id) return memory.removeMemory(userId, String(args.id));
    const match = String(args.match || '').trim();
    if (!match) return { ok: false, error: 'remove 需要 id 或 match' };
    const found = memory.findMemories(userId, match);
    if (!found.length) return { ok: false, error: '没有找到匹配「' + match + '」的记忆' };
    let removed = 0;
    for (const item of found) {
      if (memory.removeMemory(userId, item.id).ok) removed += 1;
    }
    return { ok: true, message: '已删除 ' + removed + ' 条记忆' };
  }

  return { ok: false, error: '未知 action：' + action };
}

module.exports = { def, run };
