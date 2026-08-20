import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Cpu, FileSpreadsheet, Layers, LogIn, LogOut, Menu, MessageSquare, Monitor, Moon, Pencil, Plus, Search, Settings, ShieldAlert, ShieldCheck, Sparkles, Sun, Trash2, X,
} from 'lucide-react';

import AdminDashboard from './AdminDashboard';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import LoginModal from './LoginModal';
import SettingsModal from './SettingsModal';
import ThinkingIndicator from './ThinkingIndicator';
import { useTheme } from '../hooks/useTheme';
import {
  api, ApiError, chatWithProgress, clearSession, getStoredUser, saveSession, setUnauthorizedHandler,
} from '../lib/api';

const GUEST_USER = { username: 'Guest', role: 'guest' };

/** Sapaan dibuat personal bila nama pengguna diketahui. */
const buildWelcome = (user) => {
  const name = (user?.full_name || '').trim().split(' ')[0]
    || (user?.role === 'guest' ? '' : user?.username || '');
  const greeting = name ? `Halo, ${name}!` : 'Halo!';
  return {
    role: 'assistant',
    isWelcome: true,
    content: `${greeting} Saya asisten SAP Anda. Tanyakan apa saja soal data SAP, prosedur kerja, atau minta saya menyusun laporan dan berkas Excel.`,
  };
};

// Contoh ditulis sebagai pertanyaan kerja sehari-hari, bukan potongan
// nomor dokumen yang hanya bermakna bagi pengguna teknis.
const SUGGESTIONS = [
  {
    title: 'Cek stok barang',
    subtitle: 'Lihat jumlah stok di pabrik tertentu',
    query: 'Berapa stok material 100-100 di plant 1000?',
    icon: Layers,
  },
  {
    title: 'Lacak pesanan pembelian',
    subtitle: 'Periksa status PO yang sedang berjalan',
    query: 'Bagaimana status purchase order nomor 4500000001?',
    icon: Search,
  },
  {
    title: 'Buat laporan Excel',
    subtitle: 'Rangkum data menjadi berkas siap unduh',
    query: 'Buatkan ringkasan stok material dalam bentuk file Excel.',
    icon: FileSpreadsheet,
  },
];

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Tema terang', dark: 'Tema gelap', system: 'Ikuti tema sistem' };

const aliasOf = (srv) => srv.aliases?.[0] || srv.name.toLowerCase().replace(/\s+/g, '-');
const SAP_SERVER_STORAGE_KEY = 'sap_ai_active_server';

const ChatLayout = () => {
  const [messages, setMessages] = useState(() => [buildWelcome(getStoredUser())]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Progres pengerjaan jawaban: tahap yang sedang berjalan, bukan perkiraan waktu.
  const [progress, setProgress] = useState(null);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [activeServer, setActiveServer] = useState(() => {
    try {
      return localStorage.getItem(SAP_SERVER_STORAGE_KEY) || 'sap:sandbox-new';
    } catch {
      return 'sap:sandbox-new';
    }
  });
  const [sapSubServers, setSapSubServers] = useState([]);

  const [user, setUser] = useState(() => getStoredUser() || GUEST_USER);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customLoginMsg, setCustomLoginMsg] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { theme, cycleTheme } = useTheme();

  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  const isGuest = user.role === 'guest';

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  // --- Sesi berakhir di sisi server: kembalikan UI ke mode tamu ---
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(GUEST_USER);
      setSessions([]);
      setCurrentSessionId(null);
      setCustomLoginMsg('Sesi Anda telah berakhir. Silakan login kembali.');
      setIsLoginModalOpen(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.mcpServers();
      const subs = data?.sap?.sub_servers;
      if (Array.isArray(subs) && subs.length > 0) {
        setSapSubServers(subs);
        const savedServer = localStorage.getItem(SAP_SERVER_STORAGE_KEY);
        const exists = savedServer && subs.some((s) => `sap:${aliasOf(s)}` === savedServer);
        if (!exists) {
          const activeOne = subs.find((s) => s.active) || subs[0];
          if (activeOne) {
            const defaultKey = `sap:${aliasOf(activeOne)}`;
            setActiveServer(defaultKey);
            localStorage.setItem(SAP_SERVER_STORAGE_KEY, defaultKey);
          }
        }
      }
    } catch (e) {
      console.error('Gagal mengambil data server MCP:', e);
    }
  }, []);

  const handleServerChange = (newServer) => {
    setActiveServer(newServer);
    try {
      localStorage.setItem(SAP_SERVER_STORAGE_KEY, newServer);
    } catch (e) {
      console.error('Gagal menyimpan target server ke localStorage:', e);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Validasi token tersimpan saat aplikasi dibuka: profil bisa saja sudah
  // diubah atau dihapus admin sejak login terakhir.
  useEffect(() => {
    if (isGuest) return;
    api.me()
      .then((profile) => setUser(profile))
      .catch(() => { /* 401 sudah ditangani handler di atas */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isLoading, scrollToBottom]);

  /** Kolom sources/artifacts disimpan sebagai JSON string di database. */
  const parseJsonList = (raw) => {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const loadSession = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setCurrentSessionId(sessionId);
    setIsSidebarOpen(false);
    setError(null);
    try {
      const data = await api.sessionMessages(sessionId);
      setMessages(
        !data || data.length === 0
          ? [buildWelcome(user)]
          : data.map((m) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              sources: parseJsonList(m.sources),
              artifacts: parseJsonList(m.artifacts),
              attachments: parseJsonList(m.attachments),
              created_at: m.created_at,
            })),
      );
    } catch (err) {
      setError({ message: err.message, retry: () => loadSession(sessionId) });
    }
  }, [user]);

  const fetchSessions = useCallback(async (keepCurrentId = false) => {
    if (isGuest) {
      setSessions([]);
      setIsSessionsLoading(false);
      setCurrentSessionId(null);
      setMessages([buildWelcome(user)]);
      return;
    }

    setIsSessionsLoading(true);
    try {
      const data = await api.listSessions();
      setSessions(data || []);
      if (data && data.length > 0) {
        if (!keepCurrentId || !currentSessionId) loadSession(data[0].session_id);
      } else {
        setCurrentSessionId(null);
        setMessages([buildWelcome(user)]);
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError({ message: err.message, retry: () => fetchSessions(keepCurrentId) });
      }
    } finally {
      setIsSessionsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, currentSessionId, loadSession]);

  useEffect(() => {
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.username, user.role]);

  const createNewSession = async () => {
    setError(null);
    setIsSidebarOpen(false);
    if (isGuest) {
      setCurrentSessionId(null);
      setMessages([buildWelcome(user)]);
      return;
    }
    try {
      const data = await api.createSession('Percakapan Baru');
      if (data?.session_id) {
        setSessions((prev) => [data, ...prev]);
        setCurrentSessionId(data.session_id);
        setMessages([buildWelcome(user)]);
      }
    } catch (err) {
      setError({ message: err.message, retry: createNewSession });
    }
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await api.deleteSession(sessionId);
    } catch (err) {
      setError({ message: err.message });
      return;
    }
    const remaining = sessions.filter((s) => s.session_id !== sessionId);
    setSessions(remaining);
    if (currentSessionId === sessionId) {
      if (remaining.length > 0) {
        loadSession(remaining[0].session_id);
      } else {
        setCurrentSessionId(null);
        setMessages([buildWelcome(user)]);
      }
    }
  };

  const startRenameSession = (e, session) => {
    e.stopPropagation();
    setEditingSessionId(session.session_id || session.id);
    setEditingTitle(session.title || 'Percakapan SAP');
  };

  const cancelRenameSession = (e) => {
    if (e) e.stopPropagation();
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const saveRenameSession = async (e, sessionId) => {
    if (e) e.stopPropagation();
    const cleanTitle = editingTitle.trim();
    if (!cleanTitle) {
      cancelRenameSession();
      return;
    }
    try {
      await api.renameSession(sessionId, cleanTitle);
      setSessions((prev) =>
        prev.map((s) =>
          (s.session_id === sessionId || s.id === sessionId) ? { ...s, title: cleanTitle } : s
        )
      );
    } catch (err) {
      setError({ message: err.message });
    } finally {
      setEditingSessionId(null);
      setEditingTitle('');
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setProgress(null);
  };

  const handleSendMessage = async (text, attachments = []) => {
    const outgoing = [...messages, {
      role: 'user',
      content: text,
      attachments,
      created_at: new Date().toISOString(),
    }];
    setMessages(outgoing);
    setIsLoading(true);
    setError(null);
    setProgress({ stage: 'connecting', label: 'Menyiapkan permintaan…', step: 0, max_steps: 6 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages
        .filter((m) => !m.isWelcome)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

      const data = await chatWithProgress(
        {
          message: text,
          history,
          session_id: currentSessionId,
          active_server: activeServer,
          attachment_ids: attachments.map((a) => a.upload_id),
        },
        {
          signal: controller.signal,
          onProgress: (event) => setProgress(event),
        },
      );

      setMessages([...outgoing, {
        role: 'assistant',
        content: data.reply,
        sources: data.sources || [],
        artifacts: data.artifacts || [],
        created_at: new Date().toISOString(),
      }]);

      if (data.session_id) setCurrentSessionId(data.session_id);
      if (!isGuest) fetchSessions(true);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages([...outgoing, { role: 'assistant', content: '_Permintaan dibatalkan._' }]);
        return;
      }
      // Kuota tamu habis: arahkan ke login, bukan tampilkan error mentah.
      if (err instanceof ApiError && err.status === 429) {
        setMessages(messages);
        setCustomLoginMsg(err.message);
        setIsLoginModalOpen(true);
        return;
      }
      setMessages(outgoing);
      setError({ message: err.message, retry: () => { setMessages(messages); handleSendMessage(text); } });
    } finally {
      abortRef.current = null;
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleLoginSuccess = ({ access_token: token, ...userData }) => {
    saveSession(token, userData);
    setUser(userData);
    setIsLoginModalOpen(false);
    setCustomLoginMsg('');
    setError(null);
  };

  const handleLogout = () => {
    clearSession();
    setUser(GUEST_USER);
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([buildWelcome(user)]);
  };

  // Peringatan bila target yang dipilih adalah sistem SAP produksi.
  const selectedServer = sapSubServers.find((s) => `sap:${aliasOf(s)}` === activeServer);
  const isProductionTarget = Boolean(selectedServer?.production_warning);

  const ThemeIcon = THEME_ICON[theme];

  return (
    <div className="fixed inset-0 h-full h-[100dvh] w-full flex bg-surface text-content overflow-hidden font-sans select-none overscroll-none">

      {/* Latar gelap untuk drawer sidebar di layar sempit */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
        className={`fixed md:static inset-y-0 left-0 w-72 max-w-[85vw] bg-surface-raised/95 backdrop-blur-xl border-r border-line
          flex flex-col z-40 shrink-0 transition-transform duration-200 pt-safe
          ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}
        aria-label="Navigasi percakapan"
      >
        <div className="p-3.5 sm:p-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-accent flex items-center justify-center shadow-md text-accent-fg">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-extrabold tracking-tight font-display text-content">SAP AI Co-Pilot</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-[11px] sm:text-xs text-content-muted">Siap membantu</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-content-muted hover:bg-surface-hover"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2.5 sm:p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3.5 bg-accent hover:bg-accent-hover text-accent-fg rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-colors active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>Chat Baru</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 sm:px-3 space-y-1.5 py-1 overscroll-contain" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }} aria-label="Riwayat percakapan">
          <h2 className="px-2 py-1 text-[11px] sm:text-xs font-semibold text-content-muted">
            Riwayat percakapan
          </h2>

          {isSessionsLoading ? (
            <div className="space-y-2 p-2" aria-busy="true" aria-label="Memuat riwayat">
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse" />
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse w-4/5" />
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse w-3/4" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center py-6 sm:py-8 text-xs text-content-subtle">
              {isGuest ? 'Login untuk menyimpan riwayat percakapan' : 'Belum ada percakapan'}
            </p>
          ) : (
            sessions.map((session) => {
              const sid = session.session_id || session.id;
              const isActive = sid === currentSessionId;
              const isEditing = sid === editingSessionId;

              if (isEditing) {
                return (
                  <div
                    key={sid}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-surface-raised border border-accent/50 shadow-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRenameSession(e, sid);
                        if (e.key === 'Escape') cancelRenameSession(e);
                      }}
                      autoFocus
                      maxLength={100}
                      className="flex-1 min-w-0 bg-transparent text-xs text-content font-medium px-1.5 py-0.5 focus:outline-none"
                    />
                    <button
                      onClick={(e) => saveRenameSession(e, sid)}
                      className="p-1 text-accent hover:bg-surface-hover rounded-md transition-colors"
                      title="Simpan"
                      aria-label="Simpan perubahan nama percakapan"
                    >
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => cancelRenameSession(e)}
                      className="p-1 text-content-subtle hover:bg-surface-hover rounded-md transition-colors"
                      title="Batal"
                      aria-label="Batal ubah nama"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={sid}
                  className={`group relative flex items-center justify-between rounded-xl text-xs transition-colors ${
                    isActive
                      ? 'bg-accent-soft text-accent-soft-fg font-semibold border border-accent/30'
                      : 'text-content-muted hover:bg-surface-hover hover:text-content'
                  }`}
                >
                  <button
                    onClick={() => loadSession(sid)}
                    className="flex items-center gap-2 truncate flex-1 text-left px-2.5 sm:px-3 py-2 sm:py-2.5"
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{session.title || 'Percakapan SAP'}</span>
                  </button>
                  <div className="flex items-center gap-0.5 pr-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRenameSession(e, session)}
                      className="p-1 text-content-subtle hover:text-accent rounded-lg transition-colors"
                      title="Ubah nama percakapan"
                      aria-label={`Ubah nama percakapan ${session.title || ''}`}
                    >
                      <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => deleteSession(e, sid)}
                      className="p-1 text-content-subtle hover:text-danger rounded-lg transition-colors"
                      title="Hapus percakapan"
                      aria-label={`Hapus percakapan ${session.title || ''}`}
                    >
                      <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </nav>

        <div className="p-2.5 sm:p-3 border-t border-line bg-surface-sunken pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {user.role === 'superadmin' && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-warning-soft border border-warning/40 text-warning hover:brightness-110 transition-all mb-2"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                Admin Dashboard
              </span>
              <span className="text-[10px] bg-warning text-surface px-1.5 py-0.5 rounded font-bold">SUPER</span>
            </button>
          )}

          <div className="flex items-center justify-between bg-surface-raised p-2.5 rounded-2xl border border-line">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold text-xs shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate text-content">
                  {user.full_name || user.username}
                </div>
                <div className="text-xs text-content-muted">
                  {user.role === 'superadmin' ? 'Administrator' : user.role === 'guest' ? 'Tamu' : 'Pengguna'}
                </div>
              </div>
            </div>

            {isGuest ? (
              <button
                onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
                className="p-1.5 bg-accent-soft text-accent-soft-fg rounded-xl hover:brightness-95 transition-all"
                aria-label="Login ke akun SAP"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="p-1.5 text-content-subtle hover:text-danger rounded-xl hover:bg-surface-hover transition-colors"
                aria-label="Keluar dari akun"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ================= AREA CHAT UTAMA ================= */}
      <main className="flex-1 flex flex-col h-full bg-surface relative overflow-hidden min-w-0">

        <header className="pt-safe bg-surface-raised/80 backdrop-blur-xl border-b border-line z-10 shrink-0">
          <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl text-content-muted hover:bg-surface-hover shrink-0"
                aria-label="Buka menu percakapan"
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>

              <label htmlFor="sap-target" className="hidden sm:block text-sm text-content-muted shrink-0">
                Sistem SAP
              </label>
              {sapSubServers.length > 0 ? (
                <select
                  id="sap-target"
                  value={activeServer}
                  onChange={(e) => handleServerChange(e.target.value)}
                  className={`bg-surface-sunken text-content text-sm font-medium py-2 px-3 rounded-xl border cursor-pointer max-w-[15rem] sm:max-w-[17rem] truncate ${
                    isProductionTarget ? 'border-danger text-danger' : 'border-line'
                  }`}
                >
                  {sapSubServers.map((srv) => (
                    <option key={srv.number ?? aliasOf(srv)} value={`sap:${aliasOf(srv)}`}>
                      {srv.name}{srv.production_warning ? ' — PRODUKSI' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-content-subtle">Menghubungkan…</span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
                aria-label="Buka pengaturan"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={cycleTheme}
                className="p-2 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
                aria-label={`${THEME_LABEL[theme]} — klik untuk mengganti tema`}
                title={THEME_LABEL[theme]}
              >
                <ThemeIcon className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {/* Peringatan target produksi: query di sini menyentuh data SAP sungguhan. */}
        {isProductionTarget && (
          <div
            role="alert"
            className="bg-danger-soft border-b border-danger/40 px-4 sm:px-6 py-2 flex items-center gap-2 text-xs font-semibold text-danger shrink-0"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="leading-snug">
              Anda terhubung ke sistem <strong>PRODUKSI</strong> ({selectedServer?.name}). Setiap permintaan
              dijalankan terhadap data perusahaan yang sesungguhnya.
            </span>
          </div>
        )}

        {isGuest && (
          <div className="bg-warning-soft border-b border-warning/30 px-3.5 sm:px-6 py-2 flex items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-warning min-w-0">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="leading-tight">
                Mode tamu dibatasi beberapa prompt per hari. Login untuk akses penuh dan riwayat tersimpan.
              </span>
            </div>
            <button
              onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
              className="text-xs font-bold bg-warning text-surface px-3 py-1.5 rounded-lg shrink-0 shadow-xs hover:brightness-110 active:scale-95 transition-all"
            >
              Login
            </button>
          </div>
        )}

        {/* Error ditampilkan sebagai komponen tersendiri, bukan gelembung chat palsu. */}
        {error && (
          <div
            role="alert"
            className="bg-danger-soft border-b border-danger/40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-danger min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{error.message}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {error.retry && (
                <button onClick={() => { const r = error.retry; setError(null); r(); }}
                  className="text-xs font-bold bg-danger text-surface px-3 py-1 rounded-lg">
                  Coba lagi
                </button>
              )}
              <button onClick={() => setError(null)} className="p-1 text-danger" aria-label="Tutup pesan kesalahan">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 sm:px-8 py-4 sm:py-8 overscroll-contain" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
            {messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}

            {isLoading && (
              <ThinkingIndicator progress={progress} onStop={stopGeneration} />
            )}

            {messages.length <= 1 && !isLoading && (
              <div className="pt-8 pb-4">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center p-3 bg-accent-soft rounded-2xl text-accent-soft-fg mb-3">
                    <Cpu className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-content font-display">Mulai dari sini</h3>
                  <p className="text-sm text-content-muted mt-1.5">
                    Pilih salah satu contoh, atau tulis pertanyaan Anda sendiri di bawah
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SUGGESTIONS.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.title}
                        onClick={() => handleSendMessage(item.query)}
                        className="flex flex-col text-left p-5 rounded-2xl bg-surface-raised hover:border-accent border border-line shadow-xs hover:shadow-md transition-all group active:scale-[0.99]"
                      >
                        <span className="p-2.5 w-fit rounded-xl bg-surface-sunken text-content-secondary group-hover:bg-accent-soft group-hover:text-accent-soft-fg transition-colors mb-3.5">
                          <IconComp className="w-5 h-5" aria-hidden="true" />
                        </span>
                        <span className="text-sm font-bold text-content group-hover:text-accent transition-colors">
                          {item.title}
                        </span>
                        <span className="text-xs text-content-muted mt-1.5 leading-relaxed">{item.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        </div>

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>

      {/* Modals */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onLoginSuccess={handleLoginSuccess}
        customMessage={customLoginMsg}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />

      <AdminDashboard
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        user={user}
        onRefreshMcpServers={fetchServers}
      />
    </div>
  );
};

export default ChatLayout;
