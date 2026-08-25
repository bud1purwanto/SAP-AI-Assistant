import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Cpu, FileSpreadsheet, Layers, Loader2, LogIn, LogOut, Menu, MessageSquare, Monitor, Moon, Pencil, Plus, Search, Settings, ShieldAlert, ShieldCheck, Sun, Trash2, X,
} from 'lucide-react';

import AdminDashboard from './AdminDashboard';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ConfirmModal from './ConfirmModal';
import LoginModal from './LoginModal';
import SettingsModal from './SettingsModal';
import SidePanel from './SidePanel';
import ThinkingIndicator from './ThinkingIndicator';
import { useTheme } from '../hooks/useTheme';
import { useCompactLandscape } from '../hooks/useViewport';
import {
  api, ApiError, chatWithProgress, clearSession, getStoredUser, saveSession, setUnauthorizedHandler,
} from '../lib/api';

const GUEST_USER = { username: 'Guest', role: 'guest' };

// Contoh ditulis sebagai pertanyaan kerja sehari-hari, bukan potongan
// nomor dokumen yang hanya bermakna bagi pengguna teknis.
const SUGGESTIONS = [
  {
    title: 'Cek stok barang',
    subtitle: 'Lihat ketersediaan stok di plant kita saat ini',
    query: 'Berapa ketersediaan stok material di plant kita saat ini?',
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

const groupSessionsByDate = (sessionsList) => {
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
    { label: 'Hari Ini', items: groups.today },
    { label: 'Kemarin', items: groups.yesterday },
    { label: '7 Hari Terakhir', items: groups.last7Days },
    { label: 'Sebelumnya', items: groups.older },
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

const aliasOf = (srv) => srv.aliases?.[0] || srv.name.toLowerCase().replace(/\s+/g, '-');
const SAP_SERVER_STORAGE_KEY = 'sap_ai_active_server';
const DRAFT_SESSION_KEY = '__draft_new_session__';

const ChatLayout = () => {
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

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customLoginMsg, setCustomLoginMsg] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Isi panel samping (kode/dokumen panjang), null bila panel tertutup.
  const [isiPanel, setIsiPanel] = useState(null);

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
  }, [user, sessionLoadingMap]);

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
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
  };

  const promptDeleteSession = (e, session) => {
    e.stopPropagation();
    const sid = session.session_id || session.id;
    setDeleteConfirmState({
      isOpen: true,
      sessionId: sid,
      title: session.title || 'Percakapan SAP',
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
    const targetSessionId = currentSessionId;
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
      if (!isGuest) fetchSessions(true, true);
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessagesMap((prev) => ({
          ...prev,
          [targetKey]: [...(prev[targetKey] || outgoing), { role: 'assistant', content: '_Permintaan dibatalkan._' }],
        }));
        return;
      }
      // Kuota tamu habis: arahkan ke login, bukan tampilkan error mentah.
      if (err instanceof ApiError && err.status === 429) {
        setMessagesMap((prev) => ({ ...prev, [targetKey]: prevMessages }));
        setCustomLoginMsg(err.message);
        setIsLoginModalOpen(true);
        return;
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
          [activeSessionKey]: { message: `Gagal menyiapkan pembuatan ulang: ${err.message}` },
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
          [activeSessionKey]: { message: `Gagal menyimpan perubahan: ${err.message}` },
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
  const selectedServer = sapSubServers.find((s) => `sap:${aliasOf(s)}` === activeServer);
  const isProductionTarget = Boolean(selectedServer?.production_warning);

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
        aria-label="Navigasi percakapan"
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
                <span className="text-[10px] uppercase font-semibold text-accent px-1.5 py-0.5 bg-accent-soft rounded-md">Co-Pilot</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[11px] sm:text-xs text-content-muted">Online</span>
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
                placeholder="Cari percakapan…"
                aria-label="Cari percakapan"
                className="w-full rounded-xl border border-line bg-surface-sunken py-2 pr-8 text-xs text-content placeholder:text-content-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
                style={{ paddingLeft: '2.125rem' }}
              />
              {sessionQuery && (
                <button
                  type="button"
                  onClick={() => setSessionQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-content-subtle hover:bg-surface-hover hover:text-content"
                  aria-label="Hapus kata kunci pencarian"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 sm:px-3 space-y-3 py-2 overscroll-contain" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }} aria-label="Riwayat percakapan">
          {searchResults !== null ? (
            <div className="space-y-1">
              <h2 className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                {isSearching
                  ? 'Mencari…'
                  : `${searchResults.length} hasil untuk "${sessionQuery.trim()}"`}
              </h2>
              {!isSearching && searchResults.length === 0 && (
                <p className="py-6 text-center text-xs text-content-subtle">
                  Tidak ada percakapan yang cocok
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
                  className="w-full rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-line hover:bg-surface-hover"
                >
                  <span className="block truncate text-xs font-semibold text-content">
                    {hit.title || 'Percakapan SAP'}
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
            groupSessionsByDate(sessions).map((group) => (
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
                          className="flex items-center gap-2 truncate flex-1 text-left px-2.5 sm:px-3 py-2 sm:py-2.5"
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {isThisSessionProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" aria-label="Sedang memproses" />
                          ) : (
                            <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
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
                            onClick={(e) => promptDeleteSession(e, session)}
                            className="p-1 text-content-subtle hover:text-danger rounded-lg transition-colors"
                            title="Hapus percakapan"
                            aria-label={`Hapus percakapan ${session.title || ''}`}
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
                Admin Dashboard
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
                  {user.role === 'superadmin' ? 'Administrator' : user.role === 'guest' ? 'Tamu' : (user.role || 'Pengguna')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 text-content-subtle hover:text-content rounded-lg hover:bg-surface-raised transition-colors md:hidden cursor-pointer"
                aria-label="Buka pengaturan"
                title="Pengaturan"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              {isGuest ? (
                <button
                  onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
                  className="p-1.5 bg-accent text-accent-fg rounded-lg hover:brightness-110 transition-all shadow-xs cursor-pointer"
                  aria-label="Login ke akun SAP"
                  title="Login"
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={() => setConfirmLogoutOpen(true)}
                  className="p-1.5 text-content-subtle hover:text-danger rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
                  aria-label="Keluar dari akun"
                  title="Keluar"
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
                className={`${compactLandscape ? '' : 'md:hidden'} p-2 rounded-xl text-content-muted hover:bg-surface-hover shrink-0`}
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
                  className={`bg-surface-sunken text-xs sm:text-sm font-medium py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl border cursor-pointer max-w-[13rem] sm:max-w-[17rem] truncate transition-colors ${
                    isProductionTarget ? 'border-danger text-danger font-semibold' : 'border-line text-content'
                  }`}
                >
                  {sapSubServers.map((srv) => (
                    <option
                      key={srv.number ?? aliasOf(srv)}
                      value={`sap:${aliasOf(srv)}`}
                      className="bg-surface-raised text-content py-1"
                    >
                      {srv.name}{srv.production_warning ? ' — PRODUKSI' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs sm:text-sm text-content-subtle">Menghubungkan…</span>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
                  className="text-xs font-bold bg-danger text-surface px-3 py-1 rounded-lg">
                  Coba lagi
                </button>
              )}
              <button onClick={() => {
                setError(null);
                setSessionErrorMap((prev) => ({ ...prev, [activeSessionKey]: null }));
              }} className="p-1 text-danger" aria-label="Tutup pesan kesalahan">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          </div>
        )}

        <div ref={scrollContainerRef} className="app-chat-scroll flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-8 py-4 sm:py-8 overscroll-contain max-w-full w-full" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          <div ref={messagesContentRef} className="max-w-3xl mx-auto space-y-4 sm:space-y-6 min-w-0 max-w-full w-full overflow-hidden">
            {currentMessages.map((msg, index) => (
              <ChatMessage
                key={index}
                message={msg}
                onBukaPanel={bukaPanel}
                // Hanya pertukaran terakhir yang boleh diubah: memotong riwayat
                // di tengah akan membuang jawaban-jawaban sesudahnya.
                onRegenerate={
                  !isCurrentLoading &&
                  msg.role === 'assistant' &&
                  index === currentMessages.length - 1
                    ? handleRegenerate
                    : undefined
                }
                onEdit={
                  !isCurrentLoading &&
                  msg.role === 'user' &&
                  index >= currentMessages.length - 2
                    ? (text) => handleEditMessage(msg, text)
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
                  <h3 className="text-base sm:text-lg font-bold text-content font-display">Mulai dari sini</h3>
                  <p className="text-xs sm:text-sm text-content-muted mt-1 sm:mt-1.5">
                    Pilih salah satu contoh, atau tulis pertanyaan Anda sendiri di bawah
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {SUGGESTIONS.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={item.title}
                        onClick={() => handleSendMessage(item.query)}
                        className="flex items-center sm:items-start sm:flex-col text-left p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-surface-raised hover:border-accent border border-line shadow-xs hover:shadow-md transition-all group active:scale-[0.99] gap-3 sm:gap-0 cursor-pointer"
                      >
                        <span className="p-2 sm:p-2.5 w-fit rounded-lg sm:rounded-xl bg-surface-sunken text-content-secondary group-hover:bg-accent-soft group-hover:text-accent-soft-fg transition-colors sm:mb-3.5 shrink-0">
                          <IconComp className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-semibold sm:font-bold text-content group-hover:text-accent transition-colors block">
                            {item.title}
                          </span>
                          <span className="text-[11px] sm:text-xs text-content-muted mt-0.5 sm:mt-1.5 leading-snug sm:leading-relaxed block truncate sm:whitespace-normal">
                            {item.subtitle}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>
        </div>

        <ChatInput onSendMessage={handleSendMessage} isLoading={isCurrentLoading} />
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
        title="Keluar dari Akun?"
        message="Anda akan keluar dari sesi SAP AI Co-Pilot saat ini. Anda dapat masuk kembali kapan saja dengan kredensial SAP Anda."
        confirmText="Keluar"
        cancelText="Tetap Masuk"
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
        title="Hapus Percakapan?"
        message={`Percakapan "${deleteConfirmState.title}" beserta seluruh riwayat respons SAP di dalamnya akan dihapus secara permanen.`}
        confirmText="Hapus Percakapan"
        cancelText="Batal"
      />
    </div>
  );
};

export default ChatLayout;
