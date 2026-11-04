'use strict';

/**
 * get_weather：查城市未来几天天气（高德开放平台天气接口）。
 * 设计意图：让行程生成考虑天气约束（下雨 / 高温调整户外安排）。
 */

const { getWeather } = require('./_amap');

const def = {
  type: 'function',
  function: {
    name: 'get_weather',
    description:
      '查询城市未来几天天气（高德开放平台天气接口）。排户外行程前先查天气，遇到下雨 / 高温要调整安排。',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名，如「成都」' },
        days: { type: 'number', description: '预报天数，默认 3，最多 7' },
      },
      required: ['city'],
    },
  },
};

async function run(args) {
  return await getWeather({
    city: String(args.city || ''),
    days: args.days,
  });
}

module.exports = { def, run };
