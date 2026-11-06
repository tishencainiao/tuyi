'use strict';

/**
 * 偏好统计（大数据元素）
 *
 * 扫描 data/memory/*.json，把用户记忆汇总成看板数据：
 * - 标签分布：memories.tags + insights.tags 计数
 * - 目的地分布：行程 destination + 记忆文本里出现的城市名
 * - 预算档位分布：从记忆文本里的金额 / 关键词规则分档
 * - 提问意图分布：对用户消息做规则分类（行程 / 景点 / 天气 / 预算 / 交通 / 其他）
 *
 * 说明：意图与预算用「规则」分类（轻量、可解释）；论文里可以替换成模型分类做对比实验。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data', 'memory');

const CITIES = [
  ...new Set([
    '北京', '上海', '广州', '深圳', '成都', '重庆', '杭州', '苏州', '南京', '西安', '武汉', '长沙',
    '厦门', '青岛', '昆明', '大理', '丽江', '三亚', '桂林', '哈尔滨', '沈阳', '大连', '天津', '济南',
    '郑州', '合肥', '福州', '南昌', '贵阳', '南宁', '兰州', '西宁', '银川', '乌鲁木齐', '拉萨',
    '呼和浩特', '石家庄', '太原', '长春', '无锡', '扬州', '绍兴', '嘉兴', '泉州', '佛山', '珠海',
    '惠州', '汕头', '北海', '张家界', '黄山', '九寨沟', '敦煌', '喀什', '伊犁', '呼伦贝尔', '洛阳',
    '开封', '景德镇', '婺源', '平遥', '大同', '秦皇岛', '烟台', '威海', '常州', '舟山', '湖州',
    '遵义', '安顺', '香格里拉', '西双版纳', '腾冲', '涠洲岛',
  ]),
];

const INTENTS = [
  { name: '行程规划', words: ['行程', '路线', '安排', '几天', '排个', '规划', '几日游'] },
  { name: '景点查询', words: ['景点', '好玩', '玩什么', '必去', '打卡', '门票', '开放时间', '有什么好逛'] },
  { name: '天气', words: ['天气', '下雨', '气温', '温度', '穿什么', '冷不冷', '热不热'] },
  { name: '预算', words: ['预算', '花多少钱', '费用', '多少钱', '省钱', '穷游'] },
  { name: '交通', words: ['高铁', '飞机', '机票', '火车', '交通', '怎么去', '打车', '地铁'] },
];

function classifyIntent(text) {
  const value = String(text || '');
  for (const intent of INTENTS) {
    if (intent.words.some((word) => value.includes(word))) return intent.name;
  }
  return '其他';
}

function budgetBucket(text) {
  const value = String(text || '');
  const amount = value.match(/(\d{3,6})\s*(?:元|块|rmb|RMB)/);
  if (amount) {
    const num = Number(amount[1]);
    if (num < 1500) return '经济（<1500）';
    if (num < 4000) return '中档（1500-4000）';
    if (num < 8000) return '舒适（4000-8000）';
    return '高端（>8000）';
  }
  if (/预算低|省钱|穷游|学生党/.test(value)) return '经济（<1500）';
  if (/预算中等|性价比/.test(value)) return '中档（1500-4000）';
  if (/预算高|舒适|不差钱/.test(value)) return '舒适（4000-8000）';
  return '未说明';
}

function collectRecords(dataDir = DATA_DIR) {
  const records = [];
  let names = [];
  try {
    names = fs.readdirSync(dataDir);
  } catch {
    return records;
  }
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
      if (record && record.userId) records.push(record);
    } catch {
      /* 跳过坏文件 */
    }
  }
  return records;
}

function toArray(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function computeStats(records = []) {
  const tagCount = new Map();
  const cityCount = new Map();
  const budgetCount = new Map();
  const intentCount = new Map();
  let memories = 0;
  let itineraries = 0;
  let digests = 0;

  for (const record of records) {
    memories += (record.memories || []).length;
    itineraries += (record.itineraries || []).length;
    if (record.insights && record.insights.summary) digests += 1;

    for (const item of record.memories || []) {
      for (const tag of item.tags || []) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      const bucket = budgetBucket(item.text);
      if (bucket !== '未说明') budgetCount.set(bucket, (budgetCount.get(bucket) || 0) + 1);
      const text = String(item.text || '');
      for (const city of CITIES) {
        if (text.includes(city)) cityCount.set(city, (cityCount.get(city) || 0) + 1);
      }
    }

    for (const tag of (record.insights && record.insights.tags) || []) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }

    for (const itinerary of record.itineraries || []) {
      const destination = String(itinerary.destination || '').trim();
      if (destination) cityCount.set(destination, (cityCount.get(destination) || 0) + 1);
    }

    for (const turn of record.turns || []) {
      if (turn.role !== 'user') continue;
      const intent = classifyIntent(turn.text);
      intentCount.set(intent, (intentCount.get(intent) || 0) + 1);
    }
  }

  const intentSamples = [...intentCount.values()].reduce((sum, value) => sum + value, 0);

  return {
    totals: {
      users: records.length,
      memories,
      itineraries,
      digests,
      intents: intentSamples,
    },
    tagDistribution: toArray(tagCount, 12),
    cityDistribution: toArray(cityCount, 10),
    budgetDistribution: [...budgetCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value })),
    intentDistribution: [...intentCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value })),
  };
}

function normalizeCity(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  const matched = CITIES.find((city) => value.includes(city));
  if (matched) return matched;
  return value.replace(/(省|市|自治区|特别行政区|地区)$/g, '').trim();
}

function computePersonalStats(record) {
  const itineraries = Array.isArray(record.itineraries) ? record.itineraries : [];
  const cityMap = new Map();
  const tagCount = new Map();

  for (const item of record.memories || []) {
    for (const tag of item.tags || []) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  }
  for (const tag of (record.insights && record.insights.tags) || []) {
    tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  }

  for (const itinerary of itineraries) {
    const city = normalizeCity(itinerary.destination);
    if (!city) continue;
    const ts = String(itinerary.ts || '');
    const days = (itinerary.days || []).length || 0;
    const entry = cityMap.get(city) || { city, count: 0, days: 0, firstVisit: ts, lastVisit: ts };
    entry.count += 1;
    entry.days += days;
    if (ts && (!entry.firstVisit || ts < entry.firstVisit)) entry.firstVisit = ts;
    if (ts && (!entry.lastVisit || ts > entry.lastVisit)) entry.lastVisit = ts;
    cityMap.set(city, entry);
  }

  const cities = [...cityMap.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  const budgets = itineraries.map((item) => Number(item.budget_cny) || 0).filter((value) => value > 0);
  const totalBudget = budgets.reduce((sum, value) => sum + value, 0);
  const totalDays = itineraries.reduce((sum, item) => sum + ((item.days || []).length || 0), 0);

  return {
    tripCount: itineraries.length,
    cityCount: cities.length,
    totalDays,
    totalBudget,
    avgBudget: budgets.length ? Math.round(totalBudget / budgets.length) : 0,
    cities,
    tags: toArray(tagCount, 10),
    memories: (record.memories || []).length,
    turnsCount: (record.turns || []).length,
    hasInsights: Boolean(record.insights && record.insights.summary),
    recentTrips: itineraries.slice(-5).reverse().map((item) => ({
      ts: item.ts || '',
      title: item.title || '',
      destination: item.destination || '',
      days: (item.days || []).length,
      budget_cny: Number(item.budget_cny) || 0,
    })),
  };
}

module.exports = {
  DATA_DIR,
  CITIES,
  INTENTS,
  classifyIntent,
  budgetBucket,
  normalizeCity,
  computeStats,
  computePersonalStats,
  collectRecords,
};
