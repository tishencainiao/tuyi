(function () {
  'use strict';

  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('composer');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const hintEl = document.getElementById('hint');
  const chipsEl = document.getElementById('chips');
  const topbarEl = document.querySelector('.topbar');
  const conversationId = 'default';

  let busy = false;
  let me = null;

  function redirectLogin() {
    location.href = '/login.html';
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text || '';
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return bubble;
  }

  function createItineraryCard(it) {
    const card = document.createElement('div');
    card.className = 'itinerary';

    const head = document.createElement('div');
    head.className = 'it-head';
    head.textContent = it.title || (it.destination || '') + '行程';
    card.appendChild(head);

    if (it.budget_cny) {
      const budget = document.createElement('div');
      budget.className = 'it-budget';
      budget.textContent = '预算约 ¥' + it.budget_cny;
      card.appendChild(budget);
    }

    (it.days || []).forEach(function (day) {
      const section = document.createElement('section');
      section.className = 'day';

      const dayHead = document.createElement('div');
      dayHead.className = 'day-head';
      dayHead.textContent = (day.date || '') + (day.title ? ' · ' + day.title : '');
      section.appendChild(dayHead);

      (day.items || []).forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'item';

        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = item.time || '';
        row.appendChild(time);

        const main = document.createElement('span');
        main.className = 'main';
        main.textContent = (item.place || '') + (item.activity ? ' · ' + item.activity : '');
        row.appendChild(main);

        if (item.transport) {
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = item.transport;
          row.appendChild(meta);
        }

        if (item.cost_cny) {
          const cost = document.createElement('span');
          cost.className = 'cost';
          cost.textContent = '¥' + item.cost_cny;
          row.appendChild(cost);
        }

        section.appendChild(row);
      });

      card.appendChild(section);
    });

    return card;
  }

  function handleEvent(evt, bubble, state) {
    switch (evt.type) {
      case 'delta':
        if (!state.started) {
          state.started = true;
          bubble.classList.remove('typing');
          bubble.textContent = '';
        }
        bubble.textContent += evt.text;
        break;
      case 'tool_start': {
        const label =
          evt.name === 'plan_trip'
            ? '整理行程'
            : evt.name === 'search_poi'
              ? '查询景点'
              : evt.name === 'get_weather'
                ? '查询天气'
                : '处理';
        hintEl.textContent = '正在' + label + '…';
        break;
      }
      case 'tool_result':
        hintEl.textContent = '';
        break;
      case 'itinerary':
        messagesEl.appendChild(createItineraryCard(evt.value));
        break;
      case 'error':
        state.errored = true;
        bubble.classList.remove('typing');
        bubble.classList.add('error');
        bubble.textContent = (state.started ? bubble.textContent + '\n' : '') + '出错了：' + evt.message;
        break;
      case 'done':
        hintEl.textContent = '';
        if (!state.started && !state.errored) bubble.textContent = '（没有生成内容）';
        break;
      default:
        break;
    }
    scrollToBottom();
  }

  async function loadHistory() {
    const resp = await fetch('/api/history?conversationId=' + encodeURIComponent(conversationId));
    if (resp.status === 401) {
      redirectLogin();
      return;
    }
    if (!resp.ok) return;
    const data = await resp.json();
    const turns = data.turns || [];
    if (!turns.length) return;
    messagesEl.innerHTML = '';
    turns.forEach(function (turn) {
      addMessage(turn.role === 'user' ? 'user' : 'bot', turn.text);
    });
    if (chipsEl) messagesEl.appendChild(chipsEl);
    scrollToBottom();
  }

  async function send(text) {
    addMessage('user', text);
    const bubble = addMessage('bot', '思考中…');
    bubble.classList.add('typing');
    const state = { started: false, errored: false };

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId: conversationId }),
      });
      if (resp.status === 401) {
        redirectLogin();
        return;
      }
      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(function () {
          return '';
        });
        throw new Error(detail || 'HTTP ' + resp.status);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 2);
          if (!chunk.startsWith('data:')) continue;
          try {
            handleEvent(JSON.parse(chunk.slice(5).trim()), bubble, state);
          } catch (err) {
            /* 忽略无法解析的块 */
          }
        }
      }
    } catch (err) {
      bubble.classList.remove('typing');
      bubble.classList.add('error');
      bubble.textContent = '出错了：' + (err && err.message ? err.message : String(err));
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  function submitText(text) {
    const value = String(text || '').trim();
    if (!value || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    send(value);
  }

  function renderUserBox() {
    if (!me || !topbarEl) return;
    const box = document.createElement('div');
    box.className = 'user-box';
    const name = document.createElement('span');
    name.textContent = me.username;
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'link-btn';
    out.textContent = '退出';
    out.addEventListener('click', async function () {
      try {
        await fetch('/api/logout', { method: 'POST' });
      } catch (err) {
        /* 忽略 */
      }
      location.href = '/login.html';
    });
    box.appendChild(name);
    box.appendChild(out);
    topbarEl.appendChild(box);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submitText(input.value);
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitText(input.value);
    }
  });

  if (chipsEl) {
    chipsEl.addEventListener('click', function (event) {
      const chip = event.target.closest('.chip');
      if (chip) submitText(chip.getAttribute('data-prompt'));
    });
  }

  (async function init() {
    try {
      const resp = await fetch('/api/me');
      if (!resp.ok) return redirectLogin();
      const data = await resp.json();
      me = data.user;
    } catch (err) {
      return redirectLogin();
    }
    renderUserBox();
    await loadHistory().catch(function () {});
    input.focus();
  })();
})();
