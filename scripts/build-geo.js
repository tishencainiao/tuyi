'use strict';

/**
 * 生成地图用的 GeoJSON（一次性脚本）：
 *   node scripts/build-geo.js
 *
 * 数据来源：DataV GeoAtlas（https://geo.datav.aliyun.com/areas_v3/bound/）
 * 输出：
 *   web/vendor/geo/china-provinces.json  —— 省级（34 个省级行政区）
 *   web/vendor/geo/china-cities.json     —— 市级（直辖市的区合并为市级，避免「北京」点亮不了）
 *
 * 说明：网络可能不稳定，脚本对每个文件做 4 次重试；生成的文件已提交到仓库，运行时不再联网。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'web', 'vendor', 'geo');
const COUNTRY_FILE = path.join(DIR, 'china-provinces.json');
const CITIES_FILE = path.join(DIR, 'china-cities.json');
const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound/';

const MUNICIPALITIES = new Set([
  '北京市',
  '上海市',
  '天津市',
  '重庆市',
  '香港特别行政区',
  '澳门特别行政区',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJSON(url, retries = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (err) {
      lastError = err;
      console.log('[geo] 第 ' + attempt + ' 次失败：' + (err && err.message ? err.message : err));
      await sleep(2000);
    }
  }
  throw lastError;
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });

  let country;
  if (fs.existsSync(COUNTRY_FILE)) {
    country = JSON.parse(fs.readFileSync(COUNTRY_FILE, 'utf8'));
    console.log('[geo] 复用已有 china-provinces.json');
  } else {
    country = await fetchJSON(BASE + '100000_full.json');
    fs.writeFileSync(COUNTRY_FILE, JSON.stringify(country));
    console.log('[geo] 已下载省级 GeoJSON');
  }

  const provinces = (country.features || []).map((feature) => ({
    adcode: feature.properties.adcode,
    name: feature.properties.name,
    feature,
  }));
  console.log('[geo] 省级数量：' + provinces.length);

  const cityFeatures = [];
  for (const province of provinces) {
    if (MUNICIPALITIES.has(province.name)) {
      const cloned = JSON.parse(JSON.stringify(province.feature));
      cloned.properties.province = province.name;
      cloned.properties.provinceAdcode = province.adcode;
      cityFeatures.push(cloned);
      console.log('[geo] ' + province.name + '（直辖市/特区，按省级点收录）');
      continue;
    }
    try {
      const data = await fetchJSON(BASE + province.adcode + '_full.json');
      const features = data.features || [];
      for (const feature of features) {
        if (!feature.properties) feature.properties = {};
        feature.properties.province = province.name;
        feature.properties.provinceAdcode = province.adcode;
      }
      cityFeatures.push(...features);
      console.log('[geo] ' + province.name + '：' + features.length + ' 个市级要素');
    } catch (err) {
      console.log('[geo] ' + province.name + ' 跳过：' + (err && err.message ? err.message : err));
    }
  }

  fs.writeFileSync(CITIES_FILE, JSON.stringify({ type: 'FeatureCollection', features: cityFeatures }));
  const sizeKB = Math.round(fs.statSync(CITIES_FILE).size / 1024);
  console.log('[geo] 完成：市级要素 ' + cityFeatures.length + ' 个，china-cities.json ' + sizeKB + ' KB');
})();
