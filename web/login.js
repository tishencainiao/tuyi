(function () {
  'use strict';

  const tabs = Array.prototype.slice.call(document.querySelectorAll('.auth-tab'));
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const errorEl = document.getElementById('auth-error');

  function setMode(mode) {
    tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === mode);
    });
    loginForm.style.display = mode === 'login' ? '' : 'none';
    registerForm.style.display = mode === 'register' ? '' : 'none';
    errorEl.textContent = '';
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setMode(tab.getAttribute('data-mode'));
    });
  });

  async function post(path, payload) {
    const resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = {};
    try {
      data = await resp.json();
    } catch (err) {
      data = {};
    }
    if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);
    return data;
  }

  async function submit(path, values) {
    errorEl.textContent = '';
    try {
      await post(path, values);
      location.href = '/';
    } catch (err) {
      errorEl.textContent = err && err.message ? err.message : String(err);
    }
  }

  loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    submit('/api/login', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
    });
  });

  registerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    submit('/api/register', {
      username: document.getElementById('reg-username').value,
      password: document.getElementById('reg-password').value,
    });
  });
})();
