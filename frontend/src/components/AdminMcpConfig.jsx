import React, { useState, useEffect, useCallback } from 'react';
import { 
  Server, 
  Database, 
  BookOpen, 
  Save, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Key, 
  Globe, 
  Sliders, 
  Code2, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Layers,
  AlertTriangle,
  Plus,
  Trash2,
  Activity,
  FileText,
  Check,
  X,
  Radio,
  Info,
  ShieldCheck,
  Power
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { api } from '../lib/api';

const SYSTEM_DEFAULTS = {
  sap: {
    key: 'sap-leader-remote',
    name: 'SAP ERP Gateway',
    description: 'Akses ke data live SAP, tabel MARA/EKKO/BKPF, dan eksekusi BAPI/RFC.',
    url: 'http://192.168.1.162:8091/mcp',
    token: 'Trias123',
    type: 'http',
  },
  rag: {
    key: 'manufacturing-rag',
    name: 'RAG Knowledge Gateway',
    description: 'Akses ke basis pengetahuan dokumen enterprise, SOP teknis, dan vektor dokumen.',
    url: 'http://192.168.1.162:8090/mcp',
    token: 'Trias123',
    type: 'http',
  },
  sql: {
    key: 'sql-mcp',
    name: 'SQL & Database Gateway',
    description: 'Akses langsung ke database SQL operasional, analitik, dan kueri relasional.',
    url: 'http://192.168.1.162:8090/mcp',
    token: 'Trias123',
    type: 'http',
  },
};

/**
 * Helper to parse a gateway JSON string into visual form fields.
 */
function parseGatewayJson(jsonStr, defaultServerKey, defaultFallback) {
  try {
    if (!jsonStr || !jsonStr.trim()) {
      return {
        serverKey: defaultServerKey,
        url: defaultFallback?.url || '',
        token: defaultFallback?.token || '',
        type: defaultFallback?.type || 'http',
        extraHeaders: {},
        isRawCustom: false,
      };
    }
    const parsed = JSON.parse(jsonStr);
    const servers = parsed.mcpServers || {};
    const keys = Object.keys(servers);
    const serverKey = keys.length > 0 ? keys[0] : defaultServerKey;
    const srv = keys.length > 0 ? servers[serverKey] : (parsed.url ? parsed : {});

    const url = srv.url || defaultFallback?.url || '';
    const type = srv.type || defaultFallback?.type || 'http';
    let token = '';
    const extraHeaders = { ...(srv.headers || {}) };

    if (extraHeaders['Authorization']) {
      const auth = extraHeaders['Authorization'];
      token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
      delete extraHeaders['Authorization'];
    } else if (defaultFallback?.token) {
      token = defaultFallback.token;
    }

    return {
      serverKey,
      url,
      token,
      type,
      extraHeaders,
      isRawCustom: keys.length > 1,
    };
  } catch {
    return {
      serverKey: defaultServerKey,
      url: defaultFallback?.url || '',
      token: defaultFallback?.token || '',
      type: defaultFallback?.type || 'http',
      extraHeaders: {},
      isRawCustom: true,
      parseError: true,
    };
  }
}

/**
 * Helper to build JSON string from visual form fields.
 */
function serializeGatewayJson(serverKey, url, token, type, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const payload = {
    mcpServers: {
      [serverKey || 'server']: {
        type: type || 'http',
        url: (url || '').trim(),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
    },
  };
  return JSON.stringify(payload, null, 2);
}

export default function AdminMcpConfig({
  mcpSapConfig,
  setMcpSapConfig,
  mcpRagConfig,
  setMcpRagConfig,
  mcpSqlConfig,
  setMcpSqlConfig,
  handleSaveMcpConfig,
  mcpSaving,
  stats,
  fetchStats,
  statsLoading,
  language = 'id',
}) {
  const isEn = language === 'en';

  // Mode: 'visual' (Dynamic Cards GUI) or 'raw' (JSON Code Editor)
  const [viewMode, setViewMode] = useState('visual');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Dynamic Servers List from Database
  const [servers, setServers] = useState([]);
  const [serversLoading, setServersLoading] = useState(false);

  // Visibility toggle for tokens per server { [serverId]: boolean }
  const [showTokens, setShowTokens] = useState({});

  // Local per-card form data { [serverId]: { name, description, url, transport_type, auth_token, enabled } }
  const [cardForms, setCardForms] = useState({});

  // Test Connection state per server { [serverId]: { loading, success, message, latency_ms, tool_count, tools } }
  const [testResults, setTestResults] = useState({});

  // Saving state per card { [serverId]: boolean }
  const [savingCards, setSavingCards] = useState({});

  // Feedback Notification Banner { type: 'success' | 'error', message: '' }
  const [notice, setNotice] = useState(null);

  // Add New MCP Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    id: '',
    name: '',
    description: '',
    url: '',
    transport_type: 'http',
    auth_token: '',
    enabled: true,
  });
  const [showAddToken, setShowAddToken] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // Confirm Modal state for Delete & Reset
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    variant: 'danger',
    isLoading: false,
    onConfirm: null,
  });

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => {
      setNotice((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Fetch servers from backend API
  const fetchServers = useCallback(async () => {
    setServersLoading(true);
    try {
      const res = await api.adminMcpServers();
      const list = res.servers || [];
      setServers(list);

      // Initialize or update cardForms with latest values
      const newForms = {};
      list.forEach((s) => {
        newForms[s.id] = {
          id: s.id,
          name: s.name || '',
          description: s.description || '',
          url: s.url || '',
          transport_type: s.transport_type || 'http',
          auth_token: s.auth_token || '',
          enabled: s.enabled !== false,
          is_system: !!s.is_system,
        };
      });
      setCardForms(newForms);
    } catch (err) {
      console.warn('Gagal memuat dynamic MCP servers, menggunakan fallback:', err);
    } finally {
      setServersLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchServers();
    if (fetchStats) fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle field change for a specific card
  const handleCardFieldChange = (serverId, field, value) => {
    setCardForms((prev) => ({
      ...prev,
      [serverId]: {
        ...prev[serverId],
        [field]: value,
      },
    }));
  };

  // Toggle token visibility
  const toggleTokenVisibility = (serverId) => {
    setShowTokens((prev) => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  // Test Connection for a specific server card
  const handleTestCard = async (serverId) => {
    const cardData = cardForms[serverId] || servers.find((s) => s.id === serverId);
    if (!cardData) return;

    setTestResults((prev) => ({
      ...prev,
      [serverId]: { loading: true, message: isEn ? 'Connecting…' : 'Menghubungi server…' },
    }));

    try {
      const res = await api.adminTestMcpConnection({
        server_id: serverId,
        url: cardData.url,
        auth_token: cardData.auth_token,
        transport_type: cardData.transport_type,
      });

      setTestResults((prev) => ({
        ...prev,
        [serverId]: {
          loading: false,
          success: res.online === true || res.success === true,
          message: res.message || (res.online ? (isEn ? 'Connected successfully' : 'Koneksi berhasil') : (isEn ? 'Connection failed' : 'Koneksi gagal')),
          latency_ms: res.latency_ms,
          tool_count: res.tool_count,
          tools: res.tools || [],
        },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [serverId]: {
          loading: false,
          success: false,
          message: err.message || (isEn ? 'Network error' : 'Gagal menghubungi endpoint'),
        },
      }));
    }
  };

  // Save changes to a single MCP server
  const handleSaveCard = async (serverId) => {
    const cardData = cardForms[serverId];
    if (!cardData) return;

    setSavingCards((prev) => ({ ...prev, [serverId]: true }));
    try {
      const payload = {
        name: cardData.name,
        description: cardData.description,
        url: cardData.url,
        transport_type: cardData.transport_type,
        auth_token: cardData.auth_token,
        enabled: cardData.enabled,
      };

      const res = await api.adminUpdateMcpServer(serverId, payload);
      if (res.success) {
        showNotice('success', res.message || (isEn ? `Server '${cardData.name}' updated successfully!` : `Server '${cardData.name}' berhasil diperbarui!`));
        
        // Sync raw JSON states if modifying system gateways
        if (serverId === 'sap' && setMcpSapConfig) {
          setMcpSapConfig(serializeGatewayJson(SYSTEM_DEFAULTS.sap.key, cardData.url, cardData.auth_token, cardData.transport_type));
        } else if (serverId === 'rag' && setMcpRagConfig) {
          setMcpRagConfig(serializeGatewayJson(SYSTEM_DEFAULTS.rag.key, cardData.url, cardData.auth_token, cardData.transport_type));
        } else if (serverId === 'sql' && setMcpSqlConfig) {
          setMcpSqlConfig(serializeGatewayJson(SYSTEM_DEFAULTS.sql.key, cardData.url, cardData.auth_token, cardData.transport_type));
        }

        await fetchServers();
        if (fetchStats) fetchStats();
      } else {
        showNotice('error', res.message || (isEn ? 'Failed to update server.' : 'Gagal memperbarui server.'));
      }
    } catch (err) {
      showNotice('error', err.message || (isEn ? 'Error updating server.' : 'Terjadi kesalahan saat memperbarui server.'));
    } finally {
      setSavingCards((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  // Toggle server enabled/disabled immediately
  const handleToggleEnabled = async (serverId, currentStatus) => {
    const nextStatus = !currentStatus;
    // Optimistic update
    setCardForms((prev) => ({
      ...prev,
      [serverId]: { ...prev[serverId], enabled: nextStatus },
    }));

    try {
      await api.adminUpdateMcpServer(serverId, { enabled: nextStatus });
      await fetchServers();
      if (fetchStats) fetchStats();
    } catch (err) {
      showNotice('error', err.message || (isEn ? 'Failed to toggle status.' : 'Gagal mengubah status server.'));
      // Rollback
      setCardForms((prev) => ({
        ...prev,
        [serverId]: { ...prev[serverId], enabled: currentStatus },
      }));
    }
  };

  // Delete Custom MCP Server
  const handleDeleteClick = (server) => {
    if (server.is_system) {
      showNotice('error', isEn ? 'System gateways cannot be deleted.' : 'Gateway server sistem bawaan tidak dapat dihapus.');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isEn ? 'Delete MCP Server' : 'Hapus Server MCP',
      message: isEn
        ? `Are you sure you want to delete server '${server.name}' (${server.id})? This action cannot be undone.`
        : `Apakah Anda yakin ingin menghapus server MCP '${server.name}' (${server.id})? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: isEn ? 'Delete Server' : 'Hapus Server',
      variant: 'danger',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        try {
          const res = await api.adminDeleteMcpServer(server.id);
          if (res.success) {
            showNotice('success', res.message || (isEn ? 'Server deleted successfully.' : 'Server MCP berhasil dihapus.'));
            setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
            await fetchServers();
            if (fetchStats) fetchStats();
          } else {
            showNotice('error', res.message || (isEn ? 'Failed to delete server.' : 'Gagal menghapus server.'));
            setConfirmModal((m) => ({ ...m, isLoading: false }));
          }
        } catch (err) {
          showNotice('error', err.message || (isEn ? 'Error deleting server.' : 'Gagal menghapus server.'));
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  // Reset System Gateway to Factory Default
  const handleResetClick = (server) => {
    const def = SYSTEM_DEFAULTS[server.id];
    setConfirmModal({
      isOpen: true,
      title: isEn ? 'Reset to Default Config' : 'Kembalikan ke Konfigurasi Default',
      message: isEn
        ? `Reset gateway '${server.name}' to default factory endpoint (${def?.url || 'default'})?`
        : `Kembalikan pengaturan gateway '${server.name}' ke endpoint default bawaan pabrik (${def?.url || 'default'})?`,
      confirmText: isEn ? 'Reset Default' : 'Reset Default',
      variant: 'reset',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        try {
          const res = await api.adminResetMcpServer(server.id);
          if (res.success) {
            showNotice('success', res.message || (isEn ? 'Server reset to default.' : 'Konfigurasi server berhasil di-reset ke default.'));
            setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
            
            // Sync raw JSON state
            if (def) {
              const defJson = serializeGatewayJson(def.key, def.url, def.token, def.type);
              if (server.id === 'sap' && setMcpSapConfig) setMcpSapConfig(defJson);
              if (server.id === 'rag' && setMcpRagConfig) setMcpRagConfig(defJson);
              if (server.id === 'sql' && setMcpSqlConfig) setMcpSqlConfig(defJson);
            }

            await fetchServers();
            if (fetchStats) fetchStats();
          } else {
            showNotice('error', res.message || (isEn ? 'Failed to reset server.' : 'Gagal mereset server.'));
            setConfirmModal((m) => ({ ...m, isLoading: false }));
          }
        } catch (err) {
          showNotice('error', err.message || (isEn ? 'Error resetting server.' : 'Gagal mereset server.'));
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  // Add New MCP Modal Handlers
  const handleOpenAddModal = () => {
    setAddForm({
      id: '',
      name: '',
      description: '',
      url: '',
      transport_type: 'http',
      auth_token: '',
      enabled: true,
    });
    setModalTestResult(null);
    setIsAddModalOpen(true);
  };

  const handleTestModalConnection = async () => {
    if (!addForm.url || !addForm.url.trim()) {
      setModalTestResult({
        success: false,
        message: isEn ? 'URL endpoint is required for connection testing.' : 'URL endpoint wajib diisi untuk menguji koneksi.',
      });
      return;
    }

    setModalTesting(true);
    setModalTestResult({ loading: true, message: isEn ? 'Testing connection…' : 'Menguji koneksi ke endpoint…' });
    try {
      const res = await api.adminTestMcpConnection({
        url: addForm.url.trim(),
        auth_token: addForm.auth_token.trim(),
        transport_type: addForm.transport_type,
      });
      setModalTestResult({
        loading: false,
        success: res.online === true || res.success === true,
        message: res.message || (res.online ? (isEn ? 'Connected successfully' : 'Koneksi berhasil') : (isEn ? 'Connection failed' : 'Koneksi gagal')),
        latency_ms: res.latency_ms,
        tool_count: res.tool_count,
        tools: res.tools || [],
      });
    } catch (err) {
      setModalTestResult({
        loading: false,
        success: false,
        message: err.message || (isEn ? 'Connection test failed.' : 'Uji koneksi gagal.'),
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleSubmitAddModal = async (e) => {
    e.preventDefault();
    if (!addForm.id.trim()) {
      showNotice('error', isEn ? 'Server ID is required.' : 'ID server wajib diisi.');
      return;
    }
    if (!addForm.name.trim()) {
      showNotice('error', isEn ? 'Server Name is required.' : 'Nama server wajib diisi.');
      return;
    }
    if (!addForm.url.trim()) {
      showNotice('error', isEn ? 'URL endpoint is required.' : 'URL endpoint wajib diisi.');
      return;
    }

    setModalSaving(true);
    try {
      const res = await api.adminCreateMcpServer({
        id: addForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        name: addForm.name.trim(),
        description: addForm.description.trim(),
        url: addForm.url.trim(),
        transport_type: addForm.transport_type,
        auth_token: addForm.auth_token.trim(),
        enabled: addForm.enabled,
      });

      if (res.success) {
        showNotice('success', res.message || (isEn ? `MCP Server '${addForm.name}' added successfully!` : `Server MCP '${addForm.name}' berhasil ditambahkan!`));
        setIsAddModalOpen(false);
        await fetchServers();
        if (fetchStats) fetchStats();
      } else {
        showNotice('error', res.message || (isEn ? 'Failed to add server.' : 'Gagal menambahkan server MCP.'));
      }
    } catch (err) {
      showNotice('error', err.message || (isEn ? 'Error adding server.' : 'Gagal menambahkan server MCP.'));
    } finally {
      setModalSaving(false);
    }
  };

  // Format / Prettify all JSONs in Raw mode
  const handlePrettifyRaw = () => {
    try {
      if (mcpSapConfig) setMcpSapConfig(JSON.stringify(JSON.parse(mcpSapConfig), null, 2));
    } catch {}
    try {
      if (mcpRagConfig) setMcpRagConfig(JSON.stringify(JSON.parse(mcpRagConfig), null, 2));
    } catch {}
    try {
      if (mcpSqlConfig) setMcpSqlConfig(JSON.stringify(JSON.parse(mcpSqlConfig), null, 2));
    } catch {}
  };

  // Helper to render server icon
  const renderServerIcon = (server) => {
    const id = server.id.toLowerCase();
    if (id === 'sap') {
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
          <Database className="w-4 h-4" />
        </div>
      );
    }
    if (id === 'rag') {
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
          <BookOpen className="w-4 h-4" />
        </div>
      );
    }
    if (id === 'sql') {
      return (
        <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
          <Database className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
        <Server className="w-4 h-4" />
      </div>
    );
  };

  // Helper to render server status badge
  const renderStatusBadge = (server) => {
    const test = testResults[server.id];
    if (test?.loading) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-amber-500/15 text-amber-500 border-amber-500/30">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>{isEn ? 'Testing…' : 'Menguji…'}</span>
        </span>
      );
    }

    if (test) {
      if (test.success) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>Online</span>
            {test.latency_ms !== undefined && <span className="text-[9px] opacity-80 font-mono">({test.latency_ms}ms)</span>}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-rose-500/15 text-rose-500 border-rose-500/30" title={test.message}>
          <XCircle className="w-3 h-3" />
          <span>Offline</span>
        </span>
      );
    }

    if (server.enabled === false) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-content-subtle/15 text-content-muted border-line">
          <Power className="w-3 h-3" />
          <span>{isEn ? 'Disabled' : 'Nonaktif'}</span>
        </span>
      );
    }

    const liveStatus = stats?.mcp_status?.[server.id] || server;
    if (liveStatus && (liveStatus.status || liveStatus.online !== undefined)) {
      const isOnline = liveStatus.status === 'online' || liveStatus.online === true;
      if (isOnline) {
        const toolCount = liveStatus.tool_count ?? liveStatus.tools_count ?? server?.tool_count ?? 0;
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
            title={liveStatus.active_server || ''}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>Online</span>
            <span className="text-[9px] opacity-80 font-mono">({toolCount} tools)</span>
          </span>
        );
      }
      return (
        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-rose-500/15 text-rose-500 border-rose-500/30"
          title={liveStatus.error || (isEn ? 'Server unreachable' : 'Server tidak dapat dijangkau')}
        >
          <XCircle className="w-3 h-3" />
          <span>Offline</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-amber-500/15 text-amber-500 border-amber-500/30">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>{isEn ? 'Checking…' : 'Memeriksa…'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* NOTICE BANNER */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-medium animate-fadeIn ${
            notice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-1 hover:opacity-75 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/80">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-accent" />
            {isEn ? 'Dynamic MCP Server Configurations' : 'Konfigurasi Gateway MCP Dinamis'}
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            {isEn
              ? 'Add custom MCP gateways, configure descriptions, test live connectivity, and manage tools.'
              : 'Kelola gateway MCP secara dinamis, atur deskripsi, uji koneksi real-time, serta tambah atau hapus server.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher: Visual Form vs Raw JSON */}
          <div className="flex items-center p-1 bg-surface-sunken border border-line rounded-xl shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'visual'
                  ? 'bg-accent text-accent-contrast shadow-xs'
                  : 'text-content-muted hover:text-content'
              }`}
              title={isEn ? 'Visual Form GUI' : 'Formulir Visual'}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isEn ? 'Visual Form' : 'Formulir Visual'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-accent text-accent-contrast shadow-xs'
                  : 'text-content-muted hover:text-content'
              }`}
              title={isEn ? 'Raw JSON Config' : 'JSON Mentah'}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Raw JSON' : 'JSON Mentah'}</span>
            </button>
          </div>

          {/* Refresh Ping Button */}
          <button
            type="button"
            onClick={() => {
              fetchServers();
              if (fetchStats) fetchStats();
            }}
            disabled={statsLoading || serversLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-hover hover:bg-line border border-line text-content rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title={isEn ? 'Refresh status from servers' : 'Periksa status server'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statsLoading || serversLoading ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">{isEn ? 'Ping Status' : 'Cek Status'}</span>
          </button>

          {/* Add New MCP Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-500/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Add MCP' : 'Tambah MCP'}</span>
          </button>

          {/* Global Save Button (for raw mode / system config) */}
          {viewMode === 'raw' && (
            <button
              type="button"
              onClick={handleSaveMcpConfig}
              disabled={mcpSaving}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{mcpSaving ? (isEn ? 'Saving…' : 'Menyimpan…') : (isEn ? 'Save MCP' : 'Simpan MCP')}</span>
            </button>
          )}
        </div>
      </div>

      {/* ARCHITECTURE & USAGE COLLAPSIBLE BANNER */}
      <div className="bg-surface border border-line/80 rounded-2xl p-3.5 sm:p-4 text-xs text-content-muted leading-relaxed shadow-xs transition-all">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold text-xs shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <p className="font-bold text-content text-xs sm:text-sm font-display truncate">
              {isEn ? 'Dynamic MCP Architecture & Extensibility' : 'Arsitektur & Fleksibilitas MCP Dinamis'}
            </p>
            <span className="hidden md:inline text-[11px] text-emerald-500 font-medium truncate">
              • {isEn ? 'Supports unlimited external gateways, custom descriptions & live tests' : 'Mendukung penambahan gateway baru tanpa batas, custom deskripsi & uji koneksi'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="text-xs text-accent hover:underline font-medium flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>{isGuideOpen ? (isEn ? 'Hide Details' : 'Tutup Info') : (isEn ? 'Read Details' : 'Pelajari Info')}</span>
            {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {isGuideOpen && (
          <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-1 md:grid-cols-3 gap-3 animate-fadeIn text-[11.5px]">
            <div className="p-3 rounded-xl bg-surface-sunken border border-line/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-content">
                <Database className="w-3.5 h-3.5 text-amber-500" />
                <span>SAP ERP Gateway (System)</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Connects AI Assistant directly to SAP ECC / S4HANA via RFC/BAPI. Reads tables (MARA, EKKO, BKPF) and executes RFC function modules.'
                  : 'Menghubungkan asisten ke SAP ECC/S4HANA via RFC/BAPI. Digunakan untuk membaca tabel SAP (MARA, EKKO, BKPF) dan eksekusi modul fungsi SAP.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface-sunken border border-line/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-content">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                <span>RAG Knowledge Gateway (System)</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Connects to enterprise vector index & SOP technical manuals for machinery, SOP standards, and work instructions.'
                  : 'Menghubungkan asisten ke basis data vektor & dokumen SOP pabrik/perusahaan untuk manual mesin dan standar operasional.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface-sunken border border-line/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-content">
                <Server className="w-3.5 h-3.5 text-indigo-500" />
                <span>Custom MCP Connectors</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Add integrations to Jira, GitHub, Postgres, Redis, or external custom HTTP MCP services anytime with custom tools auto-discovery.'
                  : 'Tambahkan konektor ke Jira, GitHub, Postgres, atau server MCP eksternal lainnya dengan penemuan tools otomatis.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: DYNAMIC VISUAL FORM CARDS */}
      {viewMode === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {servers.length === 0 && serversLoading && (
            <div className="col-span-full p-8 text-center bg-surface border border-line rounded-2xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent mb-2" />
              <p className="text-xs text-content-muted">{isEn ? 'Loading MCP servers…' : 'Memuat daftar server MCP…'}</p>
            </div>
          )}

          {servers.map((srv) => {
            const form = cardForms[srv.id] || srv;
            const test = testResults[srv.id];
            const isSaving = savingCards[srv.id];
            const isTokenVisible = showTokens[srv.id] || false;

            return (
              <div
                key={srv.id}
                className={`p-4 rounded-2xl border bg-surface shadow-xs flex flex-col justify-between space-y-3.5 transition-all ${
                  srv.id === 'sap'
                    ? 'hover:border-amber-500/40 border-line/80'
                    : srv.id === 'rag'
                    ? 'hover:border-emerald-500/40 border-line/80'
                    : srv.id === 'sql'
                    ? 'hover:border-sky-500/40 border-line/80'
                    : 'hover:border-indigo-500/40 border-line/80'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderServerIcon(srv)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs sm:text-sm text-content font-display truncate">
                            {form.name || srv.name}
                          </h4>
                          {srv.is_system && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0">
                              System
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-content-subtle font-mono truncate">
                          {srv.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status Badge */}
                      {renderStatusBadge(srv)}

                      {/* Power / Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(srv.id, form.enabled !== false)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          form.enabled !== false
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-surface-sunken text-content-subtle border-line hover:text-content'
                        }`}
                        title={form.enabled !== false ? (isEn ? 'Disable server' : 'Nonaktifkan server') : (isEn ? 'Enable server' : 'Aktifkan server')}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete button for custom MCP */}
                      {!srv.is_system && (
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(srv)}
                          className="p-1.5 rounded-lg border border-line text-content-muted hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all cursor-pointer"
                          title={isEn ? 'Delete MCP server' : 'Hapus server MCP'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Field: Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                      <span>{isEn ? 'Gateway Name' : 'Nama Gateway'}</span>
                    </label>
                    <input
                      type="text"
                      value={form.name || ''}
                      onChange={(e) => handleCardFieldChange(srv.id, 'name', e.target.value)}
                      placeholder="e.g. SAP ERP Gateway"
                      className="w-full text-xs px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all font-medium"
                    />
                  </div>

                  {/* Field: Description (Requested by User) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                      <FileText className="w-3 h-3 text-content-subtle" />
                      <span>{isEn ? 'Description' : 'Deskripsi Server'}</span>
                    </label>
                    <textarea
                      rows="2"
                      value={form.description || ''}
                      onChange={(e) => handleCardFieldChange(srv.id, 'description', e.target.value)}
                      placeholder={isEn ? 'Describe server capabilities or connected database…' : 'Deskripsikan peran atau sumber data server MCP ini…'}
                      className="w-full text-xs px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all leading-relaxed resize-none [scrollbar-width:thin]"
                    />
                  </div>

                  {/* Field: Endpoint URL */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3 text-content-subtle" />
                        {isEn ? 'Endpoint URL' : 'URL Endpoint'}
                      </span>
                      <span className="text-[9px] font-mono text-content-subtle lowercase">http/https</span>
                    </label>
                    <input
                      type="text"
                      value={form.url || ''}
                      onChange={(e) => handleCardFieldChange(srv.id, 'url', e.target.value)}
                      placeholder="http://192.168.1.162:8091/mcp"
                      className="w-full text-xs font-mono px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                    />
                  </div>

                  {/* Field: Transport Protocol */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                      <Layers className="w-3 h-3 text-content-subtle" />
                      {isEn ? 'Transport Protocol' : 'Protokol Transport'}
                    </label>
                    <select
                      value={form.transport_type || 'http'}
                      onChange={(e) => handleCardFieldChange(srv.id, 'transport_type', e.target.value)}
                      className="w-full text-xs px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all cursor-pointer font-medium"
                    >
                      <option value="http">HTTP / SSE (Streamable MCP)</option>
                      <option value="stdio">STDIO (Local Command Process)</option>
                    </select>
                  </div>

                  {/* Field: Bearer Token / API Key */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Key className="w-3 h-3 text-content-subtle" />
                        {isEn ? 'Bearer Token / API Key' : 'Token Autentikasi / Bearer'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTokenVisibility(srv.id)}
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {isTokenVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{isTokenVisible ? (isEn ? 'Hide' : 'Tutup') : (isEn ? 'Reveal' : 'Lihat')}</span>
                      </button>
                    </label>
                    <div className="relative">
                      <input
                        type={isTokenVisible ? 'text' : 'password'}
                        value={form.auth_token || ''}
                        onChange={(e) => handleCardFieldChange(srv.id, 'auth_token', e.target.value)}
                        placeholder="Trias123"
                        className="w-full text-xs font-mono px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                      />
                    </div>
                  </div>

                  {/* Real-time Test Result Inline Feedback */}
                  {test && (
                    <div
                      className={`p-2.5 rounded-xl border text-[11px] leading-relaxed transition-all animate-fadeIn ${
                        test.loading
                          ? 'bg-amber-500/10 border-amber-500/25 text-amber-500'
                          : test.success
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      <div className="flex items-start gap-1.5">
                        {test.loading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
                        ) : test.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate">{test.message}</p>
                          {test.tools && test.tools.length > 0 && (
                            <p className="text-[10px] opacity-80 mt-0.5 truncate font-mono">
                              Tools: {test.tools.slice(0, 4).join(', ')}
                              {test.tools.length > 4 ? ` +${test.tools.length - 4}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                  {/* Left: Reset or info */}
                  {srv.is_system ? (
                    <button
                      type="button"
                      onClick={() => handleResetClick(srv)}
                      className="flex items-center gap-1 text-[11px] text-content-muted hover:text-amber-500 transition-colors cursor-pointer"
                      title={isEn ? 'Reset to factory default config' : 'Kembalikan ke setting default pabrik'}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{isEn ? 'Reset Default' : 'Reset Default'}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-content-subtle font-mono truncate">
                      Custom Gateway
                    </span>
                  )}

                  {/* Right Action Buttons: Test Connection & Save */}
                  <div className="flex items-center gap-1.5">
                    {/* Test Connection Button */}
                    <button
                      type="button"
                      onClick={() => handleTestCard(srv.id)}
                      disabled={test?.loading}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-sunken hover:bg-surface-hover border border-line text-content transition-all cursor-pointer disabled:opacity-50"
                      title={isEn ? 'Test connection to this server' : 'Uji koneksi ke server ini'}
                    >
                      <Activity className={`w-3.5 h-3.5 text-accent ${test?.loading ? 'animate-pulse' : ''}`} />
                      <span>{test?.loading ? (isEn ? 'Testing…' : 'Menguji…') : (isEn ? 'Test' : 'Test')}</span>
                    </button>

                    {/* Save Button */}
                    <button
                      type="button"
                      onClick={() => handleSaveCard(srv.id)}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent hover:bg-accent-hover text-accent-contrast transition-all shadow-xs cursor-pointer disabled:opacity-50"
                      title={isEn ? 'Save server changes' : 'Simpan perubahan'}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? (isEn ? 'Saving…' : 'Menyimpan…') : (isEn ? 'Save' : 'Simpan')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: RAW JSON CODE VIEW */}
      {viewMode === 'raw' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <p>
              {isEn
                ? 'Advanced mode: Edit raw JSON payloads directly. Changes sync with the Visual Form.'
                : 'Mode Mahir: Edit langsung payload JSON mentah. Perubahan tersinkronisasi otomatis ke Form Visual.'}
            </p>
            <button
              type="button"
              onClick={handlePrettifyRaw}
              className="text-xs text-accent hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Auto Format / Prettify' : 'Format / Rapikan JSON'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* RAW SAP */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-500" />
                  <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                    SAP Config (JSON)
                  </label>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold">
                  sap-leader-remote
                </span>
              </div>
              <textarea
                rows="9"
                value={mcpSapConfig}
                onChange={(e) => setMcpSapConfig(e.target.value)}
                className="w-full font-mono text-xs px-3.5 py-2.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 outline-none text-content leading-relaxed transition-all resize-y [scrollbar-width:thin]"
                placeholder='{"mcpServers": { "sap-leader-remote": { "type": "http", "url": "http://192.168.1.162:8091/mcp" } } }'
              />
            </div>

            {/* RAW RAG */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" />
                  <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                    RAG Config (JSON)
                  </label>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-bold">
                  manufacturing-rag
                </span>
              </div>
              <textarea
                rows="9"
                value={mcpRagConfig}
                onChange={(e) => setMcpRagConfig(e.target.value)}
                className="w-full font-mono text-xs px-3.5 py-2.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 outline-none text-content leading-relaxed transition-all resize-y [scrollbar-width:thin]"
                placeholder='{"mcpServers": { "manufacturing-rag": { "type": "http", "url": "http://192.168.1.162:8090/mcp" } } }'
              />
            </div>

            {/* RAW SQL */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-500" />
                  <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                    SQL Config (JSON)
                  </label>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 border border-sky-500/30 font-bold">
                  sql-mcp
                </span>
              </div>
              <textarea
                rows="9"
                value={mcpSqlConfig}
                onChange={(e) => setMcpSqlConfig(e.target.value)}
                className="w-full font-mono text-xs px-3.5 py-2.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 outline-none text-content leading-relaxed transition-all resize-y [scrollbar-width:thin]"
                placeholder='{"mcpServers": { "sql-mcp": { "type": "http", "url": "http://192.168.1.162:8090/mcp" } } }'
              />
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW MCP MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line/80 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-line/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center font-bold shadow-2xs">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-content font-display">
                    {isEn ? 'Add New MCP Server' : 'Tambah Gateway Server MCP Baru'}
                  </h4>
                  <p className="text-[11px] text-content-muted">
                    {isEn ? 'Register a new external MCP server gateway.' : 'Daftarkan server MCP baru ke dalam sistem.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !modalSaving && setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitAddModal} className="p-4 space-y-3.5">
              {/* Field: ID & Transport */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    {isEn ? 'Server ID / Key *' : 'ID / Kunci Server *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={addForm.id}
                    onChange={(e) => setAddForm({ ...addForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') })}
                    placeholder="e.g. jira-gateway"
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
                    {isEn ? 'Transport Protocol' : 'Protokol Transport'}
                  </label>
                  <select
                    value={addForm.transport_type}
                    onChange={(e) => setAddForm({ ...addForm, transport_type: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all cursor-pointer font-medium"
                  >
                    <option value="http">HTTP / SSE (Streamable MCP)</option>
                    <option value="stdio">STDIO (Command Process)</option>
                  </select>
                </div>
              </div>

              {/* Field: Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted">
                  {isEn ? 'Server Gateway Name *' : 'Nama Gateway Server *'}
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g. Jira Issue Tracker Gateway"
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all font-medium"
                />
              </div>

              {/* Field: Description (Requested by User) */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                  <FileText className="w-3 h-3 text-content-subtle" />
                  <span>{isEn ? 'Server Description' : 'Deskripsi Server'}</span>
                </label>
                <textarea
                  rows="2"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder={isEn ? 'e.g. Integrates project tickets, sprints, and issues from Jira.' : 'e.g. Integrasi tiket issue, sprint, dan dokumentasi proyek Jira.'}
                  className="w-full text-xs px-3 py-1.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all leading-relaxed resize-none [scrollbar-width:thin]"
                />
              </div>

              {/* Field: Endpoint URL */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Endpoint URL *' : 'URL Endpoint *'}
                  </span>
                  <span className="text-[9px] font-mono text-content-subtle lowercase">http/https</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.url}
                  onChange={(e) => setAddForm({ ...addForm, url: e.target.value })}
                  placeholder="http://192.168.1.162:8095/mcp"
                  className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                />
              </div>

              {/* Field: Bearer Token / API Key */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Bearer Token / API Key (Optional)' : 'Token Autentikasi / Bearer (Opsional)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddToken(!showAddToken)}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showAddToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showAddToken ? (isEn ? 'Hide' : 'Tutup') : (isEn ? 'Reveal' : 'Lihat')}</span>
                  </button>
                </label>
                <input
                  type={showAddToken ? 'text' : 'password'}
                  value={addForm.auth_token}
                  onChange={(e) => setAddForm({ ...addForm, auth_token: e.target.value })}
                  placeholder="SecretToken123"
                  className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                />
              </div>

              {/* Modal Connection Test Feedback */}
              {modalTestResult && (
                <div
                  className={`p-2.5 rounded-xl border text-xs leading-relaxed transition-all animate-fadeIn ${
                    modalTestResult.loading
                      ? 'bg-amber-500/10 border-amber-500/25 text-amber-500'
                      : modalTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {modalTestResult.loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
                    ) : modalTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{modalTestResult.message}</p>
                      {modalTestResult.tools && modalTestResult.tools.length > 0 && (
                        <p className="text-[10.5px] opacity-80 mt-0.5 font-mono truncate">
                          Tools: {modalTestResult.tools.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleTestModalConnection}
                  disabled={modalTesting || !addForm.url.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover border border-line text-content transition-all cursor-pointer disabled:opacity-50"
                >
                  <Activity className={`w-3.5 h-3.5 text-accent ${modalTesting ? 'animate-pulse' : ''}`} />
                  <span>{modalTesting ? (isEn ? 'Testing…' : 'Menguji…') : (isEn ? 'Test Connection' : 'Uji Koneksi')}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={modalSaving}
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isEn ? 'Cancel' : 'Batal'}
                  </button>
                  <button
                    type="submit"
                    disabled={modalSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {modalSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{modalSaving ? (isEn ? 'Saving…' : 'Menyimpan…') : (isEn ? 'Save Server' : 'Simpan Server')}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => {
          if (!confirmModal.isLoading) {
            setConfirmModal((m) => ({ ...m, isOpen: false }));
          }
        }}
        onConfirm={confirmModal.onConfirm}
        isLoading={confirmModal.isLoading}
        variant={confirmModal.variant}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={isEn ? 'Cancel' : 'Batal'}
      />
    </div>
  );
}
