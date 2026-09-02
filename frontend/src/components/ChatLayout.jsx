import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, Check, ChevronRight, Code, Cpu, Database, FileSpreadsheet, Layers, Loader2, LogIn, LogOut, Menu, MessageSquare, Monitor, Moon, Package, Pencil, Plus, RefreshCw, Search, Settings, ShieldAlert, ShieldCheck, Sparkles, Sun, Trash2, TrendingUp, X, Zap,
} from 'lucide-react';

import AdminDashboard from './AdminDashboard';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ConfirmModal from './ConfirmModal';
import LoginModal from './LoginModal';
import SettingsModal from './SettingsModal';
import QuotaBanner, { QuotaChip } from './QuotaBanner';
import SidePanel from './SidePanel';
import ThinkingIndicator from './ThinkingIndicator';
import { useTheme } from '../hooks/useTheme';
import { useCompactLandscape } from '../hooks/useViewport';
import { useLanguage } from '../hooks/useLanguage';
import {
  api, ApiError, chatWithProgress, clearSession, getStoredUser, saveSession, setUnauthorizedHandler,
} from '../lib/api';

const GUEST_USER = { username: 'Guest', role: 'guest' };

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };

const SUGGESTION_ICONS = {
  Layers,
  Search,
  FileSpreadsheet,
  Code,
  Database,
  Package,
  TrendingUp,
  Zap,
  Shield: ShieldCheck,
  Cpu,
};

const groupSessionsByDate = (sessionsList, t) => {
  const groups = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 86400000 * 7;

  sessionsList.forEach((s) => {
    const rawDate = s.updated_at || s.created_at;
    const sessionTime = rawDate ? new Date(rawDate).getTime() : 0;

    if (sessionTime >= startOfToday) {
      groups.today.push(s);
    } else if (sessionTime >= startOfYesterday) {
      groups.yesterday.push(s);
    } else if (sessionTime >= startOf7Days) {
      groups.last7Days.push(s);
    } else {
      groups.older.push(s);
    }
  });

  return [
    { label: t('sidebar.today'), items: groups.today },
    { label: t('sidebar.yesterday'), items: groups.yesterday },
    { label: t('sidebar.previous7Days'), items: groups.last7Days },
    { label: t('sidebar.older'), items: groups.older },
  ].filter((g) => g.items.length > 0);
};

/**
 * Selama jawaban mengalir, blok ```sap-artifact masih berupa spesifikasi mentah
 * yang baru diubah menjadi berkas di akhir. Menampilkannya hanya membingungkan,
 * jadi bagian itu dipotong sampai jawabannya selesai.
 */
const hidePendingArtifact = (text) => {
  const marker = text.indexOf('```sap-artifact');
  return marker === -1 ? text : text.slice(0, marker).trimEnd();
};

const aliasOf = (srv) => srv?.alias || srv?.aliases?.[0] || srv?.name?.toLowerCase()?.replace(/\s+/g, '-') || srv?.sid?.toLowerCase() || 'default';
const SAP_SERVER_STORAGE_KEY = 'sap_ai_active_server';
const DRAFT_SESSION_KEY = '__draft_new_session__';

const ChatLayout = () => {
  const { t, language } = useLanguage();
  const [user, setUser] = useState(() => getStoredUser() || GUEST_USER);
  const isGuest = user.role === 'guest';

  // Menyimpan riwayat pesan per session id agar independen & multi-chat
  const [messagesMap, setMessagesMap] = useState(() => ({
    [DRAFT_SESSION_KEY]: [],
  }));

  // Status loading, progress, error, dan controller per session
  const [sessionLoadingMap, setSessionLoadingMap] = useState({});
  const [sessionProgressMap, setSessionProgressMap] = useState({});
  // Teks jawaban yang sedang mengalir, per sesi.
  const [sessionStreamMap, setSessionStreamMap] = useState({});
  const [sessionQuery, setSessionQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionErrorMap, setSessionErrorMap] = useState({});
  const abortControllersRef = useRef({});

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
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
  const [modesList, setModesList] = useState([]);
  const [chatModesEnabled, setChatModesEnabled] = useState(true);
  const [selectedMode, setSelectedMode] = useState(() => {
    try {
      return localStorage.getItem('sap_chat_mode') || '';
    } catch {
      return '';
    }
  });

  const [dynamicSuggestions, setDynamicSuggestions] = useState(null);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customLoginMsg, setCustomLoginMsg] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Isi panel samping (kode/dokumen panjang), null bila panel tertutup.
  const [isiPanel, setIsiPanel] = useState(null);
  const [kuota, setKuota] = useState(null);

  // State untuk konfirmasi popup logout & hapus percakapan
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [deleteConfirmState, setDeleteConfirmState] = useState({
    isOpen: false,
    sessionId: null,
    title: '',
    isLoading: false,
  });

  const { theme, cycleTheme } = useTheme();
  // Ponsel dalam posisi landscape: lebarnya lolos breakpoint `md`, tetapi
  // tingginya tidak cukup untuk sidebar permanen — kembalikan ke mode drawer.
  const compactLandscape = useCompactLandscape();

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const messagesContentRef = useRef(null);
  // Apakah pengguna sedang mengikuti di dasar percakapan.
  const mengikutiDasarRef = useRef(true);

  // Key aktif untuk session yang sedang dibuka
  const activeSessionKey = currentSessionId || DRAFT_SESSION_KEY;
  const currentMessages = messagesMap[activeSessionKey] || [];
  const isCurrentLoading = Boolean(sessionLoadingMap[activeSessionKey]);
  const currentStream = sessionStreamMap[activeSessionKey] || '';
  const currentProgress = sessionProgressMap[activeSessionKey] || null;
  const currentSessionError = sessionErrorMap[activeSessionKey] || null;

  // Identitas fungsi ini dijaga tetap sama: ia mengalir sampai ke peta
  // komponen markdown, dan perubahan identitasnya akan memicu render ulang
  // seluruh isi pesan pada tiap render.
  const bukaPanel = useCallback((isi) => setIsiPanel(isi), []);
  const tutupPanel = useCallback(() => setIsiPanel(null), []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  /** Pengguna dianggap "mengikuti" jawaban bila posisinya dekat dasar. */
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // --- Sesi berakhir di sisi server: kembalikan UI ke mode tamu ---
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(GUEST_USER);
      setSessions([]);
      setCurrentSessionId(null);
      setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
      setSessionLoadingMap({});
      setSessionProgressMap({});
      setSessionErrorMap({});
      setCustomLoginMsg(t('login.sessionExpired'));
      setIsLoginModalOpen(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [t]);

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

  const fetchModes = useCallback(async () => {
    try {
      const data = await api.getModes();
      const isMasterEnabled = data?.chat_modes_enabled !== false;
      setChatModesEnabled(isMasterEnabled);
      const list = data?.modes || [];
      setModesList(list);
      setSelectedMode((current) => {
        const availableModes = list.filter((m) => m.available);
        if (availableModes.length === 0) return '';
        const found = availableModes.find((m) => m.code === current);
        if (found) return current;
        const def = availableModes.find((m) => m.is_default) || availableModes[0];
        return def?.code || '';
      });
    } catch (e) {
      console.error('Gagal memuat mode percakapan:', e);
    }
  }, []);

  useEffect(() => {
    fetchServers();
    fetchModes();
  }, [fetchServers, fetchModes]);

  // Validasi token tersimpan saat aplikasi dibuka: profil bisa saja sudah
  // diubah atau dihapus admin sejak login terakhir.
  useEffect(() => {
    fetchModes();
    if (isGuest) return;
    api.quotaSaya().then(setKuota).catch(() => setKuota(null));
    api.me()
      .then((profile) => setUser(profile))
      .catch(() => { /* 401 sudah ditangani handler di atas */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  useEffect(() => {
    scrollToBottom(true);
  }, [currentMessages, isCurrentLoading, scrollToBottom]);

  // Jawaban yang mengalir menggeser layar hanya bila pengguna memang sedang
  // mengikuti di dasar — kalau ia menggulir ke atas untuk membaca ulang,
  // jangan ditarik kembali. Tanpa animasi agar tidak tersendat per token.
  useEffect(() => {
    if (currentStream && isNearBottom()) scrollToBottom(false);
  }, [currentStream, isNearBottom, scrollToBottom]);

  /**
   * Pertahankan posisi di dasar ketika tinggi isi bertambah SETELAH digulir.
   *
   * Sebagian isi baru selesai digambar beberapa saat setelah pesan tampil —
   * diagram Mermaid yang paling terasa, karena menambah ratusan piksel. Saat
   * membuka percakapan lama, layar sudah terlanjur digulir ke dasar yang lama,
   * lalu diagramnya muncul dan mendorong pesan terakhir ke bawah layar.
   *
   * Penarikan hanya dilakukan bila pengguna memang sedang berada di dasar;
   * bila ia menggulir ke atas untuk membaca ulang, posisinya dibiarkan.
   */
  useEffect(() => {
    const wadah = scrollContainerRef.current;
    const isi = messagesContentRef.current;
    if (!wadah || !isi || typeof ResizeObserver === 'undefined') return undefined;

    const catatPosisi = () => { mengikutiDasarRef.current = isNearBottom(); };
    wadah.addEventListener('scroll', catatPosisi, { passive: true });

    const pengamat = new ResizeObserver(() => {
      if (mengikutiDasarRef.current) scrollToBottom(false);
    });
    pengamat.observe(isi);

    return () => {
      wadah.removeEventListener('scroll', catatPosisi);
      pengamat.disconnect();
    };
  }, [isNearBottom, scrollToBottom]);

  // Membuka percakapan lain berarti mulai membaca dari dasarnya lagi.
  useEffect(() => {
    mengikutiDasarRef.current = true;
  }, [activeSessionKey]);

  // Pencarian riwayat. Ditunda sesaat supaya tidak memanggil server pada
  // setiap ketukan tombol, dan hasil yang basi diabaikan bila kata kuncinya
  // sudah berubah sebelum jawabannya tiba.
  useEffect(() => {
    const term = sessionQuery.trim();
    if (isGuest || term.length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return undefined;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      api.searchSessions(term)
        .then((data) => { if (!cancelled) setSearchResults(data || []); })
        .catch(() => { if (!cancelled) setSearchResults([]); })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionQuery, isGuest]);

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

    // Jika sudah ada pesan di cache dan sedang loading, tetap pertahankan tampilan pesan
    try {
      const data = await api.sessionMessages(sessionId);
      const formatted = !data || data.length === 0
        ? []
        : data.map((m) => ({
            id: m.id,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
            sources: parseJsonList(m.sources),
            artifacts: parseJsonList(m.artifacts),
            attachments: parseJsonList(m.attachments),
            feedback: m.feedback || null,
            created_at: m.created_at,
          }));

      setMessagesMap((prev) => {
        // Jika sedang loading di session ini dan ada pesan user baru yang belum tersimpan ke db
        const existing = prev[sessionId] || [];
        const isSessLoading = sessionLoadingMap[sessionId];
        if (isSessLoading && existing.length > formatted.length) {
          return prev;
        }
        return { ...prev, [sessionId]: formatted };
      });
    } catch (err) {
      setError({ message: err.message, retry: () => loadSession(sessionId) });
    }
  }, [user?.username, sessionLoadingMap]);

  const fetchSessions = useCallback(async (keepCurrentId = false, silent = false) => {
    if (isGuest) {
      setSessions([]);
      setIsSessionsLoading(false);
      setCurrentSessionId(null);
      setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
      return;
    }

    // Penyegaran latar setelah mengirim pesan tidak boleh memunculkan skeleton;
    // daftarnya sudah benar di layar, hanya judul otomatisnya yang menyusul.
    if (!silent) setIsSessionsLoading(true);
    try {
      const data = await api.listSessions();
      setSessions(data || []);
      if (keepCurrentId && currentSessionId) {
        const exists = data?.some((s) => (s.session_id || s.id) === currentSessionId);
        if (!exists) {
          setCurrentSessionId(null);
          setMessagesMap((prev) => ({
            ...prev,
            [DRAFT_SESSION_KEY]: [],
          }));
        }
      } else if (!keepCurrentId) {
        // Saat pertama kali login atau refresh, selalu tampilkan New Chat bersih
        setCurrentSessionId(null);
        setMessagesMap({
          [DRAFT_SESSION_KEY]: [],
        });
      }
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError({ message: err.message, retry: () => fetchSessions(keepCurrentId) });
      }
    } finally {
      if (!silent) setIsSessionsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, currentSessionId]);

  const recoverBackgroundMessage = useCallback(async (sessionId, maxAttempts = 15) => {
    if (!sessionId || isGuest) return false;
    setSessionLoadingMap((prev) => ({ ...prev, [sessionId]: true }));
    setSessionProgressMap((prev) => ({
      ...prev,
      [sessionId]: {
        stage: 'reconnecting',
        label: language === 'en' ? 'Reconnecting to fetch response…' : 'Menghubungkan kembali mengambil jawaban…',
        step: 0,
        max_steps: 1,
      },
    }));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await api.sessionMessages(sessionId);
        if (Array.isArray(data) && data.length > 0) {
          const lastMsg = data[data.length - 1];
          if (lastMsg.role === 'ai' || lastMsg.role === 'assistant') {
            const formatted = data.map((m) => ({
              id: m.id,
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
              sources: parseJsonList(m.sources),
              artifacts: parseJsonList(m.artifacts),
              attachments: parseJsonList(m.attachments),
              feedback: m.feedback || null,
              created_at: m.created_at,
            }));
            setMessagesMap((prev) => ({ ...prev, [sessionId]: formatted }));
            setSessionLoadingMap((prev) => ({ ...prev, [sessionId]: false }));
            setSessionProgressMap((prev) => ({ ...prev, [sessionId]: null }));
            setSessionErrorMap((prev) => ({ ...prev, [sessionId]: null }));
            setSessionStreamMap((prev) => ({ ...prev, [sessionId]: '' }));
            fetchSessions(true, true);
            return true;
          }
        }
      } catch (e) {
        console.warn('Gagal memulihkan pesan background:', e);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return false;
  }, [isGuest, language, fetchSessions]);

  const loadSuggestions = useCallback(async (force = false) => {
    setIsSuggestionsLoading(true);
    try {
      const res = await api.getSuggestions(language, force);
      if (res?.suggestions && Array.isArray(res.suggestions) && res.suggestions.length >= 3) {
        setDynamicSuggestions(res.suggestions);
      } else {
        setDynamicSuggestions(null);
      }
    } catch (err) {
      console.warn('Gagal memuat saran dinamis LLM, fallback ke default:', err);
      setDynamicSuggestions(null);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    loadSuggestions();
  }, [user.username, user.role, language, loadSuggestions]);

  useEffect(() => {
    setSessions([]);
    setCurrentSessionId(null);
    setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
    setSessionLoadingMap({});
    setSessionProgressMap({});
    setSessionErrorMap({});
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.username, user.role]);

  // Sinkronisasi multi-tab: jika akun berubah di tab browser lain, update tab ini
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'sap_assistant_token' || e.key === 'sap_assistant_user') {
        const currentUser = getStoredUser() || GUEST_USER;
        setUser(currentUser);
        setSessions([]);
        setCurrentSessionId(null);
        setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
        setSessionLoadingMap({});
        setSessionProgressMap({});
        setSessionErrorMap({});
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // ZERO-RELOAD AUTO-LOGIN LISTENER
    // Terima instruksi login langsung dari Dashboard PWA tanpa reload
    const handleDashboardMessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'AUTO_LOGIN_EXECUTE' && e.data.creds) {
        const { username, password } = e.data.creds;
        const currentUser = getStoredUser();
        // Hanya login jika belum ada sesi aktif
        if ((!currentUser || currentUser.role === 'guest') && username && password) {
          api.login(username, password)
            .then(data => {
              if (data && data.access_token) {
                // Simpan token & user
                const userData = {
                  username: data.username,
                  full_name: data.full_name || '',
                  role: data.role,
                  assistant_persona: data.assistant_persona
                };
                saveSession(data.access_token, userData);
                
                // Update React State tanpa reload!
                setUser(userData);
                setSessions([]);
                setCurrentSessionId(null);
                setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
                setSessionLoadingMap({});
                setSessionProgressMap({});
                setSessionErrorMap({});
                api.quotaSaya().then(setKuota).catch(() => setKuota(null));
                setIsLoginModalOpen(false);
                setCustomLoginMsg('');
                setError(null);
              }
            })
            .catch(err => console.error('Dashboard Auto-Login React Error:', err));
        }
      }
    };
    window.addEventListener('message', handleDashboardMessage);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('message', handleDashboardMessage);
    };
  }, []);

  // Sinkronkan kembali percakapan saat aplikasi dibuka kembali dari background/minimize di HP
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isGuest && currentSessionId) {
        if (sessionLoadingMap[currentSessionId]) {
          recoverBackgroundMessage(currentSessionId, 6);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isGuest, currentSessionId, sessionLoadingMap, recoverBackgroundMessage]);

  const createNewSession = () => {
    setError(null);
    setIsSidebarOpen(false);
    setCurrentSessionId(null);
    setMessagesMap((prev) => ({
      ...prev,
      [DRAFT_SESSION_KEY]: [],
    }));
    setSessionLoadingMap((prev) => ({
      ...prev,
      [DRAFT_SESSION_KEY]: false,
    }));
    setSessionProgressMap((prev) => ({
      ...prev,
      [DRAFT_SESSION_KEY]: null,
    }));
    setSessionErrorMap((prev) => ({
      ...prev,
      [DRAFT_SESSION_KEY]: null,
    }));
    loadSuggestions(true);
  };

  const promptDeleteSession = (e, session) => {
    e.stopPropagation();
    const sid = session.session_id || session.id;
    setDeleteConfirmState({
      isOpen: true,
      sessionId: sid,
      title: session.title || (language === 'en' ? 'SAP Conversation' : 'Percakapan SAP'),
      isLoading: false,
    });
  };

  const handleConfirmDeleteSession = async () => {
    const sessionId = deleteConfirmState.sessionId;
    if (!sessionId) return;

    setDeleteConfirmState((prev) => ({ ...prev, isLoading: true }));
    try {
      await api.deleteSession(sessionId);
    } catch (err) {
      setError({ message: err.message });
      setDeleteConfirmState({ isOpen: false, sessionId: null, title: '', isLoading: false });
      return;
    }

    const remaining = sessions.filter((s) => (s.session_id || s.id) !== sessionId);
    setSessions(remaining);

    // Bersihkan state & abort jika ada proses aktif di session yang dihapus
    if (abortControllersRef.current[sessionId]) {
      abortControllersRef.current[sessionId].abort();
      delete abortControllersRef.current[sessionId];
    }
    setMessagesMap((prev) => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
    setSessionLoadingMap((prev) => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
    setSessionProgressMap((prev) => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
    setSessionErrorMap((prev) => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });

    if (currentSessionId === sessionId) {
      if (remaining.length > 0) {
        loadSession(remaining[0].session_id || remaining[0].id);
      } else {
        setCurrentSessionId(null);
        setMessagesMap((prev) => ({
          ...prev,
          [DRAFT_SESSION_KEY]: [],
        }));
      }
    }

    setDeleteConfirmState({ isOpen: false, sessionId: null, title: '', isLoading: false });
  };

  const startRenameSession = (e, session) => {
    e.stopPropagation();
    setEditingSessionId(session.session_id || session.id);
    setEditingTitle(session.title || (language === 'en' ? 'SAP Conversation' : 'Percakapan SAP'));
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

  const stopGeneration = (targetSessionKey = activeSessionKey) => {
    const controller = abortControllersRef.current[targetSessionKey];
    if (controller) {
      controller.abort();
      delete abortControllersRef.current[targetSessionKey];
    }
    setSessionLoadingMap((prev) => ({ ...prev, [targetSessionKey]: false }));
    setSessionProgressMap((prev) => ({ ...prev, [targetSessionKey]: null }));
  };

  /**
   * `baseMessages` memaksa titik awal percakapan, dipakai oleh "buat ulang" dan
   * "edit pertanyaan". Tanpa itu fungsi ini membaca `messagesMap` dari closure
   * render saat ini — yang masih memuat pesan yang baru saja dipotong, sehingga
   * jawaban lama muncul kembali alih-alih tergantikan.
   */
  const handleSendMessage = async (text, attachments = [], baseMessages = null) => {
    let targetSessionId = currentSessionId;
    // Jika user terdaftar dan belum ada session aktif, buat session lebih dulu agar id-nya diketahui
    if (!isGuest && !targetSessionId) {
      try {
        const title = text.trim().slice(0, 40) || (language === 'en' ? 'New Conversation' : 'Percakapan Baru');
        const newSess = await api.createSession(title);
        if (newSess?.session_id) {
          targetSessionId = newSess.session_id;
          setCurrentSessionId(targetSessionId);
          fetchSessions(true, true);
        }
      } catch (err) {
        console.warn('Pre-create session failed, backend will auto-create session:', err);
      }
    }

    const targetKey = targetSessionId || DRAFT_SESSION_KEY;

    const prevMessages = baseMessages ?? (messagesMap[targetKey] || []);
    const outgoing = [...prevMessages, {
      role: 'user',
      content: text,
      attachments,
      created_at: new Date().toISOString(),
    }];

    setMessagesMap((prev) => ({
      ...prev,
      [targetKey]: outgoing,
    }));
    setSessionLoadingMap((prev) => ({ ...prev, [targetKey]: true }));
    setSessionProgressMap((prev) => ({
      ...prev,
      [targetKey]: { stage: 'connecting', label: 'Menyiapkan permintaan…', step: 0, max_steps: 6 },
    }));
    setSessionErrorMap((prev) => ({ ...prev, [targetKey]: null }));
    setSessionStreamMap((prev) => ({ ...prev, [targetKey]: '' }));

    const controller = new AbortController();
    abortControllersRef.current[targetKey] = controller;

    try {
      const history = prevMessages
        .filter((m) => !m.isWelcome)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

      const data = await chatWithProgress(
        {
          message: text,
          history,
          session_id: targetSessionId,
          active_server: activeServer,
          attachment_ids: attachments.map((a) => a.upload_id),
          mode: selectedMode || undefined,
        },
        {
          signal: controller.signal,
          onProgress: (event) => {
            setSessionProgressMap((prev) => ({ ...prev, [targetKey]: event }));
          },
          onToken: (chunk) => {
            setSessionStreamMap((prev) => ({
              ...prev,
              // `null` berarti server membatalkan teks yang sudah mengalir.
              [targetKey]: chunk === null ? '' : (prev[targetKey] || '') + chunk,
            }));
          },
        },
      );

      const assistantMsg = {
        id: data.message_id,
        role: 'assistant',
        content: data.reply,
        sources: data.sources || [],
        artifacts: data.artifacts || [],
        feedback: null,
        usage: data.usage || null,
        created_at: new Date().toISOString(),
      };

      const finalSessionId = data.session_id || targetSessionId;

      // Sesi yang baru saja dipakai harus pindah ke urutan teratas — termasuk
      // percakapan lama yang dilanjutkan hari ini. Diperbarui langsung di sini
      // supaya tidak perlu menunggu daftar sesi dimuat ulang dari server.
      if (finalSessionId) {
        const now = new Date().toISOString();
        setSessions((prev) =>
          prev
            .map((sess) =>
              (sess.session_id || sess.id) === finalSessionId
                ? { ...sess, updated_at: now }
                : sess,
            )
            .sort((a, b) =>
              new Date(b.updated_at || b.created_at || 0) -
              new Date(a.updated_at || a.created_at || 0),
            ),
        );
      }

      setMessagesMap((prev) => {
        // `outgoing` adalah kebenaran untuk pengiriman ini; isi map hanya dipakai
        // bila ada pesan lain yang menyusul selama permintaan berjalan.
        const cached = prev[targetKey] || [];
        const existingOutgoing = cached.length > outgoing.length ? cached : outgoing;
        // Sematkan id pesan pengguna dari server agar tombol "edit pertanyaan"
        // tahu dari mana riwayat harus dipotong.
        const withIds = existingOutgoing.map((m, i) =>
          i === existingOutgoing.length - 1 && m.role === 'user' && data.user_message_id
            ? { ...m, id: data.user_message_id }
            : m,
        );
        const updated = [...withIds, assistantMsg];
        if (finalSessionId && finalSessionId !== targetKey) {
          const nextMap = { ...prev, [finalSessionId]: updated };
          if (targetKey === DRAFT_SESSION_KEY) {
            delete nextMap[DRAFT_SESSION_KEY];
          }
          return nextMap;
        }
        return { ...prev, [targetKey]: updated };
      });

      if (data.session_id && !targetSessionId) {
        setCurrentSessionId(data.session_id);
      }
      if (data.quota) setKuota(data.quota);
      if (!isGuest) fetchSessions(true, true);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessagesMap((prev) => ({
          ...prev,
          [targetKey]: [...(prev[targetKey] || outgoing), { role: 'assistant', content: language === 'en' ? '_Request cancelled._' : '_Permintaan dibatalkan._' }],
        }));
        return;
      }
      // Kuota tamu habis: arahkan ke login, bukan tampilkan error mentah.
      // Pengguna yang sudah masuk tidak dibantu modal login — kuotanya yang
      // habis, bukan sesinya. Angka pada banner disegarkan supaya cocok.
      if (err instanceof ApiError && err.status === 429) {
        setMessagesMap((prev) => ({ ...prev, [targetKey]: prevMessages }));
        if (isGuest) {
          setCustomLoginMsg(t('login.guestLimitReached'));
          setIsLoginModalOpen(true);
        } else {
          api.quotaSaya().then(setKuota).catch(() => {});
          setSessionErrorMap((prev) => ({ ...prev, [targetKey]: { message: err.message } }));
        }
        return;
      }

      // Bila koneksi terputus (mis. browser HP di-minimize atau sinyal hilang),
      // periksa apakah server tetap menyelesaikan respon di background dan simpan ke database.
      if (!isGuest && targetSessionId) {
        const recovered = await recoverBackgroundMessage(targetSessionId);
        if (recovered) return;
      }

      setMessagesMap((prev) => ({ ...prev, [targetKey]: outgoing }));
      setSessionErrorMap((prev) => ({
        ...prev,
        [targetKey]: { message: err.message, retry: () => { setMessagesMap((p) => ({ ...p, [targetKey]: prevMessages })); handleSendMessage(text, attachments, prevMessages); } },
      }));
    } finally {
      delete abortControllersRef.current[targetKey];
      setSessionLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
      setSessionProgressMap((prev) => ({ ...prev, [targetKey]: null }));
      setSessionStreamMap((prev) => ({ ...prev, [targetKey]: '' }));
    }
  };

  /**
   * Buat ulang jawaban terakhir.
   *
   * Jawaban lama dihapus di server lebih dulu; bila tidak, riwayat yang dikirim
   * ke model akan memuat dua versi jawaban untuk satu pertanyaan yang sama.
   */
  const handleRegenerate = async () => {
    const messages = messagesMap[activeSessionKey] || [];
    const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex < 1) return;

    const lastUser = messages[lastAssistantIndex - 1];
    if (!lastUser || lastUser.role !== 'user') return;

    // Dipotong mulai dari PERTANYAANNYA, bukan dari jawabannya: pertanyaan itu
    // dikirim ulang di bawah dan akan tersimpan lagi, sehingga bila yang lama
    // dibiarkan, satu pertanyaan tercatat dua kali di riwayat.
    const cutFrom = lastUser.id || messages[lastAssistantIndex].id;
    if (cutFrom && !isGuest) {
      try {
        await api.truncateFromMessage(cutFrom);
      } catch (err) {
        setSessionErrorMap((prev) => ({
          ...prev,
          [activeSessionKey]: { message: language === 'en' ? `Failed to prepare regenerate: ${err.message}` : `Gagal menyiapkan pembuatan ulang: ${err.message}` },
        }));
        return;
      }
    }

    // Pertanyaannya sendiri tetap tersimpan; yang dikirim ulang hanya jawabannya.
    const base = messages.slice(0, lastAssistantIndex - 1);
    setMessagesMap((prev) => ({ ...prev, [activeSessionKey]: base }));
    await handleSendMessage(lastUser.content, lastUser.attachments || [], base);
  };

  /**
   * Ubah sebuah pertanyaan lalu kirim ulang. Seluruh percakapan sesudah titik
   * itu ikut dibuang karena sudah tidak lagi menjawab pertanyaan yang sama.
   */
  const handleEditMessage = async (message, newText) => {
    const cleaned = (newText || '').trim();
    if (!cleaned || cleaned === message.content) return;

    const messages = messagesMap[activeSessionKey] || [];
    const index = messages.indexOf(message);
    if (index < 0) return;

    if (message.id && !isGuest) {
      try {
        await api.truncateFromMessage(message.id);
      } catch (err) {
        setSessionErrorMap((prev) => ({
          ...prev,
          [activeSessionKey]: { message: language === 'en' ? `Failed to save changes: ${err.message}` : `Gagal menyimpan perubahan: ${err.message}` },
        }));
        return;
      }
    }

    const base = messages.slice(0, index);
    setMessagesMap((prev) => ({ ...prev, [activeSessionKey]: base }));
    await handleSendMessage(cleaned, message.attachments || [], base);
  };

  const handleLoginSuccess = ({ access_token: token, ...userData }) => {
    saveSession(token, userData);
    setSessions([]);
    setCurrentSessionId(null);
    setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
    setSessionLoadingMap({});
    setSessionProgressMap({});
    setSessionErrorMap({});
    setUser(userData);
    api.quotaSaya().then(setKuota).catch(() => setKuota(null));
    setIsLoginModalOpen(false);
    setCustomLoginMsg('');
    setError(null);
  };

  const handleLogout = () => {
    clearSession();
    setUser(GUEST_USER);
    setSessions([]);
    setCurrentSessionId(null);
    setMessagesMap({ [DRAFT_SESSION_KEY]: [] });
    setSessionLoadingMap({});
    setSessionProgressMap({});
    setSessionErrorMap({});
  };

  // Peringatan bila target yang dipilih adalah sistem SAP produksi.
  const selectedServer = sapSubServers.find((s) => `sap:${aliasOf(s)}` === activeServer) || sapSubServers[0];
  const isProductionTarget = Boolean(
    selectedServer?.production_warning ||
    selectedServer?.name?.toLowerCase()?.includes('prod') ||
    selectedServer?.sid?.toLowerCase()?.includes('prt') ||
    selectedServer?.sid?.toLowerCase()?.includes('trp')
  );

  const ThemeIcon = THEME_ICON[theme];

  return (
    <div className="app-shell fixed inset-0 h-full w-full flex bg-surface text-content overflow-hidden font-sans overscroll-none">

      {/* Latar gelap untuk drawer sidebar di layar sempit */}
      {isSidebarOpen && (
        <div
          className={`fixed inset-0 bg-black/50 z-30 ${compactLandscape ? '' : 'md:hidden'}`}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-surface-raised/95 backdrop-blur-xl border-r border-line
          flex flex-col z-40 shrink-0 transition-transform duration-200 pt-safe overflow-y-auto
          ${compactLandscape ? '' : 'md:static'}
          ${isSidebarOpen
            ? 'translate-x-0 shadow-2xl'
            : `-translate-x-full ${compactLandscape ? '' : 'md:translate-x-0'}`}`}
        aria-label={language === 'en' ? 'Conversation navigation' : 'Navigasi percakapan'}
      >
        <div className="p-3.5 sm:p-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md border border-blue-400/30 shrink-0 overflow-hidden">
              <div className="flex items-center font-black text-[11px] sm:text-xs text-white tracking-tighter">
                <span>SAP</span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 bg-gradient-to-r from-sky-400 to-indigo-500 rounded-tl-md px-1 py-0.2">
                <span className="text-[8px] font-black text-white leading-none tracking-tight">AI</span>
              </div>
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-extrabold tracking-tight font-display text-content flex items-center gap-1.5">
                <span>SAP AI</span>
                <span className="text-[10px] uppercase font-semibold text-accent px-1.5 py-0.5 bg-accent-soft rounded-md">Assistant</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[11px] sm:text-xs text-content-muted">Online</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-content-muted hover:bg-surface-hover cursor-pointer"
            aria-label={t('nav.closeSidebar')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2.5 sm:p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3.5 bg-accent hover:bg-accent-hover text-accent-fg rounded-xl sm:rounded-2xl text-xs font-bold shadow-sm transition-colors active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>{t('sidebar.newChat')}</span>
          </button>

          {!isGuest && (
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-subtle"
                aria-hidden="true"
              />
              <input
                type="search"
                value={sessionQuery}
                onChange={(e) => setSessionQuery(e.target.value)}
                placeholder={t('sidebar.searchSessions')}
                aria-label={t('sidebar.searchSessions')}
                className="w-full rounded-xl border border-line bg-surface-sunken py-2 pr-8 text-xs text-content placeholder:text-content-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                style={{ paddingLeft: '2.125rem' }}
              />
              {sessionQuery && (
                <button
                  type="button"
                  onClick={() => setSessionQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-content-subtle hover:bg-surface-hover hover:text-content cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 sm:px-3 space-y-3 py-2 overscroll-contain" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }} aria-label={t('sidebar.history')}>
          {searchResults !== null ? (
            <div className="space-y-1">
              <h2 className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                {isSearching
                  ? t('common.loading')
                  : `${searchResults.length} results for "${sessionQuery.trim()}"`}
              </h2>
              {!isSearching && searchResults.length === 0 && (
                <p className="py-6 text-center text-xs text-content-subtle">
                  {t('sidebar.noSessions')}
                </p>
              )}
              {searchResults.map((hit) => (
                <button
                  key={hit.session_id}
                  onClick={() => {
                    setSessionQuery('');
                    loadSession(hit.session_id);
                    setIsSidebarOpen(false);
                  }}
                  className="w-full rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-surface-hover cursor-pointer"
                >
                  <span className="block truncate text-xs font-semibold text-content">
                    {hit.title || 'SAP Chat'}
                  </span>
                  {hit.snippet && (
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-content-muted">
                      {hit.snippet}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : isSessionsLoading ? (
            <div className="space-y-2 p-2" aria-busy="true" aria-label="Loading sessions">
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse" />
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse w-4/5" />
              <div className="h-8 sm:h-9 bg-surface-sunken rounded-xl animate-pulse w-3/4" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center py-6 sm:py-8 text-xs text-content-subtle">
              {isGuest ? t('sidebar.guestDesc') : t('sidebar.noSessions')}
            </p>
          ) : (
            groupSessionsByDate(sessions, t).map((group) => (
              <div key={group.label} className="space-y-1">
                <h2 className="px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-content-subtle uppercase">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((session) => {
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
                            className="p-1 text-accent hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                            title={t('sidebar.saveTitle')}
                            aria-label={t('sidebar.saveTitle')}
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={(e) => cancelRenameSession(e)}
                            className="p-1 text-content-subtle hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                            title={t('sidebar.cancelRename')}
                            aria-label={t('sidebar.cancelRename')}
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    }

                    const isThisSessionProcessing = Boolean(sessionLoadingMap[sid]);

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
                          className="flex items-center gap-2 truncate flex-1 text-left px-2.5 sm:px-3 py-2 sm:py-2.5 cursor-pointer"
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {isThisSessionProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" aria-label="Processing" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">{session.title || 'SAP Chat'}</span>
                        </button>
                        <div className="flex items-center gap-0.5 pr-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => startRenameSession(e, session)}
                            className="p-1 text-content-subtle hover:text-accent rounded-lg transition-colors cursor-pointer"
                            title={t('sidebar.rename')}
                            aria-label={`${t('sidebar.rename')} ${session.title || ''}`}
                          >
                            <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={(e) => promptDeleteSession(e, session)}
                            className="p-1 text-content-subtle hover:text-danger rounded-lg transition-colors cursor-pointer"
                            title={t('sidebar.deleteSession')}
                            aria-label={`${t('sidebar.deleteSession')} ${session.title || ''}`}
                          >
                            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        <div className="pwa-sidebar-footer p-3 border-t border-line bg-surface-raised/90 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 space-y-2">
          {user.role === 'superadmin' && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-warning-soft border border-warning/40 text-warning hover:brightness-110 transition-all shadow-2xs cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                {t('sidebar.adminPanel')}
              </span>
              <span className="text-[10px] bg-warning text-surface px-1.5 py-0.5 rounded font-bold">SUPER</span>
            </button>
          )}

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-sunken/70 hover:bg-surface-sunken border border-line/80 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-accent/30">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-semibold truncate text-content leading-tight">
                  {user.full_name || user.username}
                </div>
                <div className="text-[11px] text-content-muted mt-0.5 truncate capitalize">
                  {user.role === 'superadmin' ? t('admin.roleAdmin') : user.role === 'guest' ? t('admin.roleGuest') : (user.role || t('admin.roleUser'))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 text-content-subtle hover:text-content rounded-lg hover:bg-surface-raised transition-colors md:hidden cursor-pointer"
                aria-label={t('nav.settings')}
                title={t('nav.settings')}
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {isGuest ? (
                <button
                  onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
                  className="p-1.5 bg-accent text-accent-fg rounded-lg hover:brightness-110 transition-all shadow-xs cursor-pointer"
                  aria-label={t('sidebar.loginPrompt')}
                  title={t('sidebar.loginPrompt')}
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={() => setConfirmLogoutOpen(true)}
                  className="p-1.5 text-content-subtle hover:text-danger rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
                  aria-label={t('sidebar.logout')}
                  title={t('sidebar.logout')}
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ================= AREA CHAT UTAMA ================= */}
      <main className="flex-1 flex flex-col h-full bg-surface relative overflow-hidden min-w-0 max-w-full w-full">

        <header className="app-header pt-safe bg-surface-raised/80 backdrop-blur-xl border-b border-line z-10 shrink-0 max-w-full">
          <div className="app-header-row h-14 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 max-w-full overflow-hidden">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className={`${compactLandscape ? '' : 'md:hidden'} p-2 rounded-xl text-content-muted hover:bg-surface-hover shrink-0 cursor-pointer`}
                aria-label={t('nav.openSidebarMenu')}
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>

              <label htmlFor="sap-target" className="hidden sm:block text-sm text-content-muted shrink-0">
                {t('nav.sapSystem')}
              </label>
              {sapSubServers.length > 0 ? (
                <select
                  id="sap-target"
                  value={activeServer}
                  onChange={(e) => handleServerChange(e.target.value)}
                  className={`bg-surface-sunken text-xs sm:text-sm font-medium py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl border cursor-pointer max-w-[13rem] sm:max-w-[17rem] truncate transition-colors ${
                    isProductionTarget ? 'border-danger text-danger font-semibold' : 'border-line text-content'
                  }`}
                  aria-label={t('nav.serverSelectAria')}
                >
                  {sapSubServers.map((srv) => (
                    <option
                      key={srv.number ?? aliasOf(srv)}
                      value={`sap:${aliasOf(srv)}`}
                      className="bg-surface-raised text-content py-1"
                    >
                      {srv.name}{srv.production_warning ? ` — ${t('nav.productionWarning')}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs sm:text-sm text-content-subtle">{t('nav.connecting')}</span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {!isGuest && <QuotaChip quota={kuota} />}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                aria-label={t('nav.settings')}
                title={t('nav.settings')}
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={cycleTheme}
                className="p-2 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                aria-label={t('nav.theme')}
                title={t('nav.theme')}
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
              {language === 'en' ? (
                <>You are connected to the <strong>PRODUCTION</strong> system ({selectedServer?.name}). Queries will execute against real company data.</>
              ) : (
                <>Anda terhubung ke sistem <strong>PRODUKSI</strong> ({selectedServer?.name}). Setiap permintaan dijalankan terhadap data perusahaan yang sesungguhnya.</>
              )}
            </span>
          </div>
        )}

        {isGuest && (
          <div className="bg-warning-soft border-b border-warning/30 px-3.5 sm:px-6 py-2 flex items-center justify-between gap-2.5 shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-warning min-w-0">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="leading-tight">
                {t('sidebar.guestDesc')}
              </span>
            </div>
            <button
              onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
              className="text-xs font-bold bg-warning text-surface px-3 py-1.5 rounded-lg shrink-0 shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              {t('sidebar.loginPrompt')}
            </button>
          </div>
        )}

        {/* Error ditampilkan sebagai komponen tersendiri, bukan gelembung chat palsu. */}
        {(error || currentSessionError) && (
          <div
            role="alert"
            className="bg-danger-soft border-b border-danger/40 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-danger min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{(error || currentSessionError).message}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {(error || currentSessionError).retry && (
                <button onClick={() => {
                  const r = (error || currentSessionError).retry;
                  setError(null);
                  setSessionErrorMap((prev) => ({ ...prev, [activeSessionKey]: null }));
                  r();
                }}
                  className="text-xs font-bold bg-danger text-surface px-3 py-1 rounded-lg cursor-pointer">
                  {language === 'en' ? 'Retry' : 'Coba lagi'}
                </button>
              )}
              <button onClick={() => {
                setError(null);
                setSessionErrorMap((prev) => ({ ...prev, [activeSessionKey]: null }));
              }} className="p-1 text-danger cursor-pointer" aria-label={t('common.close')}>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
        )}

        {!isGuest && <QuotaBanner quota={kuota} />}

        <div ref={scrollContainerRef} className="app-chat-scroll flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-8 py-4 sm:py-8 overscroll-contain max-w-full w-full" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          <div ref={messagesContentRef} className="max-w-3xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full w-full overflow-hidden">
            {currentMessages.map((msg, index) => (
              <ChatMessage
                key={index}
                message={msg}
                onBukaPanel={bukaPanel}
                onRegenerate={
                  !isCurrentLoading &&
                  msg.role === 'assistant' &&
                  index === currentMessages.length - 1
                    ? handleRegenerate
                    : undefined
                }
                onEditMessage={
                  !isCurrentLoading &&
                  msg.role === 'user' &&
                  index >= currentMessages.length - 2
                    ? (msgId, text) => handleEditMessage(msg, text)
                    : undefined
                }
              />
            ))}

            {/* Jawaban yang sedang ditulis: tampilkan tekstualnya begitu ada,
                indikator tahapan hanya selama belum ada teks sama sekali. */}
            {isCurrentLoading && currentStream.trim() && (
              <ChatMessage
                message={{ role: 'assistant', content: hidePendingArtifact(currentStream) }}
                isStreaming
              />
            )}

            {isCurrentLoading && !currentStream.trim() && (
              <ThinkingIndicator progress={currentProgress} onStop={() => stopGeneration(activeSessionKey)} />
            )}

            {currentMessages.length === 0 && !isCurrentLoading && (
              <div className="pt-4 sm:pt-8 pb-3 sm:pb-4">
                <div className="text-center mb-4 sm:mb-6">
                  <div className="inline-flex items-center justify-center p-2.5 sm:p-3 bg-accent-soft rounded-xl sm:rounded-2xl text-accent-soft-fg mb-2 sm:mb-3">
                    <Cpu className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <h3 className="text-base sm:text-lg font-bold text-content font-display">{t('suggestions.heroTitle')}</h3>
                    {dynamicSuggestions && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 border border-indigo-500/25 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        {t('suggestions.personalized')}
                      </span>
                    )}
                    <button
                      onClick={() => loadSuggestions(true)}
                      disabled={isSuggestionsLoading}
                      title={t('suggestions.refresh')}
                      aria-label={t('suggestions.refresh')}
                      className="p-1 text-content-muted hover:text-content hover:bg-surface-hover rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSuggestionsLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-content-muted mt-1 max-w-lg mx-auto">
                    {t('suggestions.heroSubtitle')}
                  </p>
                </div>

                {isSuggestionsLoading ? (
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-3 text-xs text-indigo-500 font-medium">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('suggestions.loading')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="flex items-center sm:items-start sm:flex-col text-left p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-surface-raised border border-line animate-pulse gap-3 sm:gap-0"
                        >
                          <div className="w-9 h-9 rounded-lg sm:rounded-xl bg-surface-sunken sm:mb-3.5 shrink-0" />
                          <div className="min-w-0 flex-1 w-full space-y-2">
                            <div className="h-4 bg-surface-sunken rounded-md w-3/4" />
                            <div className="h-3 bg-surface-sunken rounded-md w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 animate-fadeIn">
                    {(dynamicSuggestions && dynamicSuggestions.length >= 3
                      ? dynamicSuggestions
                      : [
                          {
                            title: t('suggestions.stockCheck.title'),
                            subtitle: t('suggestions.stockCheck.subtitle'),
                            query: t('suggestions.stockCheck.query'),
                            icon: 'Layers',
                          },
                          {
                            title: t('suggestions.poStatus.title'),
                            subtitle: t('suggestions.poStatus.subtitle'),
                            query: t('suggestions.poStatus.query'),
                            icon: 'Search',
                          },
                          {
                            title: t('suggestions.abapHelper.title'),
                            subtitle: t('suggestions.abapHelper.subtitle'),
                            query: t('suggestions.abapHelper.query'),
                            icon: 'FileSpreadsheet',
                          },
                        ]
                    ).map((item, idx) => {
                      const IconComp = (typeof item.icon === 'string' ? SUGGESTION_ICONS[item.icon] : item.icon) || Layers;
                      return (
                        <button
                          key={item.title || idx}
                          onClick={() => handleSendMessage(item.query)}
                          className="flex items-center sm:items-start sm:flex-col text-left p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-surface-raised hover:border-accent border border-line shadow-xs hover:shadow-md transition-all group active:scale-[0.99] gap-3 sm:gap-0 cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-auto sm:w-full sm:mb-3.5 shrink-0">
                            <span className="p-2 sm:p-2.5 w-fit rounded-lg sm:rounded-xl bg-surface-sunken text-content-secondary group-hover:bg-accent-soft group-hover:text-accent-soft-fg transition-colors shrink-0">
                              <IconComp className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                            </span>
                            <span className="hidden sm:inline-flex p-1 rounded-md text-content-subtle group-hover:text-accent transition-colors">
                              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 sm:w-full">
                            <span className="text-xs sm:text-sm font-semibold sm:font-bold text-content group-hover:text-accent transition-colors block truncate sm:whitespace-normal">
                              {item.title}
                            </span>
                            <span className="text-[11px] sm:text-xs text-content-muted mt-0.5 sm:mt-1.5 leading-snug sm:leading-relaxed block truncate sm:whitespace-normal">
                              {item.subtitle}
                            </span>
                          </div>
                          <span className="sm:hidden p-1.5 rounded-lg bg-surface-sunken text-content-muted group-hover:text-accent group-hover:bg-accent-soft transition-colors shrink-0">
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        </div>

        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isCurrentLoading}
          modes={chatModesEnabled ? modesList : []}
          selectedMode={selectedMode}
          suggestions={dynamicSuggestions}
          onSelectMode={(modeCode) => {
            setSelectedMode(modeCode);
            try {
              localStorage.setItem('sap_chat_mode', modeCode);
            } catch {}
          }}
        />
      </main>

      <SidePanel isi={isiPanel} onTutup={tutupPanel} />

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
        onRefreshModes={fetchModes}
      />

      {/* Confirmation Modal - Logout */}
      <ConfirmModal
        isOpen={confirmLogoutOpen}
        onClose={() => setConfirmLogoutOpen(false)}
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          handleLogout();
        }}
        variant="logout"
        title={t('sidebar.logoutConfirmTitle')}
        message={t('sidebar.logoutConfirmMsg')}
        confirmText={t('sidebar.logout')}
        cancelText={t('common.cancel')}
      />

      {/* Confirmation Modal - Hapus Percakapan */}
      <ConfirmModal
        isOpen={deleteConfirmState.isOpen}
        onClose={() => {
          if (!deleteConfirmState.isLoading) {
            setDeleteConfirmState({ isOpen: false, sessionId: null, title: '', isLoading: false });
          }
        }}
        onConfirm={handleConfirmDeleteSession}
        isLoading={deleteConfirmState.isLoading}
        variant="danger"
        title={t('sidebar.deleteConfirmTitle')}
        message={t('sidebar.deleteConfirmMsg', { title: deleteConfirmState.title })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

export default ChatLayout;
