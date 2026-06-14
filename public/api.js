// public/api.js
// 前端 API 客戶端 — 所有 fetch 都從這裡發出
// 自動帶 JWT Token、統一錯誤處理

const API_BASE = window.location.origin + '/api';

// ── Token management ──────────────────────────────────────────────
const TokenStore = {
  get: () => localStorage.getItem('iam_token'),
  set: (t) => localStorage.setItem('iam_token', t),
  clear: () => localStorage.removeItem('iam_token'),
};

// ── Core fetch ────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = TokenStore.get();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  // Token expired → force logout
  if (res.status === 401) {
    TokenStore.clear();
    window.dispatchEvent(new Event('iam:logout'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'API 錯誤 ' + res.status);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────
const Auth = {
  async login(username, password) {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { username, password } });
    TokenStore.set(data.token);
    return data.user;
  },
  async register(form) {
    const data = await apiFetch('/auth/register', { method: 'POST', body: form });
    TokenStore.set(data.token);
    return data.user;
  },
  async me() {
    return apiFetch('/auth/me');
  },
  logout() {
    TokenStore.clear();
  },
  isLoggedIn: () => !!TokenStore.get(),
};

// ── Posts ─────────────────────────────────────────────────────────
const Posts = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/posts' + (qs ? '?' + qs : ''));
  },
  create: (body) => apiFetch('/posts', { method: 'POST', body }),
  delete: (id) => apiFetch('/posts/' + id, { method: 'DELETE' }),
  like: (id) => apiFetch('/posts/' + id + '/like', { method: 'POST' }),
  getComments: (id) => apiFetch('/posts/' + id + '/comments'),
  addComment: (id, content) => apiFetch('/posts/' + id + '/comments', { method: 'POST', body: { content } }),
};

// ── Bubble ────────────────────────────────────────────────────────
const Bubble = {
  getMessages: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/bubble/messages' + (qs ? '?' + qs : ''));
  },
  send: (body) => apiFetch('/bubble/send', { method: 'POST', body }),
  getFans: () => apiFetch('/bubble/fans'),
};

// ── Groups ────────────────────────────────────────────────────────
const Groups = {
  list: () => apiFetch('/groups'),
  get: (id) => apiFetch('/groups/' + id),
  unlock: (id, paymentData = {}) => apiFetch('/groups/' + id + '/unlock', { method: 'POST', body: paymentData }),
};

// ── Users ─────────────────────────────────────────────────────────
const Users = {
  getProfile: (username) => apiFetch('/users/' + username),
  updateProfile: (body) => apiFetch('/users/me', { method: 'PATCH', body }),
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/users' + (qs ? '?' + qs : ''));
  },
};

// ── Upload ────────────────────────────────────────────────────────
const Upload = {
  async file(file, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    const token = TokenStore.get();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/upload');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (onProgress) xhr.upload.addEventListener('progress', e => onProgress(Math.round(e.loaded / e.total * 100)));
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || '上傳失敗'));
      };
      xhr.onerror = () => reject(new Error('網路錯誤'));
      xhr.send(formData);
    });
  },
};

// Export (CommonJS compatible for non-module scripts)
if (typeof module !== 'undefined') {
  module.exports = { Auth, Posts, Bubble, Groups, Users, Upload, apiFetch };
} else {
  window.IAM = { Auth, Posts, Bubble, Groups, Users, Upload };
}
