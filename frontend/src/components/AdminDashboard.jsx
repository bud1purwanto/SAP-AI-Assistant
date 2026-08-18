import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Server, 
  Activity, 
  History, 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Save, 
  ShieldCheck, 
  MessageSquare, 
  Key, 
  UserCheck, 
  Database,
  Search,
  ExternalLink
} from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function AdminDashboard({ isOpen, onClose, user, onRefreshMcpServers }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'mcp' | 'audit'
  const [loading, setLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Stats State
  const [stats, setStats] = useState(null);

  // Users State
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', role: 'user', assistant_persona: '' });
  const [editUserForm, setEditUserForm] = useState({ role: 'user', assistant_persona: '', password: '' });

  // AI & MCP Config State
  const [openrouterModel, setOpenrouterModel] = useState('openrouter/auto');
  const [openrouterFallbackModel, setOpenrouterFallbackModel] = useState('openrouter/free');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [mcpSapConfig, setMcpSapConfig] = useState('');
  const [mcpRagConfig, setMcpRagConfig] = useState('');
  const [mcpSaving, setMcpSaving] = useState(false);

  // Audit Logs State
  const [auditSessions, setAuditSessions] = useState([]);
  const [selectedAuditSession, setSelectedAuditSession] = useState(null);
  const [auditMessages, setAuditMessages] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Gagal load stats:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error("Gagal load users:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`, {
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const data = await res.json();
        setMcpSapConfig(data.mcp_sap_config_json || '');
        setMcpRagConfig(data.mcp_rag_config_json || '');
        setOpenrouterModel(data.openrouter_model || 'openrouter/auto');
        setOpenrouterFallbackModel(data.openrouter_fallback_model || 'openrouter/free');
        setOpenrouterApiKey(data.openrouter_api_key || '');
      }
    } catch (err) {
      console.error("Gagal load config:", err);
    }
  };

  const fetchAuditSessions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/sessions?limit=100`, {
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditSessions(data);
      }
    } catch (err) {
      console.error("Gagal load audit sessions:", err);
    }
  };

  const fetchAuditMessages = async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/sessions/${sessionId}/messages`, {
        headers: { 'X-User-Name': user.username }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditMessages(data);
      }
    } catch (err) {
      console.error("Gagal load audit messages:", err);
    }
  };

  useEffect(() => {
    if (isOpen && user?.role === 'superadmin') {
      setActionSuccess('');
      setActionError('');
      fetchStats();
      fetchUsers();
      fetchConfig();
      fetchAuditSessions();
    }
  }, [isOpen, user]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Name': user.username
        },
        body: JSON.stringify(newUserForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || "Gagal membuat user.");
      
      setActionSuccess(`User '${newUserForm.username}' berhasil dibuat!`);
      setNewUserForm({ username: '', password: '', role: 'user', assistant_persona: '' });
      setIsAddUserOpen(false);
      fetchUsers();
      fetchStats();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setActionError('');
    setActionSuccess('');
    try {
      const payload = {
        role: editUserForm.role,
        assistant_persona: editUserForm.assistant_persona
      };
      if (editUserForm.password) {
        payload.password = editUserForm.password;
      }
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Name': user.username
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || "Gagal memperbarui user.");
      
      setActionSuccess(`User '${editingUser.username}' berhasil diperbarui!`);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteUser = async (targetUsername) => {
    if (!window.confirm(`Yakin ingin menghapus user '${targetUsername}'? Semua riwayat chat user ini akan dihapus.`)) return;
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${targetUsername}`, {
        method: 'DELETE',
        headers: { 'X-User-Name': user.username }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || "Gagal menghapus user.");
      
      setActionSuccess(`User '${targetUsername}' berhasil dihapus.`);
      fetchUsers();
      fetchStats();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleSaveMcpConfig = async () => {
    setMcpSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Name': user.username
        },
        body: JSON.stringify({
          mcp_sap_config_json: mcpSapConfig,
          mcp_rag_config_json: mcpRagConfig,
          openrouter_model: openrouterModel,
          openrouter_fallback_model: openrouterFallbackModel,
          openrouter_api_key: openrouterApiKey,
          assistant_persona: user.assistant_persona || ""
        })
      });
      if (!res.ok) throw new Error("Gagal menyimpan konfigurasi sistem.");
      setActionSuccess("Konfigurasi AI Model & MCP SAP/RAG berhasil disimpan ke Database!");
      if (onRefreshMcpServers) onRefreshMcpServers();
      fetchStats();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setMcpSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = usersList.filter(u => 
    u.username.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.role.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredAuditSessions = auditSessions.filter(s => 
    s.username.toLowerCase().includes(auditSearch.toLowerCase()) ||
    s.title.toLowerCase().includes(auditSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-indigo-600 rounded-xl text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Super Admin Control Center
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kelola User, Konfigurasi Server MCP, Audit Riwayat Chat, dan Metrik Sistem
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Notifications Alert */}
        {actionSuccess && (
          <div className="mx-6 mt-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/80 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess('')} className="text-xs text-emerald-600 hover:underline">Tutup</button>
          </div>
        )}

        {actionError && (
          <div className="mx-6 mt-3 px-4 py-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 rounded-xl text-rose-800 dark:text-rose-300 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError('')} className="text-xs text-rose-600 hover:underline">Tutup</button>
          </div>
        )}

        {/* Main Content Area: Sidebar Navigation + Tab Pane */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Internal Navigation Tabs */}
          <div className="w-56 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-1.5 flex-shrink-0">
            <button
              onClick={() => { setActiveTab('overview'); setSelectedAuditSession(null); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Overview & Stats</span>
            </button>

            <button
              onClick={() => { setActiveTab('users'); setSelectedAuditSession(null); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>User Management</span>
            </button>

            <button
              onClick={() => { setActiveTab('mcp'); setSelectedAuditSession(null); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'mcp'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>MCP Configuration</span>
            </button>

            <button
              onClick={() => { setActiveTab('audit'); }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Audit Log & Chats</span>
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900">
            
            {/* TAB 1: OVERVIEW & STATS */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" /> Ringkasan Sistem
                  </h3>
                  <button 
                    onClick={fetchStats}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
                  </button>
                </div>

                {/* Metrics Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-200/70 dark:border-indigo-900/50">
                    <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">Total User</span>
                      <Users className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
                      {stats?.total_users ?? '-'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Akun aktif terdaftar di PostgreSQL</p>
                  </div>

                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/40 dark:to-slate-900 border border-purple-200/70 dark:border-purple-900/50">
                    <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">Total Sesi Chat</span>
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
                      {stats?.total_sessions ?? '-'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Percakapan tersimpan di sistem</p>
                  </div>

                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-200/70 dark:border-emerald-900/50">
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">Total Pesan</span>
                      <Database className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-extrabold mt-2 text-slate-900 dark:text-white">
                      {stats?.total_messages ?? '-'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Query user & jawaban AI</p>
                  </div>
                </div>

                {/* MCP Live Status Card */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-500" /> Status Live MCP Servers
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* MCP SAP Card */}
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-100">MCP SAP Gateway</span>
                        {(stats?.mcp_status?.sap?.status === 'online' || stats?.mcp_status?.sap?.online === true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300" title={stats?.mcp_status?.sap?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {stats?.mcp_status?.sap?.tools_count ?? stats?.mcp_status?.sap?.tool_count ?? 0} Tools tersedia • Active Server: {stats?.mcp_status?.sap?.active_server || 'Default'}
                      </p>
                    </div>

                    {/* MCP RAG Card */}
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-100">MCP RAG Knowledge</span>
                        {(stats?.mcp_status?.rag?.status === 'online' || stats?.mcp_status?.rag?.online === true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300" title={stats?.mcp_status?.rag?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {stats?.mcp_status?.rag?.tools_count ?? stats?.mcp_status?.rag?.tool_count ?? 0} Vector Search & Document Tools
                      </p>
                    </div>
                  </div>
                </div>

                {/* Top Active Users */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-500" /> User Paling Aktif
                  </h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {stats?.top_users?.length > 0 ? (
                      stats.top_users.map((u, i) => (
                        <div key={i} className="py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center">
                              {i + 1}
                            </div>
                            <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{u.username}</span>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                            {u.sessions} Sesi Chat
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 py-3">Belum ada data aktivitas sesi.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: USER MANAGEMENT (CRUD) */}
            {activeTab === 'users' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-500" /> Manajemen User ({usersList.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tambah akun baru, ubah role / password, atau hapus user.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Cari user..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 sm:w-48"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddUserOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                    >
                      <Plus className="w-4 h-4" /> User Baru
                    </button>
                  </div>
                </div>

                {/* Users Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-4 py-3">Username</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Custom Persona</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((u) => (
                          <tr key={u.username} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-indigo-600">
                                {u.username.substring(0, 2).toUpperCase()}
                              </div>
                              {u.username}
                              {u.username === user.username && (
                                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 px-1.5 py-0.5 rounded font-normal">Anda</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                u.role === 'superadmin' 
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' 
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                              }`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                              {u.assistant_persona || <span className="italic text-slate-400">Default global persona</span>}
                            </td>
                            <td className="px-4 py-3 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setEditUserForm({ role: u.role, assistant_persona: u.assistant_persona || '', password: '' });
                                }}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title="Edit user"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.username)}
                                disabled={u.username === user.username}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.username === user.username 
                                    ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed' 
                                    : 'text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                                title="Hapus user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="text-center py-6 text-slate-400 text-xs">
                            Tidak ada data user yang sesuai.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MODAL: ADD USER */}
                {isAddUserOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Plus className="w-4 h-4 text-indigo-500" /> Tambah User Baru
                        </h4>
                        <button onClick={() => setIsAddUserOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateUser} className="space-y-3.5 text-sm">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Username *</label>
                          <input 
                            type="text"
                            required
                            value={newUserForm.username}
                            onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="misal: TRST-USER1"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Password *</label>
                          <input 
                            type="password"
                            required
                            value={newUserForm.password}
                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Minimal 6 karakter"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Role</label>
                          <select
                            value={newUserForm.role}
                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="user">User Biasa</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Custom Persona (Opsional)</label>
                          <textarea 
                            rows="2"
                            value={newUserForm.assistant_persona}
                            onChange={(e) => setNewUserForm({ ...newUserForm, assistant_persona: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Persona khusus untuk user ini..."
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsAddUserOpen(false)}
                            className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md"
                          >
                            Buat Akun
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* MODAL: EDIT USER */}
                {editingUser && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-indigo-500" /> Edit User '{editingUser.username}'
                        </h4>
                        <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleUpdateUser} className="space-y-3.5 text-sm">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Role</label>
                          <select
                            value={editUserForm.role}
                            onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="user">User Biasa</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Reset Password (kosongkan jika tidak ingin diubah)
                          </label>
                          <input 
                            type="password"
                            value={editUserForm.password}
                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Password baru..."
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Custom Persona</label>
                          <textarea 
                            rows="3"
                            value={editUserForm.assistant_persona}
                            onChange={(e) => setEditUserForm({ ...editUserForm, assistant_persona: e.target.value })}
                            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Persona AI khusus user ini..."
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md"
                          >
                            Simpan Perubahan
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MCP CONFIGURATION & AI MODEL */}
            {activeTab === 'mcp' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Server className="w-5 h-5 text-indigo-500" /> Konfigurasi AI Model & Server MCP
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Edit Model AI utama, Model AI fallback/gratis, API Key OpenRouter, dan konfigurasi MCP di database.
                    </p>
                  </div>
                  <button
                    onClick={handleSaveMcpConfig}
                    disabled={mcpSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {mcpSaving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                  </button>
                </div>

                {/* AI Model Setting Panel */}
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Pengaturan Model AI (OpenRouter)
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Primary AI Model
                      </label>
                      <input 
                        type="text"
                        value={openrouterModel}
                        onChange={(e) => setOpenrouterModel(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="openrouter/auto"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Default: <code>openrouter/auto</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Fallback AI Model
                      </label>
                      <input 
                        type="text"
                        value={openrouterFallbackModel}
                        onChange={(e) => setOpenrouterFallbackModel(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="openrouter/free"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Cadangan jika kuota model utama habis
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        OpenRouter API Key
                      </label>
                      <input 
                        type="password"
                        value={openrouterApiKey}
                        onChange={(e) => setOpenrouterApiKey(e.target.value)}
                        className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="sk-or-v1-..."
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        API Key OpenRouter
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* MCP SAP Config JSON */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <Database className="w-4 h-4 text-amber-500" /> MCP SAP Config (JSON)
                    </label>
                    <textarea 
                      rows="6"
                      value={mcpSapConfig}
                      onChange={(e) => setMcpSapConfig(e.target.value)}
                      className="w-full font-mono text-xs px-3.5 py-3 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-slate-200"
                      placeholder='{"type": "sse", "url": "http://127.0.0.1:8001/sse"}'
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Format konfigurasi SSE atau stdio untuk koneksi ke SAP MCP Server.
                    </p>
                  </div>

                  {/* MCP RAG Config JSON */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-500" /> MCP RAG Config (JSON)
                    </label>
                    <textarea 
                      rows="6"
                      value={mcpRagConfig}
                      onChange={(e) => setMcpRagConfig(e.target.value)}
                      className="w-full font-mono text-xs px-3.5 py-3 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-slate-200"
                      placeholder='{"type": "sse", "url": "http://127.0.0.1:8002/sse"}'
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Format konfigurasi SSE atau stdio untuk koneksi ke RAG Knowledge Base.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: AUDIT LOGS & ALL SESSIONS */}
            {activeTab === 'audit' && (
              <div className="h-full flex flex-col space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <History className="w-5 h-5 text-indigo-500" /> Audit Log Percakapan
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Pantau percakapan dari seluruh user untuk keperluan audit dan troubleshooting.
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Cari user / judul chat..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="pl-9 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-64"
                    />
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0">
                  {/* Sessions List */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-y-auto max-h-[55vh] divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    {filteredAuditSessions.length > 0 ? (
                      filteredAuditSessions.map((s) => (
                        <button
                          key={s.session_id}
                          onClick={() => {
                            setSelectedAuditSession(s);
                            fetchAuditMessages(s.session_id);
                          }}
                          className={`w-full text-left p-3 transition-colors ${
                            selectedAuditSession?.session_id === s.session_id
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-l-4 border-indigo-600'
                              : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{s.username}</span>
                            <span className="text-[10px] text-slate-400">{s.updated_at ? s.updated_at.slice(0, 10) : ''}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-1">{s.title}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                              {s.message_count} pesan
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-center text-xs text-slate-400 py-8">Belum ada riwayat sesi ditemukan.</p>
                    )}
                  </div>

                  {/* Messages Viewer */}
                  <div className="md:col-span-2 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-y-auto max-h-[55vh] bg-white dark:bg-slate-900 flex flex-col">
                    {selectedAuditSession ? (
                      <div className="space-y-4">
                        <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{selectedAuditSession.title}</h4>
                            <p className="text-xs text-slate-500">User: <span className="font-semibold text-indigo-600">{selectedAuditSession.username}</span> • ID: {selectedAuditSession.session_id}</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {auditMessages.length > 0 ? (
                            auditMessages.map((m, i) => (
                              <div 
                                key={i} 
                                className={`p-3 rounded-xl text-xs ${
                                  m.role === 'user' 
                                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-indigo-950 dark:text-indigo-200' 
                                    : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1 font-semibold">
                                  <span>{m.role === 'user' ? selectedAuditSession.username : 'AI Assistant'}</span>
                                  <span className="text-[10px] text-slate-400">{m.created_at ? m.created_at.slice(11, 16) : ''}</span>
                                </div>
                                <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                              </div>
                            ))
                          ) : (
                            <p className="text-center text-xs text-slate-400 py-6">Memuat pesan...</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                        Pilih salah satu sesi di sebelah kiri untuk melihat pesan percakapan.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}