'use strict';

/**
 * 生成演示数据（写入本地 data/memory，不进版本库）：
 *   node scripts/seed-demo.js
 *
 * 用途：看板 / 个人中心在没有真实对话数据时也能展示；
 * 答辩前也可以先跑一遍，让图表“有东西可看”（数据是虚构的演示数据，论文里要注明）。
 */

const memory = require('../brain/memory');

function daysOf(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: '第 ' + (index + 1) + ' 天',
    title: '',
    items: [],
  }));
}

const USERS = [
  {
    id: 'demo-lin',
    insights: {
      tags: ['带父母', '慢节奏', '预算中等', '自然风光'],
      summary: '常带父母出行，偏好慢节奏、预算中等、亲近自然的路线。',
      confidence: 'high',
    },
    facts: [
      ['带爸妈去成都玩了三天，预算中等，怕累', ['带父母', '预算中等', '慢节奏']],
      ['喜欢自然风光，不爱爬太多山', ['自然风光']],
      ['想国庆去云南，预算 5000 元', ['自然风光', '云南']],
    ],
    itineraries: [{ destination: '成都', title: '成都三天两晚', budget_cny: 3200, days: daysOf(3) }],
    turns: ['帮我排一个带爸妈去成都的三天行程', '宽窄巷子门票多少钱', '成都这几天天气怎么样', '预算 3000 元够吗'],
  },
  {
    id: 'demo-zhou',
    insights: {
      tags: ['独自旅行', '摄影', '预算低', '城市漫步'],
      summary: '喜欢一个人走走拍拍，预算不高，偏爱城市漫步和有故事的老街。',
      confidence: 'medium',
    },
    facts: [
      ['一个人去西安，预算 1500 元，主要想拍照', ['独自旅行', '摄影', '预算低']],
      ['喜欢逛老城区和夜市', ['城市漫步']],
    ],
    itineraries: [{ destination: '西安', title: '西安四天摄影线', budget_cny: 1500, days: daysOf(4) }],
    turns: ['从郑州坐高铁去西安方便吗', '西安有没有适合扫街的老城区', '帮我排个四天行程', '青旅大概多少钱一晚'],
  },
  {
    id: 'demo-wang',
    insights: {
      tags: ['情侣', '美食', '预算中等', '海岛'],
      summary: '和女朋友出行，预算中等，喜欢海边和当地美食。',
      confidence: 'medium',
    },
    facts: [
      ['和女朋友去厦门，预算中等，想住海边', ['情侣', '预算中等', '海岛']],
      ['每到一个城市都要找当地小吃', ['美食']],
    ],
    itineraries: [{ destination: '厦门', title: '厦门四天三晚', budget_cny: 4000, days: daysOf(4) }],
    turns: ['厦门有什么必吃的本地小吃', '帮我排个海边度假的行程', '鼓浪屿要提前订船票吗'],
  },
  {
    id: 'demo-chen',
    insights: {
      tags: ['亲子', '自然风光', '预算高', '舒适'],
      summary: '带孩子出行，重视舒适度和自然体验，预算充足。',
      confidence: 'high',
    },
    facts: [
      ['带孩子去三亚，预算高一点没关系，要舒适', ['亲子', '预算高', '舒适']],
      ['孩子喜欢看海和动物', ['自然风光']],
    ],
    itineraries: [{ destination: '三亚', title: '三亚亲子五天', budget_cny: 9000, days: daysOf(5) }],
    turns: ['三亚带孩子住哪个区域方便', '帮我排个五天的亲子行程', '天气怎么样，会不会太晒'],
  },
  {
    id: 'demo-zhao',
    insights: {
      tags: ['毕业旅行', '穷游', '交通', '人文'],
      summary: '毕业旅行，预算紧，偏好公共交通和人文景点。',
      confidence: 'medium',
    },
    facts: [
      ['毕业旅行想穷游，预算低，坐火车', ['毕业旅行', '穷游', '预算低']],
      ['喜欢博物馆和历史建筑', ['人文']],
    ],
    itineraries: [{ destination: '重庆', title: '重庆穷游三天', budget_cny: 1200, days: daysOf(3) }],
    turns: ['重庆从成都过去坐什么车便宜', '有没有免费的景点推荐', '帮我排个三天穷游行程'],
  },
  {
    id: 'demo-sun',
    insights: {
      tags: ['周末短途', '人文', '预算中等', '慢节奏'],
      summary: '周末短途为主，喜欢园林和人文街区，节奏放松。',
      confidence: 'medium',
    },
    facts: [
      ['周末想短途旅行，预算中等，喜欢园林', ['周末短途', '预算中等', '人文']],
      ['不爱早起，想慢节奏', ['慢节奏']],
    ],
    itineraries: [{ destination: '苏州', title: '苏州周末两日', budget_cny: 1800, days: daysOf(2) }],
    turns: ['苏州周末两天怎么安排', '拙政园门票多少钱', '上海过去坐高铁方便吗'],
  },
];

for (const user of USERS) {
  const record = memory.emptyRecord(user.id);
  for (const [text, tags] of user.facts) {
    memory.addFacts(record, [{ text, tags }]);
  }
  record.insights = Object.assign({ updated: new Date().toISOString(), sourceCount: user.facts.length }, user.insights);
  record.state.lastDigestAt = new Date().toISOString();
  record.state.memoriesSinceDigest = 0;
  for (const turn of user.turns) {
    memory.appendTurn(record, 'user', turn);
    memory.appendTurn(record, 'assistant', '（演示数据：这里是小忆的回复）');
  }
  for (const itinerary of user.itineraries) {
    memory.appendItinerary(record, itinerary);
  }
  memory.save(record);
  console.log('[seed] ' + user.id + ' 已写入');
}

console.log('[seed] 完成，共 ' + USERS.length + ' 个演示用户');
