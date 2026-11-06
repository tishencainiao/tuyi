(function () {
  'use strict';

  const personalKpisEl = document.getElementById('personal-kpis');
  const kpisEl = document.getElementById('kpis');
  const personalHintEl = document.getElementById('personal-hint');
  const hintEl = document.getElementById('empty-hint');
  const tabsEl = document.getElementById('view-tabs');
  const palette = ['#2563eb', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6'];
  let globalLoaded = false;
  let geoProvinces = null;
  let geoCities = null;
  let mapChart = null;
  let mapLevel = 'province';
  let personalCities = [];
  let manualVisits = [];

  function fmt(value) {
    return String(value == null ? 0 : value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderKpis(target, items) {
    target.innerHTML = '';
    items.forEach(function (item) {
      const div = el('div', 'kpi');
      div.appendChild(el('strong', null, fmt(item[1])));
      div.appendChild(el('span', null, item[0]));
      target.appendChild(div);
    });
  }

  function barChart(id, data, color) {
    const container = document.getElementById(id);
    if (!container || !window.echarts) return;
    const chart = window.echarts.init(container);
    chart.setOption({
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#8b94a6' },
        splitLine: { lineStyle: { color: '#eef1f6' } },
      },
      yAxis: {
        type: 'category',
        data: data.map((item) => item.label).reverse(),
        axisLabel: { color: '#404a5c' },
        axisTick: { show: false },
      },
      tooltip: { trigger: 'axis' },
      series: [
        {
          type: 'bar',
          data: data.map((item) => item.value).reverse(),
          itemStyle: { color: color, borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 18,
        },
      ],
    });
    window.addEventListener('resize', function () {
      chart.resize();
    });
  }

  function donutChart(id, data) {
    const container = document.getElementById(id);
    if (!container || !window.echarts) return;
    const chart = window.echarts.init(container);
    chart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c}（{d}%）' },
      legend: { bottom: 0, textStyle: { color: '#6b7280', fontSize: 12 } },
      color: palette,
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          label: { show: false },
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          data: data.map((item) => ({ name: item.label, value: item.value })),
        },
      ],
    });
    window.addEventListener('resize', function () {
      chart.resize();
    });
  }

  function fetchJSON(path) {
    return fetch(path).then(function (resp) {
      if (resp.status === 401) {
        location.href = '/login.html';
        throw new Error('未登录');
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    });
  }

  function renderCityTable(cities) {
    const wrap = document.getElementById('my-cities-table');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!cities.length) {
      wrap.appendChild(el('p', 'empty', '还没有行程记录：去聊天页排一份行程吧。'));
      return;
    }
    const table = el('table', 'data-table');
    const thead = el('thead');
    const headRow = el('tr');
    ['城市', '次数', '总天数', '首次', '最近'].forEach(function (label) {
      headRow.appendChild(el('th', null, label));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    cities.forEach(function (city) {
      const row = el('tr');
      row.appendChild(el('td', null, city.city));
      row.appendChild(el('td', null, city.count));
      row.appendChild(el('td', null, city.days));
      row.appendChild(el('td', null, city.firstVisit ? city.firstVisit.slice(0, 10) : '—'));
      row.appendChild(el('td', null, city.lastVisit ? city.lastVisit.slice(0, 10) : '—'));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderPersonal(data) {
    personalCities = data.cities || [];
    renderKpis(personalKpisEl, [
      ['去过城市', data.cityCount || 0],
      ['旅行次数', data.tripCount || 0],
      ['总天数', data.totalDays || 0],
      ['平均预算', data.avgBudget ? '¥' + fmt(data.avgBudget) : '—'],
      ['记忆条数', data.memories || 0],
    ]);
    renderCityTable(data.cities || []);
    barChart('chart-my-cities', (data.cities || []).map((item) => ({ label: item.city, value: item.count })), '#2563eb');
    barChart('chart-my-tags', data.tags || [], '#7c3aed');
    if (!(data.cities || []).length) {
      personalHintEl.textContent = '还没有旅行数据：先和「小忆」聊一句行程，生成第一份攻略就会出现在这里。';
    } else {
      personalHintEl.textContent = '统计口径：按行程生成记录汇总（城市按目的地归一化）；重复去同一城市会计入次数。';
    }
    bindMapControls();
    loadGeo()
      .then(refreshManualVisits)
      .catch(function (err) {
        personalHintEl.textContent = '地图加载失败：' + err.message;
      });
  }

  function renderGlobal(data) {
    renderKpis(kpisEl, [
      ['用户数', data.totals.users],
      ['记忆条数', data.totals.memories],
      ['行程数', data.totals.itineraries],
      ['完成消化', data.totals.digests],
      ['意图样本', data.totals.intents],
    ]);
    if (!(data.tagDistribution || []).length) {
      hintEl.textContent = '还没有统计数据：先去聊天页聊几轮，或运行 node scripts/seed-demo.js 生成演示数据。';
      return;
    }
    barChart('chart-tags', data.tagDistribution, '#2563eb');
    barChart('chart-cities', data.cityDistribution, '#7c3aed');
    donutChart('chart-budget', data.budgetDistribution || []);
    donutChart('chart-intent', data.intentDistribution || []);
  }

  function normName(name) {
    return String(name || '')
      .replace(/(省|市|自治区|特别行政区|自治州|地区|盟)$/g, '')
      .trim();
  }

  function loadGeo() {
    if (geoProvinces && geoCities) return Promise.resolve();
    return Promise.all([
      fetch('/vendor/geo/china-provinces.json').then(function (resp) { return resp.json(); }),
      fetch('/vendor/geo/china-cities.json').then(function (resp) { return resp.json(); }),
    ]).then(function (results) {
      geoProvinces = results[0];
      geoCities = results[1];
      if (window.echarts) {
        window.echarts.registerMap('china-provinces', geoProvinces);
        window.echarts.registerMap('china-cities', geoCities);
      }
    });
  }

  function cityFeatureIndex() {
    const index = new Map();
    (geoCities.features || []).forEach(function (feature) {
      const name = normName(feature.properties && feature.properties.name);
      if (name && !index.has(name)) index.set(name, feature);
    });
    return index;
  }

  function provinceValues() {
    const values = new Map();
    const cityIndex = cityFeatureIndex();
    personalCities.forEach(function (item) {
      const cityName = normName(item.city);
      const feature = cityIndex.get(cityName);
      let provinceName = feature ? feature.properties.province : null;
      if (!provinceName) {
        const province = (geoProvinces.features || []).find(function (node) {
          return normName(node.properties.name) === cityName;
        });
        provinceName = province ? province.properties.name : null;
      }
      if (provinceName) values.set(provinceName, (values.get(provinceName) || 0) + item.count);
    });
    manualVisits.forEach(function (item) {
      if (item.level === 'province') values.set(item.name, (values.get(item.name) || 0) + 1);
    });
    return values;
  }

  function cityValues() {
    const values = new Map();
    (geoCities.features || []).forEach(function (feature) {
      const featureName = feature.properties && feature.properties.name;
      const normalized = normName(featureName);
      const auto = personalCities.find(function (item) {
        return normName(item.city) === normalized;
      });
      let count = auto ? auto.count : 0;
      manualVisits.forEach(function (item) {
        if (item.level === 'city' && item.name === featureName) count += 1;
      });
      if (count) values.set(featureName, count);
    });
    return values;
  }

  function renderVisitChips() {
    const wrap = document.getElementById('visit-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!manualVisits.length) {
      wrap.appendChild(el('span', 'muted', '还没有手动标记。'));
      return;
    }
    manualVisits.forEach(function (item) {
      const chip = el('span', 'visit-chip');
      chip.appendChild(el('span', null, item.name + (item.level === 'province' ? '（省）' : '（市）')));
      const btn = el('button', 'link-btn', '×');
      btn.addEventListener('click', function () {
        toggleVisit(item.name, item.level);
      });
      chip.appendChild(btn);
      wrap.appendChild(chip);
    });
  }

  function renderMap() {
    const container = document.getElementById('travel-map');
    if (!container || !window.echarts || !geoProvinces) return;
    if (!mapChart) mapChart = window.echarts.init(container);
    if (!mapChart.__bound) {
      mapChart.on('click', function (params) {
        toggleVisit(params.name, mapLevel === 'province' ? 'province' : 'city');
      });
      mapChart.__bound = true;
    }
    const provinceMode = mapLevel === 'province';
    const features = (provinceMode ? geoProvinces : geoCities).features || [];
    const values = provinceMode ? provinceValues() : cityValues();
    const data = features.map(function (feature) {
      const name = feature.properties && feature.properties.name;
      return { name: name, value: values.get(name) || 0 };
    });
    const max = Math.max.apply(null, data.map(function (item) { return item.value; }).concat([1]));
    mapChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}：{c} 次' },
      visualMap: {
        min: 0,
        max: max,
        left: 10,
        bottom: 10,
        calculable: false,
        inRange: { color: ['#e8eefc', '#2563eb'] },
        textStyle: { color: '#6b7280', fontSize: 12 },
      },
      series: [
        {
          type: 'map',
          map: provinceMode ? 'china-provinces' : 'china-cities',
          roam: true,
          label: { show: false },
          itemStyle: { borderColor: '#ffffff', borderWidth: 0.6, areaColor: '#f1f5f9' },
          emphasis: { itemStyle: { areaColor: '#93c5fd' } },
          data: data,
        },
      ],
    }, true);
    renderVisitChips();
  }

  async function toggleVisit(name, level) {
    if (!name) return;
    const exists = manualVisits.some(function (item) {
      return item.name === name && item.level === level;
    });
    const resp = exists
      ? await fetch('/api/visits?name=' + encodeURIComponent(name) + '&level=' + encodeURIComponent(level), { method: 'DELETE' })
      : await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, level: level }),
        });
    if (resp.status === 401) {
      location.href = '/login.html';
      return;
    }
    await refreshManualVisits();
  }

  async function refreshManualVisits() {
    try {
      const resp = await fetch('/api/visits');
      if (resp.status === 401) {
        location.href = '/login.html';
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        manualVisits = data.manual || [];
      }
    } catch (err) {
      /* 忽略，仍然渲染地图 */
    }
    renderMap();
  }

  function bindMapControls() {
    const tabs = document.getElementById('map-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (event) {
        const tab = event.target.closest('.view-tab');
        if (!tab) return;
        mapLevel = tab.getAttribute('data-level');
        Array.prototype.forEach.call(tabs.querySelectorAll('.view-tab'), function (node) {
          node.classList.toggle('active', node === tab);
        });
        renderMap();
      });
    }
    window.addEventListener('resize', function () {
      if (mapChart) mapChart.resize();
    });
  }

  function switchView(view) {
    Array.prototype.forEach.call(document.querySelectorAll('.view-tab'), function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-view') === view);
    });
    document.getElementById('view-personal').style.display = view === 'personal' ? '' : 'none';
    document.getElementById('view-global').style.display = view === 'global' ? '' : 'none';
    if (view === 'global' && !globalLoaded) {
      globalLoaded = true;
      fetchJSON('/api/stats')
        .then(renderGlobal)
        .catch(function (err) {
          hintEl.textContent = '加载失败：' + err.message;
        });
    }
  }

  if (tabsEl) {
    tabsEl.addEventListener('click', function (event) {
      const tab = event.target.closest('.view-tab');
      if (tab) switchView(tab.getAttribute('data-view'));
    });
  }

  fetchJSON('/api/stats/personal')
    .then(renderPersonal)
    .catch(function (err) {
      personalHintEl.textContent = '加载失败：' + err.message;
    });
})();
