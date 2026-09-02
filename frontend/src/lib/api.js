import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'sap_assistant_token';
const USER_KEY = 'sap_assistant_user';

/** Dipanggil saat server menolak token (401) agar UI dapat mengembalikan ke layar login. */
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : () => {};
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* penyimpanan tidak tersedia — sesi hanya bertahan selama tab terbuka */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* diabaikan */
  }
}

function getActiveLanguage() {
  try {
    return localStorage.getItem('sap_assistant_lang') || 'en';
  } catch {
    return 'en';
  }
}

/**
 * Pesan untuk kegagalan di tingkat jaringan.
 */
function connectionErrorMessage() {
  const isEn = getActiveLanguage() === 'en';
  let offline = false;
  try {
    offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch { /* navigator tidak tersedia */ }

  return offline
    ? (isEn ? 'Your device is offline. Check your internet connection.' : 'Perangkat Anda sedang offline. Periksa koneksi internet.')
    : (isEn ? 'Server is not responding. Ensure backend service is running, then try again.' : 'Server tidak merespons. Pastikan layanan backend berjalan, lalu coba lagi.');
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Pembungkus fetch untuk seluruh API.
 */
export async function apiFetch(path, { method = 'GET', body, auth = true, signal } = {}) {
  const isEn = getActiveLanguage() === 'en';
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(connectionErrorMessage(), 0);
  }

  if (res.status === 401 && path !== '/api/login') {
    clearSession();
    onUnauthorized();
    throw new ApiError(isEn ? 'Your session has expired. Please sign in again.' : 'Sesi Anda telah berakhir. Silakan login kembali.', 401);
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    let detail = (data && data.detail) || (typeof data === 'string' ? data : '');
    if (typeof detail === 'string' && (detail.trim().startsWith('<') || res.status >= 500)) {
      if (res.status === 502) {
        detail = isEn ? 'Backend server is unreachable or offline (502 Bad Gateway).' : 'Server backend sedang tidak aktif atau tidak dapat dijangkau (502 Bad Gateway).';
      } else if (res.status === 503) {
        detail = isEn ? 'Backend service is temporarily under maintenance (503 Service Unavailable).' : 'Layanan backend sedang dalam pemeliharaan (503 Service Unavailable).';
      } else if (res.status === 504) {
        detail = isEn ? 'Connection to backend server timed out (504 Gateway Timeout).' : 'Koneksi ke server backend timeout (504 Gateway Timeout).';
      } else if (detail.trim().startsWith('<')) {
        detail = isEn ? `Server error occurred (HTTP ${res.status}).` : `Terjadi kesalahan pada server (HTTP ${res.status}).`;
      }
    }
    if (!detail) {
      detail = isEn ? `Request failed (HTTP ${res.status}).` : `Permintaan gagal (HTTP ${res.status}).`;
    }
    throw new ApiError(detail, res.status);
  }

  return data;
}

export const api = {
  login: (username, password) =>
    apiFetch('/api/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => apiFetch('/api/me'),
  getConfig: () => apiFetch('/api/config'),
  saveConfig: (payload) => apiFetch('/api/config', { method: 'POST', body: payload }),
  changePassword: (oldPassword, newPassword) =>
    apiFetch('/api/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
    }),

  listSessions: () => apiFetch('/api/sessions'),
  createSession: (title) => apiFetch('/api/sessions', { method: 'POST', body: { title } }),
  renameSession: (id, title) => apiFetch(`/api/sessions/${id}`, { method: 'PATCH', body: { title } }),

  searchSessions: (q) => apiFetch(`/api/sessions/search?q=${encodeURIComponent(q)}`),

  /** Hapus sebuah pesan beserta semua pesan sesudahnya dalam sesi yang sama. */
  truncateFromMessage: (messageId) =>
    apiFetch(`/api/messages/${messageId}`, { method: 'DELETE' }),
  deleteSession: (id) => apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }),
  sessionMessages: (id) => apiFetch(`/api/sessions/${id}/messages`),

  mcpServers: () => apiFetch('/api/mcp/servers', { auth: false }),

  chat: (payload, signal) =>
    apiFetch('/api/chat', { method: 'POST', body: payload, auth: true, signal }),

  getSuggestions: (lang = 'id') =>
    apiFetch(`/api/chat/suggestions?lang=${encodeURIComponent(lang || 'id')}`, { auth: true }),

  setMessageFeedback: (messageId, feedback) =>
    apiFetch(`/api/messages/${messageId}/feedback`, {
      method: 'POST',
      body: { feedback },
    }),

  adminStats: () => apiFetch('/api/admin/stats'),
  quotaSaya: () => apiFetch('/api/quota'),

  adminQuota: () => apiFetch('/api/admin/quota'),
  adminQuotaSaklar: (enabled) =>
    apiFetch('/api/admin/quota/enabled', { method: 'POST', body: { enabled } }),
  adminQuotaBatas: (payload) =>
    apiFetch('/api/admin/quota/limits', { method: 'PUT', body: payload }),
  adminQuotaReset: (username) =>
    apiFetch(`/api/admin/quota/reset${username ? `?username=${encodeURIComponent(username)}` : ''}`,
      { method: 'POST' }),

  adminFeedback: (kind = 'dislike', limit = 50) =>
    apiFetch(`/api/admin/feedback?kind=${kind}&limit=${limit}`),
  adminUsers: () => apiFetch('/api/admin/users'),
  adminCreateUser: (payload) => apiFetch('/api/admin/users', { method: 'POST', body: payload }),
  adminUpdateUser: (username, payload) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PUT', body: payload }),
  adminDeleteUser: (username) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  adminSessions: (limit = 50) => apiFetch(`/api/admin/sessions?limit=${limit}`),
  adminSessionMessages: (id) => apiFetch(`/api/admin/sessions/${id}/messages`),

  adminSkills: () => apiFetch('/api/admin/skills'),
  adminCreateSkill: (payload) => apiFetch('/api/admin/skills', { method: 'POST', body: payload }),
  adminUpdateSkill: (id, payload) => apiFetch(`/api/admin/skills/${id}`, { method: 'PUT', body: payload }),
  adminDeleteSkill: (id) => apiFetch(`/api/admin/skills/${id}`, { method: 'DELETE' }),

  getModes: () => apiFetch('/api/modes', { auth: true }),
  adminModes: () => apiFetch('/api/admin/modes'),
  adminCreateMode: (payload) => apiFetch('/api/admin/modes', { method: 'POST', body: payload }),
  adminUpdateMode: (id, payload) => apiFetch(`/api/admin/modes/${id}`, { method: 'PUT', body: payload }),
  adminDeleteMode: (id) => apiFetch(`/api/admin/modes/${id}`, { method: 'DELETE' }),
  adminSetDefaultMode: (id) => apiFetch(`/api/admin/modes/${id}/default`, { method: 'POST' }),
  adminToggleModesMaster: (enabled) =>
    apiFetch('/api/admin/modes/enabled', { method: 'POST', body: { enabled } }),
  adminRoleModes: () => apiFetch('/api/admin/modes/roles'),
  adminUpdateRoleMode: (payload) =>
    apiFetch('/api/admin/modes/roles', { method: 'PUT', body: payload }),
};

/**
 * Ambil berkas hasil generate sebagai Blob.
 *
 * Endpoint unduhan memerlukan token, sehingga tidak bisa dibuka lewat
 * tautan biasa — berkasnya diambil di sini lalu disimpan dari sisi browser.
 */
export async function fetchArtifactBlob(artifactId) {
  const isEn = getActiveLanguage() === 'en';
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/artifacts/${artifactId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    clearSession();
    onUnauthorized();
    throw new ApiError(isEn ? 'Your session has expired. Please sign in again.' : 'Sesi Anda telah berakhir. Silakan login kembali.', 401);
  }
  if (!res.ok) {
    throw new ApiError(isEn ? 'File not found or has expired.' : 'Berkas tidak ditemukan atau sudah kedaluwarsa.', res.status);
  }
  return res.blob();
}

/**
 * Unggah satu lampiran (gambar/dokumen) sebagai konteks percakapan.
 */
export async function uploadAttachment(file, sessionId) {
  const isEn = getActiveLanguage() === 'en';
  const form = new FormData();
  form.append('file', file);
  if (sessionId) form.append('session_id', sessionId);

  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError(`${connectionErrorMessage()} (${isEn ? 'failed uploading file' : 'gagal saat mengunggah berkas'})`, 0);
  }

  if (res.status === 401) {
    clearSession();
    onUnauthorized();
    throw new ApiError(isEn ? 'Your session has expired. Please sign in again.' : 'Sesi Anda telah berakhir. Silakan login kembali.', 401);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data && data.detail) || (isEn ? 'Failed to upload file.' : 'Berkas gagal diunggah.'), res.status);
  }
  return data;
}

/** URL pratinjau lampiran; perlu token sehingga diambil sebagai blob. */
export async function fetchAttachmentBlob(uploadId) {
  const isEn = getActiveLanguage() === 'en';
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/uploads/${uploadId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(isEn ? 'Failed to load attachment.' : 'Lampiran tidak dapat dimuat.', res.status);
  return res.blob();
}

/**
 * Kirim pesan chat sambil menerima progres pengerjaannya.
 */
export async function chatWithProgress(payload, { onProgress, onToken, signal } = {}) {
  const isEn = getActiveLanguage() === 'en';
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(connectionErrorMessage(), 0);
  }

  if (res.status === 401) {
    clearSession();
    onUnauthorized();
    throw new ApiError(isEn ? 'Your session has expired. Please sign in again.' : 'Sesi Anda telah berakhir. Silakan login kembali.', 401);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try {
      detail = JSON.parse(text).detail || '';
    } catch {
      detail = text;
    }
    if (typeof detail === 'string' && (detail.trim().startsWith('<') || res.status >= 500)) {
      if (res.status === 502) {
        detail = isEn ? 'Backend server is unreachable or offline (502 Bad Gateway).' : 'Server backend sedang tidak aktif atau tidak dapat dijangkau (502 Bad Gateway).';
      } else if (res.status === 503) {
        detail = isEn ? 'Backend service is temporarily under maintenance (503 Service Unavailable).' : 'Layanan backend sedang dalam pemeliharaan (503 Service Unavailable).';
      } else if (res.status === 504) {
        detail = isEn ? 'Connection to backend server timed out (504 Gateway Timeout).' : 'Koneksi ke server backend timeout (504 Gateway Timeout).';
      } else if (detail.trim().startsWith('<')) {
        detail = isEn ? `Server error occurred (HTTP ${res.status}).` : `Terjadi kesalahan pada server (HTTP ${res.status}).`;
      }
    }
    if (!detail) {
      detail = isEn ? `Request failed (HTTP ${res.status}).` : `Permintaan gagal (HTTP ${res.status}).`;
    }
    throw new ApiError(detail, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let failure = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;

      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (event.type === 'progress') onProgress?.(event);
      else if (event.type === 'token') onToken?.(event.text);
      else if (event.type === 'token_reset') onToken?.(null);
      else if (event.type === 'result') result = event.data;
      else if (event.type === 'error') failure = new ApiError(event.detail, event.status || 500);
    }
  }

  if (failure) throw failure;
  if (!result) throw new ApiError(isEn ? 'Server closed connection before response completed.' : 'Server menutup koneksi sebelum jawaban selesai.', 500);
  return result;
}
