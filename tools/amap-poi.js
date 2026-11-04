'use strict';

/**
 * search_poi：查城市真实景点 / 餐厅 / 酒店（高德开放平台 POI 搜索）。
 * 设计意图：给大模型提供真实地点约束，降低「编造景点」的幻觉（论文防幻觉素材）。
 */

const { searchPoi } = require('./_amap');

const def = {
  type: 'function',
  function: {
    name: 'search_poi',
    description:
      '查询指定城市的真实景点 / 餐厅 / 酒店（高德开放平台 POI）。排行程前先用它拿到真实地点，不要凭空编造景点。',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'string', description: '要查的地点或关键词，如「宽窄巷子」「熊猫基地」「火锅」' },
        city: { type: 'string', description: '城市名，如「成都」' },
        limit: { type: 'number', description: '返回条数，默认 8，最多 15' },
      },
      required: ['keywords', 'city'],
    },
  },
};

async function run(args) {
  return await searchPoi({
    keywords: String(args.keywords || ''),
    city: String(args.city || ''),
    limit: args.limit,
  });
}

module.exports = { def, run };
