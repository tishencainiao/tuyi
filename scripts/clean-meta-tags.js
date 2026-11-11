'use strict';

/**
 * clean-meta-tags：存量标签清洗（v3.6.0，拍板 P7）
 *
 * 扫全部用户的记忆文件，把 memories[].tags 与 insights.tags 里的
 * 「元操作标签」（记忆修改/删除记忆/行程管理…）删掉；事实文本不动。
 * 先整目录备份到 backups/data-meta-tags-<时间戳>/ 再改。
 *
 * 用法：node scripts/clean-meta-tags.js [--apply] [--dry-run]
 *   --dry-run（默认）：只报告每个文件要删什么，不改文件
 *   --apply：备份后实际清洗
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(ROOT, 'data', 'memory');
const BACKUP_ROOT = path.join(ROOT, 'backups');
const { cleanTags, isMetaTag } = require('../brain/meta-tags');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function stamp() {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  return (
    now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
  );
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log('[clean] 没有数据目录：' + DATA_DIR);
    return 0;
  }
  const files = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.json'));
  if (!files.length) {
    console.log('[clean] 没有记忆文件');
    return 0;
  }

  let totalTags = 0;
  let touchedFiles = 0;
  const plans = [];

  for (const name of files) {
    const full = path.join(DATA_DIR, name);
    const record = JSON.parse(fs.readFileSync(full, 'utf8'));
    const removed = [];
    for (const memory of record.memories || []) {
      if (!Array.isArray(memory.tags)) continue;
      const kept = cleanTags(memory.tags, 4);
      const dropped = memory.tags.filter((tag) => isMetaTag(String(tag)));
      if (dropped.length) removed.push({ where: 'memory ' + memory.id, dropped });
      memory.tags = kept;
    }
    if (record.insights && Array.isArray(record.insights.tags)) {
      const dropped = record.insights.tags.filter((tag) => isMetaTag(String(tag)));
      if (dropped.length) removed.push({ where: 'insights.tags', dropped });
      record.insights.tags = cleanTags(record.insights.tags, 8);
    }
    const count = removed.reduce((sum, item) => sum + item.dropped.length, 0);
    if (!count) continue;
    totalTags += count;
    touchedFiles += 1;
    plans.push({ name, removed, count });
  }

  if (!totalTags) {
    console.log('[clean] 没有发现元操作标签，数据干净 ✓');
    return 0;
  }
  console.log('[clean] 共 %d 个文件有脏标签、%d 个标签待删：', touchedFiles, totalTags);
  for (const plan of plans) {
    console.log('  ' + plan.name);
    for (const item of plan.removed) {
      console.log('    - ' + item.where + '：' + item.dropped.join('、'));
    }
  }
  if (!apply) {
    console.log('[clean] 预览模式（--dry-run）。确认无误后加 --apply 实际清洗。');
    return 0;
  }

  const backupDir = path.join(BACKUP_ROOT, 'data-meta-tags-' + stamp());
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of files) {
    fs.copyFileSync(path.join(DATA_DIR, name), path.join(backupDir, name));
  }
  console.log('[clean] 已备份全部文件到 ' + backupDir);

  for (const plan of plans) {
    const full = path.join(DATA_DIR, plan.name);
    const record = JSON.parse(fs.readFileSync(full, 'utf8'));
    for (const memory of record.memories || []) {
      if (Array.isArray(memory.tags)) memory.tags = cleanTags(memory.tags, 4);
    }
    if (record.insights && Array.isArray(record.insights.tags)) {
      record.insights.tags = cleanTags(record.insights.tags, 8);
    }
    fs.writeFileSync(full, JSON.stringify(record, null, 2), 'utf8');
    console.log('[clean] 已清洗 ' + plan.name);
  }
  console.log('[clean] 完成：删除 %d 个元操作标签，涉及 %d 个文件', totalTags, touchedFiles);
  return 0;
}

process.exitCode = main();
