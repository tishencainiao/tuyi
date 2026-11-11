'use strict';

/**
 * 高德开放平台（Web 服务）公共封装：POI 搜索 / 地理编码 / 天气。
 * 约定：所有函数返回 { ok, ... } 结构；缺 Key 或网络失败时返回 { ok:false, error }。
 */

const BASE = 'https://restapi.amap.com';
const TIMEOUT_MS = 8000;

function hasKey() {
  return Boolean(process.env.AMAP_KEY);
}

async function getJSON(path, params = {}) {
  if (!hasKey()) {
    return { ok: false, error: '缺少 AMAP_KEY：请在 .env 里填写高德「Web服务」类型的 Key' };
  }
  const url = new URL(BASE + path);
  url.searchParams.set('key', process.env.AMAP_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  let resp;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    return { ok: false, error: '高德接口请求失败（网络或超时）：' + (err && err.message ? err.message : err) };
  }
  if (!resp.ok) return { ok: false, error: '高德接口 HTTP ' + resp.status };
  let data;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: '高德接口返回不是合法 JSON' };
  }
  if (String(data.status) !== '1') {
    return {
      ok: false,
      error: '高德接口返回错误：' + (data.info || '未知错误') + '（infocode ' + (data.infocode || '?') + '）',
    };
  }
  return { ok: true, data };
}

function parseLocation(location) {
  if (typeof location !== 'string' || !location.includes(',')) return null;
  const [lng, lat] = location.split(',').map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function formatPoi(raw) {
  const poi = raw || {};
  const biz = poi.biz_ext || {};
  const cost = Number(biz.cost) || 0;
  const typeText = String(poi.type || '');
  // 高德 biz_ext.cost 只有门票 / 人均类 POI 有值，酒店普遍没有
  const noPrice = !cost && /酒店|宾馆|住宿|民宿|旅店/.test(typeText);
  return {
    name: String(poi.name || ''),
    address: String(poi.address || ''),
    type: typeText,
    location: parseLocation(poi.location),
    tel: String(poi.tel || ''),
    rating: Number(biz.rating) || 0,
    cost,
    // 无公开价格时给模型一个可直接引用的提示，避免说出「接口没返回房价」这类技术话
    price_note: noPrice ? '暂无公开价格，价格以携程 / 美团实时价为准' : '',
  };
}

function formatWeatherDay(cast) {
  const day = cast || {};
  return {
    date: String(day.date || ''),
    week: String(day.week || ''),
    day: String(day.dayweather || ''),
    night: String(day.nightweather || ''),
    dayTemp: Number(day.daytemp) || 0,
    nightTemp: Number(day.nighttemp) || 0,
    wind: String(day.daywind || '') + String(day.daypower || ''),
  };
}

async function resolveCity(city) {
  const res = await getJSON('/v3/geocode/geo', { address: city });
  if (!res.ok) return res;
  const geo = (res.data.geocodes || [])[0];
  if (!geo || !geo.adcode) return { ok: false, error: '找不到城市：' + city };
  return { ok: true, adcode: String(geo.adcode), name: String(geo.city || city) };
}

async function searchPoi({ keywords, city, limit = 8 }) {
  if (!keywords || !city) return { ok: false, error: 'search_poi 需要 keywords 和 city' };
  const count = Math.min(Math.max(Number(limit) || 8, 1), 15);
  const res = await getJSON('/v3/place/text', {
    keywords,
    city,
    offset: count,
    page: 1,
    extensions: 'all',
  });
  if (!res.ok) return res;
  const pois = (res.data.pois || []).map(formatPoi).filter((poi) => poi.name);
  return { ok: true, city, keywords, count: pois.length, pois };
}

async function getWeather({ city, days = 3 }) {
  if (!city) return { ok: false, error: 'get_weather 需要 city' };
  const cityRes = await resolveCity(city);
  if (!cityRes.ok) return cityRes;
  const res = await getJSON('/v3/weather/weatherInfo', {
    city: cityRes.adcode,
    extensions: 'all',
  });
  if (!res.ok) return res;
  const forecast = (res.data.forecasts || [])[0];
  if (!forecast) return { ok: false, error: '高德没有返回该城市的天气预报（可能暂不支持）' };
  const count = Math.min(Math.max(Number(days) || 3, 1), 7);
  const casts = (forecast.casts || []).slice(0, count).map(formatWeatherDay);
  return { ok: true, city: String(forecast.city || city), adcode: cityRes.adcode, casts };
}

module.exports = {
  BASE,
  hasKey,
  getJSON,
  parseLocation,
  formatPoi,
  formatWeatherDay,
  resolveCity,
  searchPoi,
  getWeather,
};
