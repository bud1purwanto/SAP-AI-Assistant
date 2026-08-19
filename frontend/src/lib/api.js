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

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Pembungkus fetch untuk seluruh API.
 *
 * Identitas dibawa oleh token JWT di header Authorization. Header X-User-Name
 * yang lama sengaja tidak lagi dikirim: nilainya dapat dipalsukan siapa pun
 * sehingga tidak pernah menjadi bukti identitas.
 */
export async function apiFetch(path, { method = 'GET', body, auth = true, signal } = {}) {
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
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda.', 0);
  }

  if (res.status === 401) {
    clearSession();
    onUnauthorized();
    throw new ApiError('Sesi Anda telah berakhir. Silakan login kembali.', 401);
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
    const detail = (data && data.detail) || (typeof data === 'string' ? data : '') ||
      `Permintaan gagal (HTTP ${res.status}).`;
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
  deleteSession: (id) => apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }),
  sessionMessages: (id) => apiFetch(`/api/sessions/${id}/messages`),

  mcpServers: () => apiFetch('/api/mcp/servers', { auth: false }),

  chat: (payload, signal) =>
    apiFetch('/api/chat', { method: 'POST', body: payload, auth: true, signal }),

  adminStats: () => apiFetch('/api/admin/stats'),
  adminUsers: () => apiFetch('/api/admin/users'),
  adminCreateUser: (payload) => apiFetch('/api/admin/users', { method: 'POST', body: payload }),
  adminUpdateUser: (username, payload) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PUT', body: payload }),
  adminDeleteUser: (username) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  adminSessions: (limit = 50) => apiFetch(`/api/admin/sessions?limit=${limit}`),
  adminSessionMessages: (id) => apiFetch(`/api/admin/sessions/${id}/messages`),
};

/**
 * Ambil berkas hasil generate sebagai Blob.
 *
 * Endpoint unduhan memerlukan token, sehingga tidak bisa dibuka lewat
 * tautan biasa — berkasnya diambil di sini lalu disimpan dari sisi browser.
 */
export async function fetchArtifactBlob(artifactId) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/artifacts/${artifactId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    clearSession();
    onUnauthorized();
    throw new ApiError('Sesi Anda telah berakhir. Silakan login kembali.', 401);
  }
  if (!res.ok) {
    throw new ApiError('Berkas tidak ditemukan atau sudah kedaluwarsa.', res.status);
  }
  return res.blob();
}
