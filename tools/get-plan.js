'use strict';

/**
 * get_plan：读取当前用户的行程方案。
 * 不传 plan_id：列出最近 5 份方案摘要（供模型决定改哪份）；
 * 传 plan_id：返回该方案完整内容（含 days 明细、状态、previousDays）。
 * v3.1.0 连续修改的基础：模型必须先 get_plan 拿到 plan_id 再 plan_trip(mode:update)。
 */

const memory = require('../brain/memory');

const def = {
  type: 'function',
  function: {
    name: 'get_plan',
    description:
      '读取当前用户的行程方案。不传 plan_id 时列出最近几份方案（标题/目的地/状态/plan_id）；传 plan_id 时返回该方案完整内容（含每天明细）。修改已有方案前必须先调用本工具拿到 plan_id，再用 plan_trip(mode:"update") 修改。',
    parameters: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: '要读取完整内容的方案 id；不传则返回方案列表摘要',
        },
      },
    },
  },
};

function run(args, context) {
  const userId = context && context.userId;
  if (!userId) return { ok: false, error: '缺少用户上下文' };

  const planId = args && args.plan_id ? String(args.plan_id).trim() : '';
  if (planId) {
    const plan = memory.getPlan(userId, planId);
    if (!plan) return { ok: false, error: '找不到该行程方案（plan_id=' + planId + '）' };
    return {
      ok: true,
      plan: {
        plan_id: plan.id,
        title: plan.title,
        destination: plan.destination,
        status: plan.status,
        budget_cny: plan.budget_cny,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        revisions: plan.revisions || 0,
        days: plan.days || [],
        previousDays: plan.previousDays || [],
      },
    };
  }

  const plans = memory.listPlans(userId).slice(0, 5).map((item) => ({
    plan_id: item.id,
    title: item.title,
    destination: item.destination,
    status: item.status,
    days: (item.days || []).length,
    createdAt: item.createdAt,
  }));
  return {
    ok: true,
    plans,
    hint: '若用户要修改其中某份方案，用对应的 plan_id 调 plan_trip(mode:"update")，只重排尚未进行的日期；已过去的日期保持不变。',
  };
}

module.exports = { def, run };
