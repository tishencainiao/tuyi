'use strict';

/**
 * 元操作标签黑名单（v3.6.0，拍板 P7）
 *
 * 历史抽取/消化/工具调用会把「记忆修改」「删除记忆」「行程管理」这类
 * 操作词当成偏好标签存进 memories.tags / insights.tags，污染个人统计的
 * 「偏好标签」图表。这里统一定义黑名单，源头过滤（addFacts / updateMemory /
 * memory_edit）+ 图表聚合（computePersonalStats）+ 存量清洗（scripts/clean-meta-tags.js）
 * 三处共用。
 *
 * 匹配规则：标签去空白后，等于任一词 或 包含任一「包含匹配」词 → 判为元操作标签。
 */

const META_TAG_EXACT = [
  '记忆',
  '记忆管理',
  '记忆修改',
  '修改记忆',
  '删除记忆',
  '记忆删除',
  '记忆整理',
  '整理记忆',
  '系统',
  '系统操作',
  '用户指令',
  '元操作',
  '操作',
  '管理',
  '设置',
  '任务',
];

const META_TAG_CONTAINS = [
  '记忆修改',
  '修改记忆',
  '删除记忆',
  '记忆删除',
  '记忆管理',
  '管理记忆',
  '记忆整理',
  '整理记忆',
  '行程修改',
  '修改行程',
  '行程管理',
  '行程删除',
  '删除行程',
  '系统',
  '用户指令',
];

function isMetaTag(tag) {
  const clean = String(tag || '').replace(/\s/g, '');
  if (!clean) return true;
  if (META_TAG_EXACT.includes(clean)) return true;
  return META_TAG_CONTAINS.some((word) => clean.includes(word));
}

/**
 * 过滤标签数组：去空白、去空、去重、去元操作标签，最多保留 max 个。
 */
function cleanTags(tags, max = 4) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const tag of tags) {
    const clean = String(tag).trim();
    if (!clean || seen.has(clean) || isMetaTag(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { META_TAG_EXACT, META_TAG_CONTAINS, isMetaTag, cleanTags };
