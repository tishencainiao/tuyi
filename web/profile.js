(function () {
  'use strict';

  const whoEl = document.getElementById('who');
  const logoutBtn = document.getElementById('logout');
  const bodyEl = document.getElementById('profile-body');

  function redirectLogin() {
    location.href = '/login.html';
  }

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
      insight.appendChild(
        el('p', 'empty', '还没有消化结果：多聊几轮，或运行 python py/digest.py --user ' + data.userId + ' --force。'),
      );
    }
    bodyEl.appendChild(insight);

    const memories = panel('记忆条目');
    const memoryBar = el('div', 'memory-bar');
    const addBtn = el('button', 'link-btn', '＋ 添加一条');
    addBtn.addEventListener('click', addMemory);
    memoryBar.appendChild(addBtn);
    memories.appendChild(memoryBar);
    if ((data.memories || []).length) {
      const list = el('ul', 'memory-list');
      data.memories.forEach(function (item) {
        const li = el('li', 'memory-item');
        li.appendChild(el('div', null, item.text));
        const bottom = el('div', 'memory-bottom');
        bottom.appendChild(el('div', 'meta', (item.tags || []).join(' · ')));
        const actions = el('div', 'memory-actions');
        const editBtn = el('button', 'link-btn', '改');
        editBtn.addEventListener('click', function () {
          editMemory(item);
        });
        const delBtn = el('button', 'link-btn', '删');
        delBtn.addEventListener('click', function () {
          removeMemory(item);
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        bottom.appendChild(actions);
        li.appendChild(bottom);
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
        left.appendChild(el('strong', null, trip.title || trip.destination + '行程'));
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

  async function editMemory(item) {
    const next = window.prompt('修改这条记忆（留空取消）', item.text);
    if (!next) return;
    const text = next.trim();
    if (!text || text === item.text) return;
    const resp = await fetch('/api/memory/' + encodeURIComponent(item.id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text }),
    });
    if (!resp.ok) return window.alert('修改失败');
    load();
  }

  async function removeMemory(item) {
    if (!window.confirm('删除这条记忆？\n' + item.text)) return;
    const resp = await fetch('/api/memory/' + encodeURIComponent(item.id), { method: 'DELETE' });
    if (!resp.ok) return window.alert('删除失败');
    load();
  }

  async function addMemory() {
    const text = window.prompt('添加一条关于你的记忆（例如：我不吃辣）', '');
    if (!text || !text.trim()) return;
    const resp = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
    if (!resp.ok) return window.alert('添加失败');
    load();
  }

  function load() {
    fetch('/api/me')
      .then(function (resp) {
        if (!resp.ok) throw new Error('未登录');
        return resp.json();
      })
      .then(function (data) {
        if (whoEl) whoEl.textContent = data.user.username;
        return fetch('/api/profile');
      })
      .then(function (resp) {
        if (resp.status === 401) return redirectLogin();
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        if (data) render(data);
      })
      .catch(function (err) {
        renderEmpty('加载失败：' + err.message);
      });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (err) {
        /* 忽略 */
      }
      location.href = '/login.html';
    });
  }

  load();
})();
