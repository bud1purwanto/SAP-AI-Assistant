import React, { useState, useEffect } from 'react';
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
  AlertTriangle
} from 'lucide-react';

const DEFAULTS = {
  sap: {
    key: 'sap-leader-remote',
    name: 'SAP ERP Gateway',
    url: 'http://192.168.1.162:8091/mcp',
    token: 'Trias123',
    type: 'http',
  },
  rag: {
    key: 'manufacturing-rag',
    name: 'RAG Knowledge Gateway',
    url: 'http://192.168.1.162:8090/mcp',
    token: 'Trias123',
    type: 'http',
  },
  sql: {
    key: 'sql-mcp',
    name: 'SQL & Database Gateway',
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
 * Helper to build JSON string from visual form fields, preserving any extra headers.
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

  // Mode: 'visual' (Default Form GUI) or 'raw' (JSON Code Editor)
  const [viewMode, setViewMode] = useState('visual');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Visibility toggle for tokens
  const [showTokens, setShowTokens] = useState({
    sap: false,
    rag: false,
    sql: false,
  });

  // Local form state for Visual GUI mode
  const [formState, setFormState] = useState(() => ({
    sap: parseGatewayJson(mcpSapConfig, DEFAULTS.sap.key, DEFAULTS.sap),
    rag: parseGatewayJson(mcpRagConfig, DEFAULTS.rag.key, DEFAULTS.rag),
    sql: parseGatewayJson(mcpSqlConfig, DEFAULTS.sql.key, DEFAULTS.sql),
  }));

  // Trigger ping / stats refresh on mount so live status is immediately loaded
  useEffect(() => {
    if (fetchStats) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync formState when parent JSON changes externally (e.g. initial fetch)
  useEffect(() => {
    setFormState({
      sap: parseGatewayJson(mcpSapConfig, DEFAULTS.sap.key, DEFAULTS.sap),
      rag: parseGatewayJson(mcpRagConfig, DEFAULTS.rag.key, DEFAULTS.rag),
      sql: parseGatewayJson(mcpSqlConfig, DEFAULTS.sql.key, DEFAULTS.sql),
    });
  }, [mcpSapConfig, mcpRagConfig, mcpSqlConfig]);

  // Handle changes in Visual Form fields
  const handleFieldChange = (gatewayKey, field, value) => {
    setFormState((prev) => {
      const current = prev[gatewayKey];
      const updated = { ...current, [field]: value };

      // Generate serialized JSON and update parent state
      const newJson = serializeGatewayJson(
        updated.serverKey,
        updated.url,
        updated.token,
        updated.type,
        updated.extraHeaders
      );

      if (gatewayKey === 'sap') setMcpSapConfig(newJson);
      else if (gatewayKey === 'rag') setMcpRagConfig(newJson);
      else if (gatewayKey === 'sql') setMcpSqlConfig(newJson);

      return {
        ...prev,
        [gatewayKey]: updated,
      };
    });
  };

  // Reset a specific gateway to factory default
  const handleResetGateway = (gatewayKey) => {
    const def = DEFAULTS[gatewayKey];
    if (!def) return;

    const newJson = serializeGatewayJson(def.key, def.url, def.token, def.type);
    if (gatewayKey === 'sap') setMcpSapConfig(newJson);
    else if (gatewayKey === 'rag') setMcpRagConfig(newJson);
    else if (gatewayKey === 'sql') setMcpSqlConfig(newJson);

    setFormState((prev) => ({
      ...prev,
      [gatewayKey]: {
        serverKey: def.key,
        url: def.url,
        token: def.token,
        type: def.type,
        extraHeaders: {},
        isRawCustom: false,
      },
    }));
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

  const toggleTokenVisibility = (key) => {
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Live MCP Status summary
  const sapStatus = stats?.mcp_status?.sap;
  const ragStatus = stats?.mcp_status?.rag;
  const sqlStatus = stats?.mcp_status?.sql;

  const renderStatusBadge = (statusObj) => {
    if (statsLoading || !stats) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-amber-500/15 text-amber-500 border-amber-500/30">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>{isEn ? 'Checking…' : 'Memeriksa…'}</span>
        </span>
      );
    }
    const isOnline = statusObj?.status === 'online' || statusObj?.online === true;
    if (isOnline) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
          title={statusObj?.active_server || ''}
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>{isEn ? 'Online' : 'Online'}</span>
          <span className="text-[9px] opacity-80">({statusObj?.tool_count ?? statusObj?.tools_count ?? 0} tools)</span>
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 bg-rose-500/15 text-rose-500 border-rose-500/30"
        title={statusObj?.error || (isEn ? 'Server unreachable' : 'Server tidak dapat dijangkau')}
      >
        <XCircle className="w-3 h-3" />
        <span>{isEn ? 'Offline' : 'Offline'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/80">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-accent" />
            {isEn ? 'MCP Server Connections' : 'Konfigurasi Server MCP'}
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            {isEn
              ? 'Manage endpoint connections, transport protocol, and authentication tokens for MCP gateways.'
              : 'Kelola endpoint koneksi, protokol transport, dan token autentikasi gateway server MCP.'}
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
            onClick={() => fetchStats && fetchStats()}
            disabled={statsLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-hover hover:bg-line border border-line text-content rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            title={isEn ? 'Check connection status' : 'Periksa status koneksi server'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">{isEn ? 'Ping Status' : 'Cek Status'}</span>
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSaveMcpConfig}
            disabled={mcpSaving}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>{mcpSaving ? (isEn ? 'Saving…' : 'Menyimpan…') : (isEn ? 'Save MCP' : 'Simpan MCP')}</span>
          </button>
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
              {isEn ? 'Are all 3 MCP gateways actively used?' : 'Apakah ketiga Gateway MCP ini semuanya digunakan?'}
            </p>
            <span className="hidden md:inline text-[11px] text-emerald-500 font-medium truncate">
              • {isEn ? 'Yes, each serves dedicated roles in SAP AI architecture' : 'Ya, masing-masing memiliki peran spesifik pada arsitektur sistem'}
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
                <span>SAP ERP Gateway</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Connects AI Assistant directly to SAP ECC / S4HANA via RFC/BAPI. Used for querying live tables (MARA, EKKO, BKPF) and executing SAP function modules.'
                  : 'Menghubungkan asisten ke SAP ECC/S4HANA via RFC/BAPI. Digunakan untuk membaca tabel SAP (MARA, EKKO, BKPF) dan eksekusi modul fungsi SAP.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface-sunken border border-line/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-content">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                <span>RAG Knowledge Gateway</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Connects AI Assistant to the enterprise vector database & SOP document index. Used for maintenance guides, operating procedures, and product manuals.'
                  : 'Menghubungkan asisten ke basis data vektor & dokumen SOP pabrik/perusahaan. Digunakan untuk manual panduan, SOP mesin, dan standar operasional.'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-surface-sunken border border-line/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-content">
                <Database className="w-3.5 h-3.5 text-sky-500" />
                <span>SQL & Database Gateway</span>
              </div>
              <p className="text-content-muted text-[11px] leading-relaxed">
                {isEn
                  ? 'Connects AI Assistant to relational database clusters and utilities. Used for operational analytics, SQL inspection queries, and internal helpers.'
                  : 'Menghubungkan asisten ke kluster SQL & utilitas analitik. Digunakan untuk inspeksi database operasional, kueri SQL relasional, dan helper internal.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: VISUAL FORM GUI */}
      {viewMode === 'visual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* CARD 1: SAP ERP GATEWAY */}
          <div className="p-4 rounded-2xl border border-line/80 bg-surface shadow-xs flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition-all">
            <div className="space-y-3">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-content font-display truncate">
                      {isEn ? 'SAP ERP Gateway' : 'SAP ERP Gateway'}
                    </h4>
                    <p className="text-[10px] text-content-subtle font-mono truncate">
                      {formState.sap.serverKey || DEFAULTS.sap.key}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                {renderStatusBadge(sapStatus)}
              </div>

              {formState.sap.isRawCustom && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEn ? 'Custom JSON detected. Edit via Raw JSON mode.' : 'Format JSON kustom terdeteksi. Gunakan mode JSON Mentah.'}</span>
                </div>
              )}

              {/* Field: Endpoint URL */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Endpoint URL' : 'URL Endpoint'}
                  </span>
                  <span className="text-[9px] font-mono text-content-subtle lowercase">http/https</span>
                </label>
                <input
                  type="text"
                  value={formState.sap.url}
                  onChange={(e) => handleFieldChange('sap', 'url', e.target.value)}
                  placeholder="http://192.168.1.162:8091/mcp"
                  className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 outline-none text-content transition-all"
                />
              </div>

              {/* Field: Transport Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                  <Layers className="w-3 h-3 text-content-subtle" />
                  {isEn ? 'Transport Protocol' : 'Protokol Transport'}
                </label>
                <select
                  value={formState.sap.type}
                  onChange={(e) => handleFieldChange('sap', 'type', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 outline-none text-content transition-all cursor-pointer font-medium"
                >
                  <option value="http">HTTP / SSE (Streamable MCP)</option>
                  <option value="stdio">STDIO (Local Command Process)</option>
                </select>
              </div>

              {/* Field: Bearer Token */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Bearer Token / API Key' : 'Token Autentikasi / Bearer'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTokenVisibility('sap')}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showTokens.sap ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showTokens.sap ? (isEn ? 'Hide' : 'Tutup') : (isEn ? 'Reveal' : 'Lihat')}</span>
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showTokens.sap ? 'text' : 'password'}
                    value={formState.sap.token}
                    onChange={(e) => handleFieldChange('sap', 'token', e.target.value)}
                    placeholder="Trias123"
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 outline-none text-content transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card Footer: Reset button */}
            <div className="pt-3 border-t border-line/60 flex items-center justify-between">
              <span className="text-[10px] text-content-subtle">
                RFC/BAPI • SAP ECC 6.0
              </span>
              <button
                type="button"
                onClick={() => handleResetGateway('sap')}
                className="flex items-center gap-1 text-[11px] text-content-muted hover:text-amber-500 transition-colors cursor-pointer"
                title={isEn ? 'Reset to default SAP config' : 'Kembalikan ke setting default SAP'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isEn ? 'Reset Default' : 'Reset Default'}</span>
              </button>
            </div>
          </div>

          {/* CARD 2: RAG KNOWLEDGE GATEWAY */}
          <div className="p-4 rounded-2xl border border-line/80 bg-surface shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition-all">
            <div className="space-y-3">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-content font-display truncate">
                      {isEn ? 'RAG Knowledge Gateway' : 'RAG Knowledge Gateway'}
                    </h4>
                    <p className="text-[10px] text-content-subtle font-mono truncate">
                      {formState.rag.serverKey || DEFAULTS.rag.key}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                {renderStatusBadge(ragStatus)}
              </div>

              {formState.rag.isRawCustom && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEn ? 'Custom JSON detected. Edit via Raw JSON mode.' : 'Format JSON kustom terdeteksi. Gunakan mode JSON Mentah.'}</span>
                </div>
              )}

              {/* Field: Endpoint URL */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Endpoint URL' : 'URL Endpoint'}
                  </span>
                  <span className="text-[9px] font-mono text-content-subtle lowercase">http/https</span>
                </label>
                <input
                  type="text"
                  value={formState.rag.url}
                  onChange={(e) => handleFieldChange('rag', 'url', e.target.value)}
                  placeholder="http://192.168.1.162:8090/mcp"
                  className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 outline-none text-content transition-all"
                />
              </div>

              {/* Field: Transport Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                  <Layers className="w-3 h-3 text-content-subtle" />
                  {isEn ? 'Transport Protocol' : 'Protokol Transport'}
                </label>
                <select
                  value={formState.rag.type}
                  onChange={(e) => handleFieldChange('rag', 'type', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 outline-none text-content transition-all cursor-pointer font-medium"
                >
                  <option value="http">HTTP / SSE (Streamable MCP)</option>
                  <option value="stdio">STDIO (Local Command Process)</option>
                </select>
              </div>

              {/* Field: Bearer Token */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Bearer Token / API Key' : 'Token Autentikasi / Bearer'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTokenVisibility('rag')}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showTokens.rag ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showTokens.rag ? (isEn ? 'Hide' : 'Tutup') : (isEn ? 'Reveal' : 'Lihat')}</span>
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showTokens.rag ? 'text' : 'password'}
                    value={formState.rag.token}
                    onChange={(e) => handleFieldChange('rag', 'token', e.target.value)}
                    placeholder="Trias123"
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 outline-none text-content transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card Footer: Reset button */}
            <div className="pt-3 border-t border-line/60 flex items-center justify-between">
              <span className="text-[10px] text-content-subtle">
                Vector DB • SOP & Tech Docs
              </span>
              <button
                type="button"
                onClick={() => handleResetGateway('rag')}
                className="flex items-center gap-1 text-[11px] text-content-muted hover:text-emerald-500 transition-colors cursor-pointer"
                title={isEn ? 'Reset to default RAG config' : 'Kembalikan ke setting default RAG'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isEn ? 'Reset Default' : 'Reset Default'}</span>
              </button>
            </div>
          </div>

          {/* CARD 3: SQL & DATABASE GATEWAY */}
          <div className="p-4 rounded-2xl border border-line/80 bg-surface shadow-xs flex flex-col justify-between space-y-4 hover:border-sky-500/40 transition-all">
            <div className="space-y-3">
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm text-content font-display truncate">
                      {isEn ? 'SQL & Database Gateway' : 'SQL & Database Gateway'}
                    </h4>
                    <p className="text-[10px] text-content-subtle font-mono truncate">
                      {formState.sql.serverKey || DEFAULTS.sql.key}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                {renderStatusBadge(sqlStatus)}
              </div>

              {formState.sql.isRawCustom && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{isEn ? 'Custom JSON detected. Edit via Raw JSON mode.' : 'Format JSON kustom terdeteksi. Gunakan mode JSON Mentah.'}</span>
                </div>
              )}

              {/* Field: Endpoint URL */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Endpoint URL' : 'URL Endpoint'}
                  </span>
                  <span className="text-[9px] font-mono text-content-subtle lowercase">http/https</span>
                </label>
                <input
                  type="text"
                  value={formState.sql.url}
                  onChange={(e) => handleFieldChange('sql', 'url', e.target.value)}
                  placeholder="http://192.168.1.162:8090/mcp"
                  className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 outline-none text-content transition-all"
                />
              </div>

              {/* Field: Transport Type */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1">
                  <Layers className="w-3 h-3 text-content-subtle" />
                  {isEn ? 'Transport Protocol' : 'Protokol Transport'}
                </label>
                <select
                  value={formState.sql.type}
                  onChange={(e) => handleFieldChange('sql', 'type', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 outline-none text-content transition-all cursor-pointer font-medium"
                >
                  <option value="http">HTTP / SSE (Streamable MCP)</option>
                  <option value="stdio">STDIO (Local Command Process)</option>
                </select>
              </div>

              {/* Field: Bearer Token */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-content-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="w-3 h-3 text-content-subtle" />
                    {isEn ? 'Bearer Token / API Key' : 'Token Autentikasi / Bearer'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleTokenVisibility('sql')}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {showTokens.sql ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showTokens.sql ? (isEn ? 'Hide' : 'Tutup') : (isEn ? 'Reveal' : 'Lihat')}</span>
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showTokens.sql ? 'text' : 'password'}
                    value={formState.sql.token}
                    onChange={(e) => handleFieldChange('sql', 'token', e.target.value)}
                    placeholder="Trias123"
                    className="w-full text-xs font-mono px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 outline-none text-content transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Card Footer: Reset button */}
            <div className="pt-3 border-t border-line/60 flex items-center justify-between">
              <span className="text-[10px] text-content-subtle">
                Relational SQL & Query Tools
              </span>
              <button
                type="button"
                onClick={() => handleResetGateway('sql')}
                className="flex items-center gap-1 text-[11px] text-content-muted hover:text-sky-500 transition-colors cursor-pointer"
                title={isEn ? 'Reset to default SQL config' : 'Kembalikan ke setting default SQL'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isEn ? 'Reset Default' : 'Reset Default'}</span>
              </button>
            </div>
          </div>
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
    </div>
  );
}
