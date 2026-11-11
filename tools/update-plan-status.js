'use strict';

/**
 * update_plan_status：更新行程方案的状态。
 * draft（草稿）→ confirmed（确认）→ in_progress（出发）→ completed（结束）。
 * v3.5.0：状态可以回退（用户说「撤销确认/我没去/改回草稿」等）。
 * 用户说「出发了/开始旅行」→ in_progress；「旅行结束/回来了」→ completed；
 * 「就按这个方案/确认」→ confirmed；「撤销/不算/没去」→ draft 或前一个状态。
 * 地图点亮、足迹统计只认非 draft 状态。
 */

const memory = require('../brain/memory');

const def = {
  type: 'function',
  function: {
    name: 'update_plan_status',
    description:
      '更新一份行程方案的状态。用户确认方案后置为 confirmed，出发后置为 in_progress，旅行结束后置为 completed。也可以回退：撤销确认改回 draft、旅行取消改回 draft 等。只有被确认（confirmed）及之后的方案才算数（计入去过的城市、点亮地图）。',
    parameters: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: '要更新状态的方案 id（先用 get_plan 拿到）',
        },
        status: {
          type: 'string',
          enum: ['draft', 'confirmed', 'in_progress', 'completed'],
          description: '目标状态：draft=草稿（回退）/ confirmed=已确认 / in_progress=进行中 / completed=已完成',
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
    draft: '草稿（已撤销，不再计入去过的城市）',
    confirmed: '已确认（已计入去过的城市）',
    in_progress: '进行中',
    completed: '已完成',
  };
  return {
    ok: true,
    plan: result.itinerary,
    note:
      '状态已更新为 ' + label[status] + '。' +
      (status === 'confirmed' ? '目的地城市已点亮到用户的地图上。' : '') +
      (status === 'draft' ? '该行程不再计入统计，地图上的点亮也已移除。' : ''),
  };
}

module.exports = { def, run };
