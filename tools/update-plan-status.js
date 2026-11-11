'use strict';

/**
 * update_plan_status：把行程方案在状态机里推进。
 * draft → confirmed（用户确认行程）→ in_progress（出发）→ completed（结束）。
 * 用户说「出发了/开始旅行」→ in_progress；「旅行结束/回来了」→ completed；
 * 「就按这个方案/确认」→ confirmed。地图点亮、足迹统计只认非 draft 状态。
 */

const memory = require('../brain/memory');

const def = {
  type: 'function',
  function: {
    name: 'update_plan_status',
    description:
      '更新一份行程方案的状态。用户确认方案后置为 confirmed，出发后置为 in_progress，旅行结束后置为 completed。只有被确认（confirmed）及之后的方案才算数（计入去过的城市、点亮地图）。',
    parameters: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: '要更新状态的方案 id（先用 get_plan 拿到）',
        },
        status: {
          type: 'string',
          enum: ['confirmed', 'in_progress', 'completed'],
          description: '目标状态：confirmed=已确认 / in_progress=进行中 / completed=已完成',
        },
      },
      required: ['plan_id', 'status'],
    },
  },
};

function run(args, context) {
  const userId = context && context.userId;
  if (!userId) return { ok: false, error: '缺少用户上下文' };

  const planId = String(args.plan_id || '').trim();
  const status = String(args.status || '').trim();
  if (!planId) return { ok: false, error: '缺少 plan_id' };

  const result = memory.setItineraryStatus(userId, planId, status);
  if (!result.ok) return result;

  const label = {
    confirmed: '已确认（已计入去过的城市）',
    in_progress: '进行中',
    completed: '已完成',
  };
  return {
    ok: true,
    plan: result.itinerary,
    note: '状态已更新为 ' + label[status] + '。' + (status === 'confirmed' ? '目的地城市已点亮到用户的地图上。' : ''),
  };
}

module.exports = { def, run };
