/**
 * Utility functions
 */
const Utils = (() => {

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showNotification(message, type = 'info') {
    let el = document.getElementById('notification');
    if (!el) {
      el = document.createElement('div');
      el.id = 'notification';
      el.className = 'notification';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `notification ${type}`;

    // Trigger reflow for animation restart
    el.offsetHeight;
    el.classList.add('show');

    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => {
      el.classList.remove('show');
    }, 3000);
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function requireAuth() {
    const user = Storage.getUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }

  function renderHeader(user, activePage) {
    const isAdmin = user && user.role === 'admin';
    const online = Storage.isOnline();
    return `
      <header class="header">
        <div style="display:flex;align-items:center;gap:10px;">
          <a href="index.html" class="header-logo">TestArena</a>
          <span class="badge ${online ? 'badge-live' : 'badge-ended'}" style="font-size:0.7rem;">
            ${online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <nav class="header-nav">
          ${user ? `<span class="header-user">${escapeHtml(user.name)}${user.group ? ' (' + escapeHtml(user.group) + ')' : ''}</span>` : ''}
          <a href="tests.html" class="btn btn-sm ${activePage === 'tests' ? 'btn-primary' : 'btn-outline'}">Тесты</a>
          <a href="leaderboard.html" class="btn btn-sm ${activePage === 'leaderboard' ? 'btn-primary' : 'btn-outline'}">Рейтинг</a>
          ${isAdmin ? `<a href="admin.html" class="btn btn-sm ${activePage === 'admin' ? 'btn-accent' : 'btn-outline'}">Админ</a>` : ''}
          ${user ? `<button onclick="App.logout()" class="btn btn-sm btn-outline">Выйти</button>` : ''}
        </nav>
      </header>
    `;
  }

  return {
    formatTime,
    escapeHtml,
    showNotification,
    getQueryParam,
    requireAuth,
    renderHeader,
  };
})();

// Global App helpers
const App = {
  logout() {
    Storage.clearUser();
    window.location.href = 'index.html';
  }
};
