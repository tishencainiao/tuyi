(function () {
  'use strict';

  const inputEl = document.getElementById('uid');
  const loadBtn = document.getElementById('load');
  const bodyEl = document.getElementById('profile-body');

  inputEl.value = localStorage.getItem('trip-user-id') || 'live-test';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function panel(title) {
    const section = el('section', 'panel');
    section.appendChild(el('h2', null, title));
    return section;
  }

  function renderEmpty(message) {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('p', 'empty', message));
  }

  function render(data) {
    bodyEl.innerHTML = '';

    const overview = panel('用户概况');
    overview.appendChild(
      el(
        'p',
        'muted',
        '用户 ID：' + data.userId + ' · 对话轮数 ' + (data.turnsCount || 0) + ' · 记忆 ' + (data.memories || []).length + ' 条 · 行程 ' + (data.itineraries || []).length + ' 次',
      ),
    );
    bodyEl.appendChild(overview);

    const insight = panel('偏好画像（记忆消化结果）');
    if (data.insights && (data.insights.summary || (data.insights.tags || []).length)) {
      if (data.insights.summary) insight.appendChild(el('p', null, data.insights.summary));
      const tags = el('div', 'tags');
      (data.insights.tags || []).forEach(function (tag) {
        tags.appendChild(el('span', 'tag', tag));
      });
      insight.appendChild(tags);
      if (data.insights.updated) {
        insight.appendChild(el('p', 'muted', '更新时间：' + new Date(data.insights.updated).toLocaleString()));
      }
    } else {
      insight.appendChild(el('p', 'empty', '还没有消化结果：多聊几轮，或运行 python py/digest.py --user ' + data.userId + ' --force。'));
    }
    bodyEl.appendChild(insight);

    const memories = panel('记忆条目');
    if ((data.memories || []).length) {
      const list = el('ul', 'memory-list');
      data.memories.forEach(function (item) {
        const li = el('li', 'memory-item');
        li.appendChild(el('div', null, item.text));
        const meta = el('div', 'meta', (item.tags || []).join(' · '));
        li.appendChild(meta);
        list.appendChild(li);
      });
      memories.appendChild(list);
    } else {
      memories.appendChild(el('p', 'empty', '还没有记忆条目。'));
    }
    bodyEl.appendChild(memories);

    const trips = panel('行程记录');
    if ((data.itineraries || []).length) {
      const list = el('ul', 'trip-list');
      data.itineraries.forEach(function (trip) {
        const li = el('li', 'trip-item');
        const left = el('div');
        left.appendChild(el('strong', null, trip.title || (trip.destination + '行程')));
        left.appendChild(
          el(
            'div',
            'muted',
            trip.destination + ' · ' + (trip.days || []).length + ' 天 · 预算约 ¥' + (trip.budget_cny || 0),
          ),
        );
        li.appendChild(left);
        li.appendChild(el('span', 'muted', trip.ts ? new Date(trip.ts).toLocaleDateString() : ''));
        list.appendChild(li);
      });
      trips.appendChild(list);
    } else {
      trips.appendChild(el('p', 'empty', '还没有生成过行程。'));
    }
    bodyEl.appendChild(trips);
  }

  function load() {
    const userId = inputEl.value.trim();
    if (!userId) {
      renderEmpty('请输入用户 ID。');
      return;
    }
    loadBtn.disabled = true;
    fetch('/api/profile?userId=' + encodeURIComponent(userId))
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        render(data);
      })
      .catch(function (err) {
        renderEmpty('加载失败：' + err.message);
      })
      .finally(function () {
        loadBtn.disabled = false;
      });
  }

  loadBtn.addEventListener('click', load);
  inputEl.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') load();
  });

  if (inputEl.value) load();
})();
