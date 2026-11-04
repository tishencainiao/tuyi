(function () {
  'use strict';

  const kpisEl = document.getElementById('kpis');
  const hintEl = document.getElementById('empty-hint');
  const palette = ['#2563eb', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6'];

  function fmt(value) {
    return String(value == null ? 0 : value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderKpis(totals) {
    const items = [
      ['用户数', totals.users],
      ['记忆条数', totals.memories],
      ['行程数', totals.itineraries],
      ['完成消化', totals.digests],
      ['意图样本', totals.intents],
    ];
    kpisEl.innerHTML = '';
    items.forEach(function (item) {
      const div = document.createElement('div');
      div.className = 'kpi';
      const value = document.createElement('strong');
      value.textContent = fmt(item[1]);
      const label = document.createElement('span');
      label.textContent = item[0];
      div.appendChild(value);
      div.appendChild(label);
      kpisEl.appendChild(div);
    });
  }

  function barChart(id, data, color) {
    const el = document.getElementById(id);
    if (!el || !window.echarts) return;
    const chart = window.echarts.init(el);
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
    const el = document.getElementById(id);
    if (!el || !window.echarts) return;
    const chart = window.echarts.init(el);
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

  fetch('/api/stats')
    .then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    })
    .then(function (data) {
      renderKpis(data.totals || {});
      if (!(data.tagDistribution || []).length) {
        hintEl.textContent = '还没有统计数据：先去聊天页聊几轮，或运行 node scripts/seed-demo.js 生成演示数据。';
        return;
      }
      barChart('chart-tags', data.tagDistribution, '#2563eb');
      barChart('chart-cities', data.cityDistribution, '#7c3aed');
      donutChart('chart-budget', data.budgetDistribution || []);
      donutChart('chart-intent', data.intentDistribution || []);
    })
    .catch(function (err) {
      hintEl.textContent = '加载失败：' + err.message;
    });
})();
