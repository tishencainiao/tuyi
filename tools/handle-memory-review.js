'use strict';

/**
 * handle_memory_review：执行「待处理的记忆整理建议」（v3.6.0）
 *
 * 记忆消化（py/digest.py）会产出合并建议（merges）与冲突提醒（conflicts），
 * 写进 data/memory/<user>.json 的 memoryReview（state=pending）。
 * 小忆在聊天里主动向用户汇报并征得同意后，用本工具执行，绝不擅自改记忆。
 *
 * decision：
 *   apply_merge  按合并建议把多条记忆合并成一条
 *   keep_first   冲突二选一，保留第一条
 *   keep_second  冲突二选一，保留第二条
 *   dismiss      忽略这条建议（不改任何数据）
 * index：合并建议与冲突提醒分开编号（从 0 开始），工具按 decision 判断属于哪组。
 */

const memory = require('../brain/memory');

const def = {
  type: 'function',
  function: {
    name: 'handle_memory_review',
    description:
      '执行记忆整理建议（用户已明确同意）：apply_merge 合并、keep_first/keep_second 冲突二选一、dismiss 忽略。只处理用户确认的那一条，不要擅自批量执行。',
    parameters: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['apply_merge', 'keep_first', 'keep_second', 'dismiss'],
          description: '用户对这条建议的决定',
        },
        index: { type: 'integer', description: '建议序号（合并与冲突分开编号，从 0 开始）' },
      },
      required: ['decision', 'index'],
    },
  },
};

async function run(args, context = {}) {
  const userId = context.userId;
  if (!userId) return { ok: false, error: '缺少用户上下文：只能在登录后整理记忆' };
  const result = memory.applyMemoryReview(userId, String(args.decision || ''), Number(args.index) || 0);
  if (!result.ok) return result;
  if (result.decision === 'dismiss') {
    return { ok: true, message: '已忽略这条整理建议（剩余 ' + result.remaining + ' 条）' };
  }
  const changed = result.applied.join('；');
  return {
    ok: true,
    message:
      '已按用户决定处理（' + result.decision + '）：' + (changed || '无变化') +
      '（剩余 ' + result.remaining + ' 条整理建议）',
  };
}

module.exports = { def, run };
