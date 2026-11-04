'use strict';

/**
 * plan_trip：把模型产出的行程整理成结构化 JSON 并做一致性校验。
 * 设计意图（论文「防幻觉」章节素材）：让模型把行程落到固定 schema，
 * 缺时间 / 地点 / 活动的项会被标记 warning，前端只渲染结构化数据，
 * 避免大段自由文本无法核对。
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const def = {
  type: 'function',
  function: {
    name: 'plan_trip',
    description:
      '把一份完整旅游行程整理成结构化 JSON 并校验（每天含时间、地点、活动、交通、花费）。当用户需要完整行程时调用本工具，不要只在聊天里写文字。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '行程标题，如「成都三天两晚」' },
        destination: { type: 'string', description: '目的地城市' },
        budget_cny: { type: 'number', description: '全程预算估算（人民币）' },
        days: {
          type: 'array',
          description: '按天排列的行程',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: '日期或「第 N 天」' },
              title: { type: 'string', description: '当天的主题，如「熊猫基地 + 宽窄巷子」' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    time: { type: 'string', description: '时间，HH:MM 格式' },
                    place: { type: 'string', description: '地点或景点' },
                    activity: { type: 'string', description: '活动内容' },
                    transport: { type: 'string', description: '交通方式，如「地铁 1 号线」' },
                    cost_cny: { type: 'number', description: '该项花费（人民币）' },
                  },
                  required: ['time', 'place', 'activity'],
                },
              },
            },
            required: ['date', 'items'],
          },
        },
      },
      required: ['destination', 'days'],
    },
  },
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function run(args) {
  const warnings = [];
  const destination = String(args.destination || '').trim();
  if (!destination) return { ok: false, error: 'destination 不能为空' };
  if (!Array.isArray(args.days) || args.days.length === 0) {
    return { ok: false, error: 'days 不能为空' };
  }

  const days = [];
  args.days.forEach((rawDay, dayIndex) => {
    const day = rawDay || {};
    const items = Array.isArray(day.items) ? day.items : [];
    if (items.length === 0) warnings.push('第 ' + (dayIndex + 1) + ' 天没有安排任何活动');

    let previousTime = '';
    const cleanItems = items.map((rawItem, itemIndex) => {
      const item = rawItem || {};
      const itemLabel = '第 ' + (dayIndex + 1) + ' 天第 ' + (itemIndex + 1) + ' 项';
      const time = String(item.time || '');
      if (!TIME_RE.test(time)) warnings.push(itemLabel + '时间缺失或不是 HH:MM 格式');
      if (!item.place) warnings.push(itemLabel + '缺少地点');
      if (!item.activity) warnings.push(itemLabel + '缺少活动');
      if (time && previousTime && time < previousTime) {
        warnings.push(itemLabel + '时间早于上一项（' + previousTime + ' → ' + time + '），顺序可能有问题');
      }
      if (time) previousTime = time;
      return {
        time,
        place: String(item.place || ''),
        activity: String(item.activity || ''),
        transport: String(item.transport || ''),
        cost_cny: toNumber(item.cost_cny),
      };
    });

    days.push({
      date: String(day.date || '第 ' + (dayIndex + 1) + ' 天'),
      title: String(day.title || ''),
      items: cleanItems,
    });
  });

  const totalCost = days.reduce(
    (sum, day) => sum + day.items.reduce((acc, item) => acc + item.cost_cny, 0),
    0,
  );

  const itinerary = {
    title: String(args.title || destination + '行程'),
    destination,
    budget_cny: toNumber(args.budget_cny) || Math.round(totalCost),
    days,
  };

  return { ok: true, itinerary, warnings };
}

module.exports = { def, run };
