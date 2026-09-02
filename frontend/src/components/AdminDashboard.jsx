import React, { useState, useEffect } from 'react';
import { Activity, ArrowLeft, BookOpen, CheckCircle, Code, Database, Edit3, Gauge, History, Key, Mail, MessageSquare, Plus, RefreshCw, RotateCcw, Save, Search, Server, ShieldCheck, Sliders, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, UserCheck, Users, X, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmModal from './ConfirmModal';
import AdminChatModes from './AdminChatModes';

export default function AdminDashboard({ isOpen, onClose, user, onRefreshMcpServers, onRefreshModes }) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'persona' | 'mcp' | 'audit'
  const [globalPersona, setGlobalPersona] = useState('');
  const [personaSaving, setPersonaSaving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Reusable Standardized Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    variant: 'danger',
    isLoading: false,
    onConfirm: null,
  });

  // Stats State
  const [stats, setStats] = useState(null);

  // Feedback State — daftar jawaban yang dinilai pengguna
  const [feedbackKind, setFeedbackKind] = useState('dislike');
  const [feedbackData, setFeedbackData] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Users State
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', full_name: '', role: 'abaper', assistant_persona: '' });
  const [editUserForm, setEditUserForm] = useState({ role: 'user', assistant_persona: '', password: '', full_name: '' });

  // Skills State
  const [skillsList, setSkillsList] = useState([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [newSkillForm, setNewSkillForm] = useState({ name: '', description: '', content: '', enabled: true });
  const [editSkillForm, setEditSkillForm] = useState({ name: '', description: '', content: '', enabled: true });
  const [skillSaving, setSkillSaving] = useState(false);

  // AI & MCP Config State
  const [nineRouterEnabled, setNineRouterEnabled] = useState(true);
  const [nineRouterBaseUrl, setNineRouterBaseUrl] = useState('http://192.168.88.83:20128/v1');
  const [nineRouterModel, setNineRouterModel] = useState('ag/gemini-3.7-flash-medium');
  const [nineRouterApiKey, setNineRouterApiKey] = useState('');

  const [openrouterEnabled, setOpenrouterEnabled] = useState(false);
  const [openrouterModel, setOpenrouterModel] = useState('openrouter/auto');
  const [openrouterFallbackModel, setOpenrouterFallbackModel] = useState('openrouter/free');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');

  const [mcpSapConfig, setMcpSapConfig] = useState('');
  const [mcpRagConfig, setMcpRagConfig] = useState('');
  const [mcpSqlConfig, setMcpSqlConfig] = useState('');
  const [mcpSaving, setMcpSaving] = useState(false);

  // Audit Logs State
  const [auditSessions, setAuditSessions] = useState([]);
  const [selectedAuditSession, setSelectedAuditSession] = useState(null);
  const [auditMessages, setAuditMessages] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');

  // Kuota Token State
  const [kuota, setKuota] = useState(null);
  const [kuotaLoading, setKuotaLoading] = useState(false);
  const [batasDraft, setBatasDraft] = useState({});
  const [kuotaUserSearch, setKuotaUserSearch] = useState('');

  const fetchStats = async () => {
    try {
      setStats(await api.adminStats());
    } catch (err) {
      console.error("Gagal load stats:", err);
    }
  };

  const fetchFeedback = async (kind) => {
    setFeedbackLoading(true);
    try {
      setFeedbackData(await api.adminFeedback(kind));
    } catch (err) {
      console.error("Gagal load feedback:", err);
      setFeedbackData({ total: 0, items: [] });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersList(await api.adminUsers());
    } catch (err) {
      console.error("Gagal load users:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const data = await api.getConfig();
      {
        setGlobalPersona(data.global_assistant_persona || '');
        setMcpSapConfig(data.mcp_sap_config_json || '');
        setMcpRagConfig(data.mcp_rag_config_json || '');
        setMcpSqlConfig(data.mcp_sql_config_json || data.mcp_email_config_json || '');
        setNineRouterEnabled(data.nine_router_enabled !== undefined ? data.nine_router_enabled : true);
        setNineRouterBaseUrl(data.nine_router_base_url || 'http://192.168.88.83:20128/v1');
        setNineRouterModel(data.nine_router_model || 'ag/gemini-3.7-flash-medium');
        setNineRouterApiKey(data.nine_router_api_key || '');
        setOpenrouterEnabled(data.openrouter_enabled !== undefined ? data.openrouter_enabled : false);
        setOpenrouterModel(data.openrouter_model || 'openrouter/auto');
        setOpenrouterFallbackModel(data.openrouter_fallback_model || 'openrouter/free');
        setOpenrouterApiKey(data.openrouter_api_key || '');
      }
    } catch (err) {
      console.error("Gagal load config:", err);
    }
  };

  const fetchSkills = async () => {
    try {
      setSkillsList(await api.adminSkills());
    } catch (err) {
      console.error("Gagal load skills:", err);
    }
  };

  const fetchAuditSessions = async () => {
    try {
      setAuditSessions(await api.adminSessions(100));
    } catch (err) {
      console.error("Gagal load audit sessions:", err);
    }
  };

  const fetchAuditMessages = async (sessionId) => {
    try {
      setAuditMessages(await api.adminSessionMessages(sessionId));
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
      fetchSkills();
      fetchConfig();
      fetchAuditSessions();
    }
  }, [isOpen, user?.role]);

  useEffect(() => {
    if (isOpen && user?.role === 'superadmin' && activeTab === 'feedback') {
      fetchFeedback(feedbackKind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.role, activeTab, feedbackKind]);

  const fetchKuota = async () => {
    setKuotaLoading(true);
    try {
      const data = await api.adminQuota();
      setKuota(data);
      // Inisialisasi draft batas peran sesuai data backend.
      const draft = {};
      Object.entries(data.role_limits || {}).forEach(([peran, cfg]) => {
        draft[peran] = {
          daily_token_limit: cfg.daily_token_limit ?? 0,
          per_minute_limit: cfg.per_minute_limit ?? 0,
        };
      });
      setBatasDraft(draft);
    } catch (err) {
      console.error('Gagal load kuota token:', err);
      setActionError(language === 'en' ? `Failed to load token quotas: ${err.message}` : `Gagal memuat kuota token: ${err.message}`);
    } finally {
      setKuotaLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user?.role === 'superadmin' && activeTab === 'kuota') {
      fetchKuota();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.role, activeTab]);

  const gantiSaklar = async (aktif) => {
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminQuotaSaklar(aktif);
      setKuota((k) => (k ? { ...k, enforced: aktif } : k));
      setActionSuccess(
        aktif
          ? (language === 'en' ? 'Token enforcement enabled — requests blocked after quota exhausted.' : 'Pembatasan token dinyalakan — permintaan ditolak setelah kuota habis.')
          : (language === 'en' ? 'Token enforcement disabled — usage recorded, unlimited prompts.' : 'Pembatasan token dimatikan — pemakaian tetap dicatat, prompt bebas.')
      );
    } catch (err) {
      setActionError(err.message);
    }
  };

  const formatNumberSeparator = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const clean = String(val).replace(/\D/g, '');
    if (!clean) return '';
    return Number(clean).toLocaleString(language === 'en' ? 'en-US' : 'id-ID');
  };

  const formatTokenWordHelper = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const num = Number(String(val).replace(/\D/g, ''));
    if (!Number.isFinite(num)) return '';
    if (num === 0) return language === 'en' ? 'Unlimited' : 'Tanpa Batas';
    if (num >= 1_000_000_000) {
      const b = (num / 1_000_000_000).toLocaleString(language === 'en' ? 'en-US' : 'id-ID', { maximumFractionDigits: 2 });
      return language === 'en' ? `${b} Billion` : `${b} Miliar`;
    }
    if (num >= 1_000_000) {
      const m = (num / 1_000_000).toLocaleString(language === 'en' ? 'en-US' : 'id-ID', { maximumFractionDigits: 2 });
      return language === 'en' ? `${m} Million` : `${m} Juta`;
    }
    if (num >= 1_000) {
      const k = (num / 1_000).toLocaleString(language === 'en' ? 'en-US' : 'id-ID', { maximumFractionDigits: 1 });
      return language === 'en' ? `${k} Thousand` : `${k} Ribu`;
    }
    return '';
  };

  const simpanBatas = async (peran) => {
    setActionError('');
    setActionSuccess('');
    const draft = batasDraft[peran] || {};
    const rawHarian = String(draft.daily_token_limit ?? '').replace(/\D/g, '');
    const rawPermenit = String(draft.per_minute_limit ?? '').replace(/\D/g, '');
    const harian = rawHarian === '' ? 0 : Number.parseInt(rawHarian, 10);
    const permenit = rawPermenit === '' ? 0 : Number.parseInt(rawPermenit, 10);
    if (!Number.isFinite(harian) || !Number.isFinite(permenit) || harian < 0 || permenit < 0) {
      setActionError(language === 'en' ? 'Limits must be non-negative integers.' : 'Batas harus berupa angka bulat 0 atau lebih.');
      return;
    }
    try {
      const hasil = await api.adminQuotaBatas({
        role: peran,
        daily_token_limit: harian,
        per_minute_limit: permenit,
      });
      setKuota((k) => (k ? { ...k, role_limits: hasil.role_limits } : k));
      setActionSuccess(language === 'en' ? `Limits for role '${peran}' saved.` : `Batas peran '${peran}' tersimpan.`);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const resetKuota = (username) => {
    const sasaran = username || (language === 'en' ? 'ALL users' : 'SEMUA pengguna');
    setConfirmModal({
      isOpen: true,
      variant: 'reset',
      title: language === 'en' ? 'Reset Token Quota' : 'Reset Kuota Token',
      message: language === 'en' 
        ? `Are you sure you want to reset today's token usage to 0 for ${sasaran}?`
        : `Apakah Anda yakin ingin menolkan pemakaian token hari ini untuk ${sasaran}?`,
      confirmText: language === 'en' ? 'Reset' : 'Reset',
      cancelText: language === 'en' ? 'Cancel' : 'Batal',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        setActionError('');
        setActionSuccess('');
        try {
          const hasil = await api.adminQuotaReset(username);
          setActionSuccess(language === 'en' ? `Usage for ${hasil.direset} reset to 0.` : `Pemakaian ${hasil.direset} sudah dinolkan.`);
          fetchKuota();
          setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
        } catch (err) {
          setActionError(err.message);
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminCreateUser(newUserForm);
      
      setActionSuccess(language === 'en' ? `User '${newUserForm.username}' created successfully!` : `User '${newUserForm.username}' berhasil dibuat!`);
      setNewUserForm({ username: '', password: '', full_name: '', role: 'abaper', assistant_persona: '' });
      setIsAddUserOpen(false);
      fetchUsers();
      fetchStats();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleUpdateUser = async (e, username = editingUser?.username) => {
    if (e && e.preventDefault) e.preventDefault();
    const targetUsername = typeof username === 'string' ? username : editingUser?.username;
    if (!targetUsername) return;
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminUpdateUser(targetUsername, editUserForm);
      setActionSuccess(language === 'en' ? `User '${targetUsername}' updated successfully!` : `User '${targetUsername}' berhasil diupdate!`);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteUser = (username) => {
    setConfirmModal({
      isOpen: true,
      variant: 'danger',
      title: language === 'en' ? 'Delete User' : 'Hapus User',
      message: language === 'en' 
        ? `Are you sure you want to permanently delete user "${username}"? This action cannot be undone.`
        : `Apakah Anda yakin ingin menghapus user "${username}" secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: language === 'en' ? 'Delete' : 'Hapus',
      cancelText: language === 'en' ? 'Cancel' : 'Batal',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        setActionError('');
        setActionSuccess('');
        try {
          await api.adminDeleteUser(username);
          setActionSuccess(language === 'en' ? `User '${username}' deleted!` : `User '${username}' berhasil dihapus!`);
          fetchUsers();
          fetchStats();
          setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
        } catch (err) {
          setActionError(err.message);
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  const handleSaveGlobalPersona = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setPersonaSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.saveConfig({
        global_assistant_persona: globalPersona,
        assistant_persona: user.assistant_persona || ""
      });
      setActionSuccess(language === 'en' ? 'Global Organization Persona saved!' : 'Persona Organisasi (Global) berhasil disimpan!');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPersonaSaving(false);
    }
  };

  const handleCreateSkill = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSkillSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminCreateSkill(newSkillForm);
      setActionSuccess(language === 'en' ? `Skill '${newSkillForm.name}' added!` : `Skill '${newSkillForm.name}' berhasil ditambahkan!`);
      setNewSkillForm({ name: '', description: '', content: '', enabled: true });
      setIsAddSkillOpen(false);
      fetchSkills();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSkillSaving(false);
    }
  };

  const handleUpdateSkill = async (e, id = editingSkill?.id) => {
    if (e && e.preventDefault) e.preventDefault();
    const targetId = (typeof id === 'number' || typeof id === 'string') ? id : editingSkill?.id;
    if (!targetId) return;
    setSkillSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminUpdateSkill(targetId, editSkillForm);
      setActionSuccess(language === 'en' ? `Skill '${editSkillForm.name}' updated!` : `Skill '${editSkillForm.name}' berhasil diupdate!`);
      setEditingSkill(null);
      fetchSkills();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSkillSaving(false);
    }
  };

  const handleDeleteSkill = (id, name) => {
    setConfirmModal({
      isOpen: true,
      variant: 'danger',
      title: language === 'en' ? 'Delete Skill' : 'Hapus Skill',
      message: language === 'en' 
        ? `Are you sure you want to delete skill "${name}"?`
        : `Apakah Anda yakin ingin menghapus skill "${name}"?`,
      confirmText: language === 'en' ? 'Delete' : 'Hapus',
      cancelText: language === 'en' ? 'Cancel' : 'Batal',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        setActionError('');
        setActionSuccess('');
        try {
          await api.adminDeleteSkill(id);
          setActionSuccess(language === 'en' ? `Skill '${name}' deleted!` : `Skill '${name}' berhasil dihapus!`);
          fetchSkills();
          setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
        } catch (err) {
          setActionError(err.message);
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  const handleToggleSkill = async (skill) => {
    try {
      await api.adminUpdateSkill(skill.id, { enabled: !skill.enabled });
      fetchSkills();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleSaveMcpConfig = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setMcpSaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.saveConfig({
        mcp_sap_config_json: mcpSapConfig,
        mcp_rag_config_json: mcpRagConfig,
        mcp_sql_config_json: mcpSqlConfig,
        mcp_email_config_json: mcpSqlConfig,
        assistant_persona: user.assistant_persona || ""
      });
      setActionSuccess(language === 'en' ? 'MCP server configuration saved successfully!' : 'Konfigurasi server MCP berhasil disimpan!');
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

  const filteredSkills = skillsList.filter(s =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
    s.description.toLowerCase().includes(skillSearch.toLowerCase()) ||
    s.content.toLowerCase().includes(skillSearch.toLowerCase())
  );

  const filteredAuditSessions = auditSessions.filter(s => 
    s.username.toLowerCase().includes(auditSearch.toLowerCase()) ||
    s.title.toLowerCase().includes(auditSearch.toLowerCase())
  );

  const tabCategories = [
    {
      groupName: language === 'en' ? 'Monitoring & Metrics' : 'Monitoring & Metrik',
      tabs: [
        { id: 'overview', icon: Activity, label: t('admin.tabOverview') },
        { id: 'audit', icon: History, label: t('admin.tabAudit') },
        { id: 'feedback', icon: ThumbsDown, label: t('admin.tabFeedback') },
      ],
    },
    {
      groupName: language === 'en' ? 'Users & Quotas' : 'Pengguna & Kuota',
      tabs: [
        { id: 'users', icon: Users, label: t('admin.tabUsers') },
        { id: 'kuota', icon: Gauge, label: t('admin.tabTokenQuota') },
      ],
    },
    {
      groupName: language === 'en' ? 'AI & System Config' : 'Konfigurasi AI & Sistem',
      tabs: [
        { id: 'chat_modes', icon: Sliders, label: t('admin.tabChatModes') },
        { id: 'persona', icon: Sparkles, label: t('admin.tabPersona') },
        { id: 'mcp', icon: Server, label: t('admin.tabMcp') },
        { id: 'skills', icon: BookOpen, label: t('admin.tabSkills') },
      ],
    },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-surface-raised w-screen overflow-hidden text-content animate-fadeIn"
        style={{ height: 'var(--app-height, 100dvh)' }}
      >
      {/* Header Modal */}
      <div
        className="flex items-center justify-between px-5 sm:px-8 pb-3.5 border-b border-line/80 bg-surface/90 backdrop-blur-xl shrink-0"
        style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1rem)' }}
      >
        <div className="flex items-center gap-3.5 min-w-0 pr-4">
          <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/10">
            <ShieldCheck className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-content truncate font-display leading-tight">
                {t('admin.title')}
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-surface-sunken border border-line text-content-muted">
                SUPER
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-content-muted truncate mt-0.5 flex items-center gap-1.5">
              <span>{language === 'en' ? 'Administration Console' : 'Konsol Administrasi'}</span>
              <span className="text-content-subtle">/</span>
              <span className="text-accent font-semibold">
                {activeTab === 'overview' ? t('admin.tabOverview') :
                 activeTab === 'users' ? t('admin.tabUsers') :
                 activeTab === 'chat_modes' ? t('admin.tabChatModes') :
                 activeTab === 'persona' ? t('admin.tabPersona') :
                 activeTab === 'skills' ? t('admin.tabSkills') :
                 activeTab === 'mcp' ? t('admin.tabMcp') :
                 activeTab === 'kuota' ? t('admin.tabTokenQuota') :
                 activeTab === 'feedback' ? t('admin.tabFeedback') : t('admin.tabAudit')}
              </span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium px-2 py-1 rounded-md bg-surface-sunken border border-line text-content-subtle">
            Esc
          </kbd>
          <button 
            onClick={onClose}
            className="-mr-1 p-2 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-colors shrink-0 cursor-pointer border border-line/60 hover:border-line"
            aria-label={t('admin.closeAria')}
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Global Notifications Alert */}
      {actionSuccess && (
        <div className="mx-4 sm:mx-8 mt-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/80 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm flex items-center justify-between animate-fadeIn shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-xs text-emerald-600 hover:underline shrink-0 cursor-pointer">{t('common.close')}</button>
        </div>
      )}

      {actionError && (
        <div className="mx-4 sm:mx-8 mt-3 px-4 py-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 rounded-xl text-rose-800 dark:text-rose-300 text-xs sm:text-sm flex items-center justify-between animate-fadeIn shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-xs text-rose-600 hover:underline shrink-0 cursor-pointer">{t('common.close')}</button>
        </div>
      )}

      {/* Main Content Area: Horizontal tabs on mobile, Vertical categorized sidebar on desktop */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* Categorized Navigation Tabs */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-line/80 bg-surface p-2.5 sm:p-3.5 flex flex-row md:flex-col gap-2 md:gap-3 overflow-x-auto md:overflow-x-visible shrink-0 overscroll-contain">
          {tabCategories.map((group) => (
            <div key={group.groupName} className="flex flex-row md:flex-col gap-1 shrink-0 md:shrink">
              <div className="hidden md:flex items-center gap-2 px-3 pt-2 pb-1">
                <span className="text-[10px] font-bold tracking-wider text-content-subtle uppercase">
                  {group.groupName}
                </span>
                <div className="h-px flex-1 bg-line/60" />
              </div>
              {group.tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id !== 'audit') setSelectedAuditSession(null);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0 md:shrink cursor-pointer group ${
                      isActive
                        ? 'bg-accent/15 text-accent font-bold border border-accent/35 shadow-xs shadow-accent/10'
                        : 'text-content-muted hover:bg-surface-hover hover:text-content border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${isActive ? 'text-accent' : 'text-content-subtle group-hover:text-content'}`} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-surface-raised pb-[max(2rem,env(safe-area-inset-bottom))]">
            
            {/* TAB 1: OVERVIEW & STATS */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight">
                      {language === 'en' ? 'System Overview & Metrics' : 'Ringkasan & Metrik Sistem'}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Chat activity statistics, user satisfaction, and live MCP server status.' : 'Statistik aktivitas percakapan, kepuasan pengguna, dan status live server MCP.'}
                    </p>
                  </div>
                  <button 
                    onClick={fetchStats}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 transition-all cursor-pointer w-fit"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {language === 'en' ? 'Refresh Status' : 'Refresh Status'}
                  </button>
                </div>

                {/* Metrics Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
                  {/* Total Users */}
                  <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-indigo-500/40 hover:shadow-md transition-all group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Total Users' : 'Total Pengguna'}</span>
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center shadow-xs">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black mt-2 text-content font-mono tracking-tight">
                      {stats?.total_users ?? '-'}
                    </p>
                    <p className="text-[11px] text-content-muted mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      {language === 'en' ? 'Active registered accounts' : 'Akun aktif terdaftar di sistem'}
                    </p>
                  </div>

                  {/* Total Chat Sessions */}
                  <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-violet-500/40 hover:shadow-md transition-all group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Total Sessions' : 'Total Sesi Chat'}</span>
                      <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center justify-center shadow-xs">
                        <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black mt-2 text-content font-mono tracking-tight">
                      {stats?.total_sessions ?? '-'}
                    </p>
                    <p className="text-[11px] text-content-muted mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      {language === 'en' ? 'Conversations stored in database' : 'Percakapan tersimpan di sistem'}
                    </p>
                  </div>

                  {/* Total Messages */}
                  <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-emerald-500/40 hover:shadow-md transition-all group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Total Messages' : 'Total Pesan'}</span>
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shadow-xs">
                        <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black mt-2 text-content font-mono tracking-tight">
                      {stats?.total_messages ?? '-'}
                    </p>
                    <p className="text-[11px] text-content-muted mt-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {language === 'en' ? 'Queries & AI responses' : 'Query pengguna & respon AI'}
                    </p>
                  </div>
                </div>

                {/* User Satisfaction & Feedback Card */}
                <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-2 font-display">
                      <ThumbsUp className="w-4 h-4 text-emerald-500" /> {language === 'en' ? 'AI Response Satisfaction Metrics' : 'Metrik Kepuasan Respon AI'}
                    </h4>
                    <span className="text-xs font-medium text-content-muted bg-surface-sunken px-2.5 py-1 rounded-lg border border-line/60">
                      {language === 'en' ? `Total ${stats?.total_feedback ?? 0} User Ratings` : `Total ${stats?.total_feedback ?? 0} Rating Pengguna`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
                    {/* Satisfaction Rate */}
                    <div className="p-4 rounded-xl bg-surface-sunken/60 border border-line/80 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-amber-500">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Satisfaction Rate' : 'Tingkat Kepuasan'}</span>
                        <Star className="w-4 h-4 fill-amber-500" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black mt-2 text-content font-mono">
                        {stats?.satisfaction_rate !== null && stats?.satisfaction_rate !== undefined ? `${stats.satisfaction_rate}%` : '100%'}
                      </p>
                      <p className="text-[11px] text-content-muted mt-1.5">{language === 'en' ? 'Ratio of responses rated helpful' : 'Rasio respon yang dinilai membantu'}</p>
                    </div>

                    {/* Likes count */}
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-500">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Helpful (Like)' : 'Membantu (Like)'}</span>
                        <ThumbsUp className="w-4 h-4" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black mt-2 text-emerald-500 font-mono">
                        {stats?.likes_count ?? 0}
                      </p>
                      <p className="text-[11px] text-content-muted mt-1.5">{language === 'en' ? 'Responses satisfying user requirements' : 'Jawaban yang memuaskan pengguna'}</p>
                    </div>

                    {/* Dislikes count */}
                    <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-rose-500">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted">{language === 'en' ? 'Unhelpful (Dislike)' : 'Kurang Sesuai (Dislike)'}</span>
                        <ThumbsDown className="w-4 h-4" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black mt-2 text-rose-500 font-mono">
                        {stats?.dislikes_count ?? 0}
                      </p>
                      <p className="text-[11px] text-content-muted mt-1.5">{language === 'en' ? 'Responses needing accuracy improvement' : 'Jawaban yang perlu perbaikan/akurasi'}</p>
                    </div>
                  </div>
                </div>

                {/* MCP Live Status Card */}
                <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content mb-3.5 flex items-center gap-2 font-display">
                    <Server className="w-4 h-4 text-accent" /> {language === 'en' ? 'Live MCP Servers Status' : 'Status Live MCP Servers'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
                    {/* MCP SAP Card */}
                    <div className="p-4 rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-content">MCP SAP Gateway</span>
                        {(stats?.mcp_status?.sap?.status === 'online' || stats?.mcp_status?.sap?.online === true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30" title={stats?.mcp_status?.sap?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-content-muted mt-2">
                        {stats?.mcp_status?.sap?.tools_count ?? stats?.mcp_status?.sap?.tool_count ?? 0} {language === 'en' ? 'Tools available' : 'Tools tersedia'} • Active Server: {stats?.mcp_status?.sap?.active_server || 'Default'}
                      </p>
                    </div>

                    {/* MCP RAG Card */}
                    <div className="p-4 rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-content">MCP RAG Knowledge</span>
                        {(stats?.mcp_status?.rag?.status === 'online' || stats?.mcp_status?.rag?.online === true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30" title={stats?.mcp_status?.rag?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-content-muted mt-2">
                        {stats?.mcp_status?.rag?.tools_count ?? stats?.mcp_status?.rag?.tool_count ?? 0} {language === 'en' ? 'Vector Search & Document Tools' : 'Vector Search & Document Tools'}
                      </p>
                    </div>

                    {/* MCP SQL Card */}
                    <div className="p-4 rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-content">MCP SQL Server</span>
                        {(stats?.mcp_status?.sql?.status === 'online' || stats?.mcp_status?.sql?.online === true || stats?.mcp_status?.email?.status === 'online' || stats?.mcp_status?.email?.online === true) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30" title={stats?.mcp_status?.sql?.error || stats?.mcp_status?.email?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-content-muted mt-2">
                        {stats?.mcp_status?.sql?.tools_count ?? stats?.mcp_status?.sql?.tool_count ?? stats?.mcp_status?.email?.tools_count ?? stats?.mcp_status?.email?.tool_count ?? 0} {language === 'en' ? 'SQL & Database Tools' : 'Alat SQL & Database'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Top Active Users */}
                <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content mb-3.5 flex items-center gap-2 font-display">
                    <UserCheck className="w-4 h-4 text-indigo-400" /> {language === 'en' ? 'Most Active Users' : 'User Paling Aktif'}
                  </h4>
                  <div className="divide-y divide-line/60">
                    {stats?.top_users?.length > 0 ? (
                      stats.top_users.map((u, i) => (
                        <div key={i} className="py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 text-indigo-400 border border-indigo-500/30 font-bold text-xs flex items-center justify-center shrink-0">
                              {i + 1}
                            </div>
                            <span className="font-semibold text-xs sm:text-sm text-content truncate">{u.username}</span>
                          </div>
                          <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 bg-surface-sunken text-content-muted rounded-full border border-line/60 shrink-0 font-mono">
                            {u.sessions} {language === 'en' ? 'Chat Sessions' : 'Sesi Chat'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-content-muted py-3">{language === 'en' ? 'No session activity recorded yet.' : 'Belum ada data aktivitas sesi.'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: USER MANAGEMENT (CRUD) */}
            {activeTab === 'users' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight">
                      {language === 'en' ? `User Management (${usersList.length})` : `Manajemen Pengguna (${usersList.length})`}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Add new accounts, manage superadmin/user roles, reset passwords, or set individual personas.' : 'Tambah akun baru, kelola role superadmin/user, reset password, atau atur persona pribadi.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                      <input 
                        type="text"
                        placeholder={language === 'en' ? 'Search user...' : 'Cari user...'}
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-9 pr-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full sm:w-60 text-content placeholder:text-content-subtle transition-all"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddUserOpen(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all shrink-0 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" /> {language === 'en' ? 'New User' : 'User Baru'}
                    </button>
                  </div>
                </div>

                {/* Users Table: Responsive Scroll on Mobile */}
                <div className="border border-line/80 rounded-2xl overflow-hidden shadow-xs bg-surface">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-surface-sunken/70 border-b border-line/80 text-content-muted text-[10px] sm:text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
                        <tr>
                          <th className="px-4 py-3">Username</th>
                          <th className="px-4 py-3">{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">{language === 'en' ? 'Personal Persona' : 'Persona Pribadi'}</th>
                          <th className="px-4 py-3 text-right">{language === 'en' ? 'Actions' : 'Aksi'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60 text-content-secondary">
                        {filteredUsers.length > 0 ? (
                          filteredUsers.map((u) => (
                            <tr key={u.username} className="hover:bg-surface-hover/70 transition-colors">
                              <td className="px-4 py-3 font-semibold text-content whitespace-nowrap">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-accent shrink-0">
                                    {u.username.substring(0, 2).toUpperCase()}
                                  </div>
                                  <span className="font-semibold text-xs text-content">{u.username}</span>
                                  {u.username === user.username && (
                                    <span className="text-[9px] bg-accent-soft text-accent px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">{language === 'en' ? 'You' : 'Anda'}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-content-secondary whitespace-nowrap sm:whitespace-normal text-xs">
                                {u.full_name || <span className="italic text-content-subtle">—</span>}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold border ${
                                  u.role === 'superadmin' 
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                                    : u.role === 'abaper'
                                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                                    : u.role === 'functional'
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                }`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-content-muted max-w-xs truncate">
                                {u.assistant_persona || <span className="italic text-content-subtle text-[11px]">{language === 'en' ? 'Follows organization persona' : 'Mengikuti persona organisasi'}</span>}
                              </td>
                              <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditUserForm({ role: u.role, full_name: u.full_name || '', assistant_persona: u.assistant_persona || '', password: '' });
                                  }}
                                  className="p-1.5 text-content-subtle hover:text-accent hover:bg-surface-raised rounded-lg transition-colors cursor-pointer"
                                  title={language === 'en' ? 'Edit user' : 'Edit user'}
                                  aria-label={`Edit user ${u.username}`}
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.username)}
                                  disabled={u.username === user.username}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    u.username === user.username 
                                      ? 'text-content-subtle cursor-not-allowed opacity-30' 
                                      : 'text-content-subtle hover:text-rose-500 hover:bg-surface-raised'
                                  }`}
                                  title={language === 'en' ? 'Delete user' : 'Hapus user'}
                                  aria-label={`Hapus user ${u.username}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="text-center py-8 text-content-subtle text-xs">
                              {language === 'en' ? 'No matching users found.' : 'Tidak ada data user yang sesuai.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* MODAL: ADD USER */}
                {isAddUserOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs"
                    style={{
                      paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
                      paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
                    }}
                  >
                    <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn modal-panel my-auto overflow-y-auto">
                      <div className="flex items-center justify-between pb-3 border-b border-line/80">
                        <h4 className="font-bold text-sm sm:text-base text-content flex items-center gap-2 font-display">
                          <Plus className="w-4 h-4 text-accent" /> {language === 'en' ? 'Add New User' : 'Tambah User Baru'}
                        </h4>
                        <button onClick={() => setIsAddUserOpen(false)} className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs sm:text-sm">
                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">Username *</label>
                          <input 
                            type="text"
                            required
                            value={newUserForm.username}
                            onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder="e.g. TRST-USER1"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</label>
                          <input
                            type="text"
                            value={newUserForm.full_name}
                            onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder="e.g. Andi Wijaya"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">Password *</label>
                          <input 
                            type="password"
                            required
                            value={newUserForm.password}
                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder={language === 'en' ? 'Minimum 4 characters' : 'Minimal 4 karakter'}
                            minLength={4}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">Role</label>
                          <select
                            value={newUserForm.role}
                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none text-content cursor-pointer transition-all"
                          >
                            <option value="abaper">{language === 'en' ? 'ABAPer (can modify programs)' : 'ABAPer (boleh ubah program)'}</option>
                            <option value="functional">{language === 'en' ? 'Functional (read-only)' : 'Functional (baca saja)'}</option>
                            <option value="user">{language === 'en' ? 'Standard User' : 'User Biasa'}</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Personal Persona (Optional)' : 'Persona Pribadi (Opsional)'}</label>
                          <textarea 
                            rows="2"
                            value={newUserForm.assistant_persona}
                            onChange={(e) => setNewUserForm({ ...newUserForm, assistant_persona: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none resize-none text-content transition-all"
                            placeholder={language === 'en' ? 'Customization on top of organization persona for this user…' : 'Penyesuaian di atas persona organisasi, khusus user ini…'}
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-line/80">
                          <button
                            type="button"
                            onClick={() => setIsAddUserOpen(false)}
                            className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 cursor-pointer active:scale-95 transition-all"
                          >
                            {language === 'en' ? 'Create Account' : 'Buat Akun'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* MODAL: EDIT USER */}
                {editingUser && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs"
                    style={{
                      paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
                      paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
                    }}
                  >
                    <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn modal-panel my-auto overflow-y-auto">
                      <div className="flex items-center justify-between pb-3 border-b border-line/80">
                        <h4 className="font-bold text-sm sm:text-base text-content flex items-center gap-2 font-display">
                          <Edit3 className="w-4 h-4 text-accent" /> {language === 'en' ? `Edit User '${editingUser.username}'` : `Edit User '${editingUser.username}'`}
                        </h4>
                        <button onClick={() => setEditingUser(null)} className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={(e) => handleUpdateUser(e, editingUser?.username)} className="space-y-3.5 text-xs sm:text-sm">
                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</label>
                          <input
                            type="text"
                            value={editUserForm.full_name}
                            onChange={(e) => setEditUserForm({ ...editUserForm, full_name: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder="e.g. Andi Wijaya"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">Role</label>
                          <select
                            value={editUserForm.role}
                            onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none text-content cursor-pointer transition-all"
                          >
                            <option value="abaper">{language === 'en' ? 'ABAPer (can modify programs)' : 'ABAPer (boleh ubah program)'}</option>
                            <option value="functional">{language === 'en' ? 'Functional (read-only)' : 'Functional (baca saja)'}</option>
                            <option value="user">{language === 'en' ? 'Standard User' : 'User Biasa'}</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">
                            {language === 'en' ? 'Reset Password (leave empty to keep unchanged)' : 'Reset Password (kosongkan jika tidak ingin diubah)'}
                          </label>
                          <input 
                            type="password"
                            value={editUserForm.password}
                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none text-content transition-all"
                            placeholder={language === 'en' ? 'New password (minimum 4 characters)…' : 'Password baru (minimal 4 karakter)…'}
                            minLength={4}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Personal Persona' : 'Persona Pribadi'}</label>
                          <textarea 
                            rows="3"
                            value={editUserForm.assistant_persona}
                            onChange={(e) => setEditUserForm({ ...editUserForm, assistant_persona: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none resize-none text-content transition-all"
                            placeholder={language === 'en' ? 'Leave empty so this user fully follows organization persona…' : 'Kosongkan agar user ini sepenuhnya mengikuti persona organisasi…'}
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-line/80">
                          <button
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 cursor-pointer active:scale-95 transition-all"
                          >
                            {language === 'en' ? 'Save Changes' : 'Simpan Perubahan'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: CHAT MODES */}
            {activeTab === 'chat_modes' && (
              <AdminChatModes
                onRefreshModes={onRefreshModes}
                setActionSuccess={setActionSuccess}
                setActionError={setActionError}
                setConfirmModal={setConfirmModal}
              />
            )}

            {/* TAB: PERSONA ORGANISASI */}
            {activeTab === 'persona' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line/80">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-accent" />
                      {language === 'en' ? 'Organization Global Persona' : 'Persona Organisasi'}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Core instructions and guidelines applicable to AI assistant for all users.' : 'Aturan dasar dan gaya respons yang berlaku sebagai pedoman AI ke seluruh pengguna.'}
                    </p>
                  </div>

                  <button
                    onClick={handleSaveGlobalPersona}
                    disabled={personaSaving}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    {personaSaving ? (language === 'en' ? 'Saving…' : 'Menyimpan…') : (language === 'en' ? 'Save Organization Persona' : 'Simpan Persona Organisasi')}
                  </button>
                </div>

                <div className="bg-surface border border-line/80 rounded-2xl p-5 text-xs text-content-muted leading-relaxed space-y-2.5 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold text-xs">
                      i
                    </div>
                    <p className="font-bold text-content text-xs sm:text-sm font-display">{language === 'en' ? 'How Persona is Applied' : 'Cara persona diterapkan'}</p>
                  </div>
                  <p>
                    {language === 'en' 
                      ? 'The organization persona serves as the foundational layer. On top of it, personal preferences configured by individual users in Settings are applied.'
                      : 'Persona organisasi menjadi lapisan dasar. Di atasnya, persona pribadi yang diatur masing-masing pengguna di menu Settings diterapkan sebagai penyesuaian.'}
                  </p>
                  <p>
                    {language === 'en'
                      ? 'When both contradict on writing style or length, personal preference takes precedence. However, for data accuracy, security, and compliance, the organization persona always prevails.'
                      : 'Bila keduanya bertentangan pada hal yang sama — misalnya gaya bahasa atau panjang jawaban — preferensi pribadi yang menang. Namun untuk aturan keakuratan data, keamanan, dan kepatuhan, persona organisasi selalu diutamakan.'}
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-3">
                  <label htmlFor="global-persona" className="block text-xs font-bold uppercase tracking-wider text-content font-display">
                    {language === 'en' ? 'Organization Persona Instructions (Global System Prompt)' : 'Instruksi persona organisasi (System Prompt Global)'}
                  </label>
                  <textarea
                    id="global-persona"
                    rows="12"
                    value={globalPersona}
                    onChange={(e) => setGlobalPersona(e.target.value)}
                    className="w-full px-4 py-3.5 text-xs font-mono bg-surface-sunken border border-line rounded-xl outline-none resize-y leading-relaxed text-content focus:ring-2 focus:ring-accent/30 focus:border-accent/40 transition-all"
                    placeholder={language === 'en' 
                      ? 'Example:\n- Always specify source SAP table for all numbers displayed.\n- Never reveal employee data other than the requester.\n- Format dates and currencies clearly.'
                      : 'Contoh:\n- Selalu sebutkan tabel SAP sumber data pada setiap angka yang ditampilkan.\n- Jangan pernah menampilkan data karyawan selain milik penanya.\n- Gunakan satuan dan format tanggal Indonesia.'}
                  />
                  <p className="text-[11px] text-content-subtle">
                    {language === 'en' ? 'Leave empty to use default assistant behaviors.' : 'Kosongkan untuk memakai perilaku bawaan asisten.'}
                  </p>
                </div>
              </div>
            )}

            {/* TAB: KATALOG SKILL (MODUL & SPESIALISASI) */}
            {activeTab === 'skills' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line/80">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-accent" />
                      {language === 'en' ? `Assistant Skill Catalog (${skillsList.length})` : `Katalog Skill Asisten (${skillsList.length})`}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Manage domain skill modules and SOPs (e.g. SAP ABAP, SAP PP, etc.) that the AI references during assistance.' : 'Kelola modul keahlian dan SOP khusus (misal: SAP ABAP, SAP PP, dsb.) yang wajib dibaca & dipatuhi AI saat melayani support.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                      <input 
                        type="text"
                        placeholder={language === 'en' ? 'Search skill...' : 'Cari skill...'}
                        value={skillSearch}
                        onChange={(e) => setSkillSearch(e.target.value)}
                        className="pl-9 pr-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 w-full sm:w-56 text-content placeholder:text-content-subtle transition-all"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddSkillOpen(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all shrink-0 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" /> {language === 'en' ? 'New Skill' : 'Skill Baru'}
                    </button>
                  </div>
                </div>

                {/* Skills Grid Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredSkills.length > 0 ? (
                    filteredSkills.map((sk) => (
                      <div key={sk.id} className="p-5 rounded-2xl border border-line/80 bg-surface flex flex-col justify-between space-y-4 hover:border-indigo-500/40 hover:shadow-md transition-all shadow-xs">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                                <Code className="w-4 h-4" />
                              </span>
                              <div className="min-w-0">
                                <h4 className="font-bold text-sm sm:text-base text-content truncate font-display">
                                  {sk.name}
                                </h4>
                                <p className="text-[11px] text-content-muted line-clamp-1">
                                  {sk.description || (language === 'en' ? 'No brief description' : 'Tidak ada deskripsi singkat')}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleToggleSkill(sk)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                                sk.enabled 
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                  : 'bg-surface-sunken text-content-subtle border border-line/60'
                              }`}
                              title={sk.enabled ? (language === 'en' ? 'Click to disable this skill' : 'Klik untuk nonaktifkan skill ini') : (language === 'en' ? 'Click to enable this skill' : 'Klik untuk mengaktifkan skill ini')}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${sk.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                              {sk.enabled ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}
                            </button>
                          </div>

                          {/* Markdown Snippet Box */}
                          <div className="p-3.5 bg-surface-sunken border border-line/70 rounded-xl text-xs font-mono text-content-muted max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap select-text">
                            {sk.content}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-line/70 text-xs">
                          <span className="text-[11px] font-mono text-content-subtle">
                            ID: #{sk.id}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingSkill(sk);
                                setEditSkillForm({
                                  name: sk.name,
                                  description: sk.description,
                                  content: sk.content,
                                  enabled: sk.enabled
                                });
                              }}
                              className="px-3 py-1.5 bg-surface-sunken/80 hover:bg-surface-hover border border-line hover:border-line-strong text-content rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs text-xs"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-accent" /> {language === 'en' ? 'Edit Skill' : 'Edit Skill'}
                            </button>
                            <button
                              onClick={() => handleDeleteSkill(sk.id, sk.name)}
                              className="p-1.5 bg-surface-sunken/80 hover:bg-rose-500/15 border border-line hover:border-rose-500/30 text-content-subtle hover:text-rose-400 rounded-xl cursor-pointer transition-all shadow-2xs"
                              title={language === 'en' ? 'Delete Skill' : 'Hapus Skill'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center text-content-muted bg-surface rounded-2xl border border-dashed border-line/80">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 text-content-subtle opacity-40" />
                      <p className="text-sm font-medium">{language === 'en' ? 'No skills found.' : 'Belum ada skill yang ditemukan.'}</p>
                      <p className="text-xs mt-1 text-content-subtle">{language === 'en' ? 'Click "+ New Skill" to add domain knowledge modules.' : 'Klik tombol "+ Skill Baru" untuk menambahkan modul panduan keahlian.'}</p>
                    </div>
                  )}
                </div>

                {/* MODAL: TAMBAH SKILL */}
                {isAddSkillOpen && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs"
                    style={{
                      paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
                      paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
                    }}
                  >
                    <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-fadeIn modal-panel my-auto overflow-y-auto">
                      <div className="flex items-center justify-between pb-3 border-b border-line/80">
                        <h4 className="font-bold text-sm sm:text-base text-content flex items-center gap-2 font-display">
                          <Plus className="w-4 h-4 text-accent" /> {language === 'en' ? 'Add New Skill' : 'Tambah Skill Baru'}
                        </h4>
                        <button onClick={() => setIsAddSkillOpen(false)} className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleCreateSkill} className="space-y-3.5 text-xs sm:text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Skill Name *' : 'Nama Skill *'}</label>
                            <input 
                              type="text"
                              required
                              value={newSkillForm.name}
                              onChange={(e) => setNewSkillForm({ ...newSkillForm, name: e.target.value })}
                              className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                              placeholder="e.g. SAP ABAP, SAP PP, SAP MM"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-content-muted mb-1">Status</label>
                            <label className="flex items-center gap-2 px-3.5 py-2 bg-surface-sunken border border-line rounded-xl cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={newSkillForm.enabled}
                                onChange={(e) => setNewSkillForm({ ...newSkillForm, enabled: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-accent/30 cursor-pointer"
                              />
                              <span className="text-xs font-medium text-content">{newSkillForm.enabled ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Brief Description' : 'Deskripsi Singkat'}</label>
                          <input
                            type="text"
                            value={newSkillForm.description}
                            onChange={(e) => setNewSkillForm({ ...newSkillForm, description: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder={language === 'en' ? 'Scope overview of this skill module' : 'Ringkasan ruang lingkup skill ini (misal: Standar penulisan program ABAP dan best practice)'}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">
                            {language === 'en' ? 'Skill SOP / Guidelines (Markdown Format) *' : 'Panduan / SOP Keahlian (Format Markdown) *'}
                          </label>
                          <textarea 
                            rows="10"
                            required
                            value={newSkillForm.content}
                            onChange={(e) => setNewSkillForm({ ...newSkillForm, content: e.target.value })}
                            className="w-full px-3.5 py-2.5 text-xs font-mono bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none resize-y text-content leading-relaxed transition-all"
                            placeholder={language === 'en' 
                              ? '# Skill Guide: SAP ...\n\n## 1. Standards & Rules\n- Always use table X...\n- Check field Y...\n\n## 2. Support Procedure\n- Verify steps...'
                              : '# Panduan Keahlian: SAP ...\n\n## 1. Standar & Aturan\n- Selalu gunakan tabel X...\n- Cek field Y...\n\n## 2. Prosedur Support\n- Pastikan langkah investigasi...'}
                          />
                          <p className="text-[11px] text-content-subtle mt-1">
                            {language === 'en' ? 'Specify operational standards, naming conventions, essential table references, or best practices for the AI.' : 'Tuliskan standar operasional, aturan penamaan, referensi tabel penting, atau best practice yang wajib dipatuhi AI.'}
                          </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-line/80">
                          <button
                            type="button"
                            onClick={() => setIsAddSkillOpen(false)}
                            className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="submit"
                            disabled={skillSaving}
                            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                          >
                            {skillSaving ? (language === 'en' ? 'Saving…' : 'Menyimpan…') : (language === 'en' ? 'Save Skill' : 'Simpan Skill')}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* MODAL: EDIT SKILL */}
                {editingSkill && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs"
                    style={{
                      paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
                      paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
                    }}
                  >
                    <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-fadeIn modal-panel my-auto overflow-y-auto">
                      <div className="flex items-center justify-between pb-3 border-b border-line/80">
                        <h4 className="font-bold text-sm sm:text-base text-content flex items-center gap-2 font-display">
                          <Edit3 className="w-4 h-4 text-accent" /> {language === 'en' ? `Edit Skill '${editingSkill.name}'` : `Edit Skill '${editingSkill.name}'`}
                        </h4>
                        <button onClick={() => setEditingSkill(null)} className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={(e) => handleUpdateSkill(e, editingSkill?.id)} className="space-y-3.5 text-xs sm:text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Skill Name *' : 'Nama Skill *'}</label>
                            <input 
                              type="text"
                              required
                              value={editSkillForm.name}
                              onChange={(e) => setEditSkillForm({ ...editSkillForm, name: e.target.value })}
                              className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-content-muted mb-1">Status</label>
                            <label className="flex items-center gap-2 px-3.5 py-2 bg-surface-sunken border border-line rounded-xl cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={editSkillForm.enabled}
                                onChange={(e) => setEditSkillForm({ ...editSkillForm, enabled: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-accent/30 cursor-pointer"
                              />
                              <span className="text-xs font-medium text-content">{editSkillForm.enabled ? (language === 'en' ? 'Active' : 'Aktif') : (language === 'en' ? 'Inactive' : 'Nonaktif')}</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">{language === 'en' ? 'Brief Description' : 'Deskripsi Singkat'}</label>
                          <input
                            type="text"
                            value={editSkillForm.description}
                            onChange={(e) => setEditSkillForm({ ...editSkillForm, description: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-content-muted mb-1">
                            {language === 'en' ? 'Skill SOP / Guidelines (Markdown Format) *' : 'Panduan / SOP Keahlian (Format Markdown) *'}
                          </label>
                          <textarea 
                            rows="10"
                            required
                            value={editSkillForm.content}
                            onChange={(e) => setEditSkillForm({ ...editSkillForm, content: e.target.value })}
                            className="w-full px-3.5 py-2.5 text-xs font-mono bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none resize-y text-content leading-relaxed transition-all"
                          />
                          <p className="text-[11px] text-content-subtle mt-1">
                            {language === 'en' ? 'Specify operational standards, naming conventions, essential table references, or best practices for the AI.' : 'Tuliskan standar operasional, aturan penamaan, referensi tabel penting, atau best practice yang wajib dipatuhi AI.'}
                          </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-line/80">
                          <button
                            type="button"
                            onClick={() => setEditingSkill(null)}
                            className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="submit"
                            disabled={skillSaving}
                            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 disabled:opacity-50 cursor-pointer active:scale-95 transition-all"
                          >
                            {skillSaving ? (language === 'en' ? 'Saving…' : 'Menyimpan…') : (language === 'en' ? 'Save Changes' : 'Simpan Perubahan')}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MCP CONFIGURATION */}
            {activeTab === 'mcp' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line/80">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <Server className="w-5 h-5 text-accent" />
                      {language === 'en' ? 'MCP Server Connections' : 'Konfigurasi Server MCP'}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en'
                        ? 'Manage JSON endpoint configurations and authentication headers for SAP ERP, RAG Knowledge Base, and SQL Database MCP gateways.'
                        : 'Kelola konfigurasi endpoint JSON dan header autentikasi untuk server gateway MCP SAP ERP, Basis Dokumen RAG, dan Database SQL.'}
                    </p>
                  </div>
                  <button
                    onClick={handleSaveMcpConfig}
                    disabled={mcpSaving}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 w-full sm:w-auto cursor-pointer active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    {mcpSaving
                      ? (language === 'en' ? 'Saving...' : 'Menyimpan...')
                      : (language === 'en' ? 'Save MCP Config' : 'Simpan Konfigurasi MCP')}
                  </button>
                </div>

                <div className="space-y-4">
                  {/* MCP SAP Config JSON */}
                  <div className="p-5 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold shadow-2xs">
                          <Database className="w-4 h-4" />
                        </div>
                        <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                          MCP SAP Config (JSON)
                        </label>
                      </div>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                        SAP ERP Gateway
                      </span>
                    </div>
                    <textarea 
                      rows="6"
                      value={mcpSapConfig}
                      onChange={(e) => setMcpSapConfig(e.target.value)}
                      className="w-full font-mono text-xs px-4 py-3.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 outline-none text-content leading-relaxed transition-all"
                      placeholder='{"type": "http", "url": "http://192.168.1.162:8091/mcp"}'
                    />
                    <p className="text-[11px] text-content-subtle">
                      {language === 'en' ? 'HTTP/SSE or stdio config format for connecting to SAP MCP Server.' : 'Format konfigurasi HTTP/SSE atau stdio untuk koneksi ke SAP MCP Server.'}
                    </p>
                  </div>

                  {/* MCP RAG Config JSON */}
                  <div className="p-5 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center font-bold shadow-2xs">
                          <Database className="w-4 h-4" />
                        </div>
                        <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                          MCP RAG Config (JSON)
                        </label>
                      </div>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                        RAG Knowledge Gateway
                      </span>
                    </div>
                    <textarea 
                      rows="6"
                      value={mcpRagConfig}
                      onChange={(e) => setMcpRagConfig(e.target.value)}
                      className="w-full font-mono text-xs px-4 py-3.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 outline-none text-content leading-relaxed transition-all"
                      placeholder='{"type": "http", "url": "http://192.168.1.162:8090/mcp"}'
                    />
                    <p className="text-[11px] text-content-subtle">
                      {language === 'en' ? 'HTTP/SSE or stdio config format for connecting to RAG Knowledge Base.' : 'Format konfigurasi HTTP/SSE atau stdio untuk koneksi ke Basis Pengetahuan Dokumen RAG.'}
                    </p>
                  </div>

                  {/* MCP SQL Config JSON */}
                  <div className="p-5 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/25 flex items-center justify-center font-bold shadow-2xs">
                          <Database className="w-4 h-4" />
                        </div>
                        <label className="text-xs font-bold uppercase tracking-wider text-content font-display">
                          MCP SQL & Tools Config (JSON)
                        </label>
                      </div>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold">
                        SQL & Utility Gateway
                      </span>
                    </div>
                    <textarea 
                      rows="6"
                      value={mcpSqlConfig}
                      onChange={(e) => setMcpSqlConfig(e.target.value)}
                      className="w-full font-mono text-xs px-4 py-3.5 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/40 outline-none text-content leading-relaxed transition-all"
                      placeholder='{\n  "mcpServers": {\n    "sql-mcp": {\n      "type": "http",\n      "url": "http://192.168.1.162:8090/mcp",\n      "headers": { "Authorization": "Bearer ..." }\n    }\n  }\n}'
                    />
                    <p className="text-[11px] text-content-subtle">
                      {language === 'en' ? 'HTTP/SSE config format for connecting to SQL & Database MCP Server cluster.' : 'Format konfigurasi HTTP/SSE untuk koneksi ke kluster MCP SQL Server & Database.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: AUDIT LOGS & ALL SESSIONS */}
            {/* TAB: PENILAIAN JAWABAN — jawaban mana yang dinilai pengguna.
                Angka kepuasan di Overview tidak dapat ditindaklanjuti tanpa isinya. */}
            {activeTab === 'kuota' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
                  <div>
                    <h3 className="text-lg font-bold text-content">{language === 'en' ? 'Token Quotas' : 'Kuota Token'}</h3>
                    <p className="text-sm text-content-muted">
                      {language === 'en' 
                        ? `Usage calculated for ${kuota?.usage_date || '—'} (resets at midnight WIB).`
                        : `Pemakaian dihitung untuk tanggal ${kuota?.usage_date || '—'} (reset tengah malam WIB).`}
                    </p>
                  </div>
                  <button
                    onClick={fetchKuota}
                    disabled={kuotaLoading}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-surface-hover text-content hover:bg-line transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${kuotaLoading ? 'animate-spin' : ''}`} />
                    {language === 'en' ? 'Refresh' : 'Muat ulang'}
                  </button>
                </div>

                {/* Saklar penegakan */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-content text-sm sm:text-base">{language === 'en' ? 'Quota Enforcement' : 'Penegakan Batas Token'}</p>
                    <p className="text-xs sm:text-sm text-content-muted mt-0.5">
                      {kuota?.enforced
                        ? (language === 'en' ? 'Active — requests will be rejected once daily quota is exceeded.' : 'Aktif — permintaan ditolak begitu kuota harian habis.')
                        : (language === 'en' ? 'Inactive — usage is tracked without blocking requests.' : 'Nonaktif — pemakaian tetap dicatat, tetapi tidak ada yang diblokir.')}
                    </p>
                  </div>
                  <button
                    onClick={() => gantiSaklar(!kuota?.enforced)}
                    disabled={!kuota}
                    aria-label={language === 'en' ? 'Token limit enforcement' : 'Penegakan batas token'}
                    aria-pressed={!!kuota?.enforced}
                    className={`relative h-7 w-13 shrink-0 rounded-full transition-all cursor-pointer disabled:opacity-50 ${
                      kuota?.enforced ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        kuota?.enforced ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Batas per peran */}
                <div className="rounded-2xl border border-line/80 bg-surface p-5 shadow-xs">
                  <p className="font-bold text-content text-sm sm:text-base mb-1">{language === 'en' ? 'Limits Per Role' : 'Batas per Peran'}</p>
                  <p className="text-xs text-content-muted mb-4">
                    {language === 'en' ? 'Enter 0 for unlimited. Per-minute limit controls burst requests.' : 'Isi 0 untuk tanpa batas. Batas per menit menahan kiriman beruntun.'}
                  </p>
                  <div className="space-y-3">
                    {Object.keys(kuota?.role_limits || {}).map((peran) => (
                      <div
                        key={peran}
                        className="flex flex-col sm:flex-row sm:items-end gap-3.5 p-4 rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all"
                      >
                        <div className="sm:w-32 shrink-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-content-subtle">{language === 'en' ? 'Role' : 'Peran'}</p>
                          <p className="font-mono text-sm font-bold text-accent capitalize">{peran}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-xs font-semibold text-content-muted" htmlFor={`harian-${peran}`}>
                              {language === 'en' ? 'Daily Tokens' : 'Token per hari'}
                            </label>
                            {formatTokenWordHelper(batasDraft[peran]?.daily_token_limit) && (
                              <span className={`text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded-md ${
                                Number(String(batasDraft[peran]?.daily_token_limit).replace(/\D/g, '')) === 0
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
                              }`}>
                                {Number(String(batasDraft[peran]?.daily_token_limit).replace(/\D/g, '')) === 0 ? '♾️ ' : '≈ '}
                                {formatTokenWordHelper(batasDraft[peran]?.daily_token_limit)}
                              </span>
                            )}
                          </div>
                          <input
                            id={`harian-${peran}`}
                            type="text"
                            inputMode="numeric"
                            value={formatNumberSeparator(batasDraft[peran]?.daily_token_limit)}
                            onChange={(e) => {
                              const cleanDigits = e.target.value.replace(/\D/g, '');
                              setBatasDraft((d) => ({
                                ...d,
                                [peran]: { ...d[peran], daily_token_limit: cleanDigits },
                              }));
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-content text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-xs font-semibold text-content-muted" htmlFor={`menit-${peran}`}>
                              {language === 'en' ? 'Requests Per Minute' : 'Permintaan per menit'}
                            </label>
                            {Number(String(batasDraft[peran]?.per_minute_limit).replace(/\D/g, '')) === 0 && (
                              <span className="text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                ♾️ {language === 'en' ? 'Unlimited' : 'Tanpa Batas'}
                              </span>
                            )}
                          </div>
                          <input
                            id={`menit-${peran}`}
                            type="text"
                            inputMode="numeric"
                            value={formatNumberSeparator(batasDraft[peran]?.per_minute_limit)}
                            onChange={(e) => {
                              const cleanDigits = e.target.value.replace(/\D/g, '');
                              setBatasDraft((d) => ({
                                ...d,
                                [peran]: { ...d[peran], per_minute_limit: cleanDigits },
                              }));
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-content text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </div>
                        <button
                          onClick={() => simpanBatas(peran)}
                          aria-label={`${language === 'en' ? 'Save limits for' : 'Simpan batas'} ${peran}`}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-sm shadow-indigo-500/20 transition-all cursor-pointer shrink-0 active:scale-95"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {t('common.save')}
                        </button>
                      </div>
                    ))}
                    {!kuotaLoading && !Object.keys(kuota?.role_limits || {}).length && (
                      <p className="text-sm text-content-muted">{language === 'en' ? 'Role limits unavailable.' : 'Batas peran belum tersedia.'}</p>
                    )}
                  </div>
                </div>

                {/* Pemakaian per pengguna */}
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="font-semibold text-content">{language === 'en' ? "Today's Usage" : 'Pemakaian hari ini'}</p>
                      <p className="text-sm text-content-muted">
                        {language === 'en' ? '~ indicates estimated tokens when the AI provider does not report exact token counts.' : 'Tanda ~ berarti angka ditaksir karena penyedia model tidak melaporkan jumlah token.'}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative w-full sm:w-56">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                        <input
                          type="text"
                          placeholder={language === 'en' ? 'Search user or role...' : 'Cari user atau peran...'}
                          value={kuotaUserSearch}
                          onChange={(e) => setKuotaUserSearch(e.target.value)}
                          className="pl-9 pr-8 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-content"
                        />
                        {kuotaUserSearch && (
                          <button
                            onClick={() => setKuotaUserSearch('')}
                            className="absolute right-2.5 top-2.5 text-content-subtle hover:text-content p-0.5 cursor-pointer"
                            aria-label="Clear search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => resetKuota(null)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {language === 'en' ? 'Reset All' : 'Reset semua'}
                      </button>
                    </div>
                  </div>

                  {kuotaLoading ? (
                    <p className="text-sm text-content-muted">{language === 'en' ? 'Loading usage…' : 'Memuat pemakaian…'}</p>
                  ) : !kuota?.usage?.length ? (
                    <p className="text-sm text-content-muted">{language === 'en' ? 'No usage recorded yet today.' : 'Belum ada pemakaian tercatat hari ini.'}</p>
                  ) : (
                    (() => {
                      const filteredUsage = (kuota.usage || []).filter((baris) => {
                        if (!kuotaUserSearch.trim()) return true;
                        const query = kuotaUserSearch.toLowerCase().trim();
                        return (
                          baris.username?.toLowerCase().includes(query) ||
                          baris.role?.toLowerCase().includes(query)
                        );
                      });

                      if (filteredUsage.length === 0) {
                        return (
                          <div className="p-4 text-center text-sm text-content-muted bg-surface-sunken rounded-xl border border-line">
                            {language === 'en' ? `No users match "${kuotaUserSearch}".` : `Tidak ada user yang cocok dengan "${kuotaUserSearch}".`}
                          </div>
                        );
                      }

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead>
                              <tr className="text-left text-xs font-bold uppercase tracking-wider text-content-subtle border-b border-line">
                                <th className="py-2 pr-3">{language === 'en' ? 'User' : 'Pengguna'}</th>
                                <th className="py-2 pr-3">{language === 'en' ? 'Role' : 'Peran'}</th>
                                <th className="py-2 pr-3 text-right">{language === 'en' ? 'Tokens' : 'Token'}</th>
                                <th className="py-2 pr-3 text-right">{language === 'en' ? 'Limit' : 'Batas'}</th>
                                <th className="py-2 pr-3 text-right">{language === 'en' ? 'Requests' : 'Permintaan'}</th>
                                <th className="py-2 text-right">{language === 'en' ? 'Action' : 'Aksi'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredUsage.map((baris) => {
                                const batas = kuota.role_limits?.[baris.role]?.daily_token_limit || 0;
                                const persen = batas ? Math.min(100, Math.round((baris.total_tokens / batas) * 100)) : 0;
                                return (
                                  <tr key={baris.username} className="border-b border-line/60 last:border-0">
                                    <td className="py-2.5 pr-3 font-medium text-content break-all">{baris.username}</td>
                                    <td className="py-2.5 pr-3 font-mono text-xs text-content-muted">{baris.role}</td>
                                    <td className="py-2.5 pr-3 text-right tabular-nums text-content">
                                      {baris.estimated ? '~' : ''}
                                      {baris.total_tokens.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right tabular-nums text-content-muted">
                                      {batas ? `${batas.toLocaleString(language === 'en' ? 'en-US' : 'id-ID')} (${persen}%)` : '∞'}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right tabular-nums text-content-muted">{baris.requests}</td>
                                    <td className="py-2.5 text-right">
                                      <button
                                        onClick={() => resetKuota(baris.username)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-hover text-content hover:bg-line transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Reset
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            )}

            {activeTab === 'feedback' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col gap-3 border-b border-line/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <ThumbsUp className="w-5 h-5 text-accent" />
                      {language === 'en' ? 'Response Evaluation' : 'Penilaian Jawaban'}
                    </h3>
                    <p className="mt-0.5 text-xs text-content-muted">
                      {language === 'en' 
                        ? 'User-evaluated responses along with triggering prompts for quality improvements.'
                        : 'Jawaban yang dinilai pengguna beserta pertanyaan pemicunya — bahan untuk memperbaiki persona global dan skill.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex rounded-xl border border-line/80 bg-surface-sunken p-1 shadow-2xs">
                      {[
                        { key: 'dislike', label: language === 'en' ? 'Unhelpful' : 'Kurang sesuai', icon: ThumbsDown },
                        { key: 'like', label: language === 'en' ? 'Helpful' : 'Membantu', icon: ThumbsUp },
                      ].map((opt) => {
                        const Icon = opt.icon;
                        const isActive = feedbackKind === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => setFeedbackKind(opt.key)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                              isActive
                                ? 'bg-surface-raised text-content shadow-xs border border-line/60 font-bold'
                                : 'text-content-muted hover:text-content'
                            }`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${isActive ? (opt.key === 'like' ? 'text-emerald-400' : 'text-rose-400') : ''}`} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => fetchFeedback(feedbackKind)}
                      className="rounded-xl border border-line/80 bg-surface-sunken/70 p-2 text-content-muted transition-all hover:bg-surface-hover hover:text-content cursor-pointer shadow-2xs active:scale-95"
                      title={language === 'en' ? 'Refresh' : 'Muat ulang'}
                      aria-label={language === 'en' ? 'Refresh feedback list' : 'Muat ulang daftar penilaian'}
                    >
                      <RefreshCw className={`h-4 w-4 ${feedbackLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {feedbackLoading && !feedbackData ? (
                  <div className="space-y-3" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-sunken/60 border border-line/40" />
                    ))}
                  </div>
                ) : !feedbackData || feedbackData.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line/80 py-14 text-center bg-surface">
                    <MessageSquare className="mx-auto mb-2 h-7 w-7 text-content-subtle opacity-40" />
                    <p className="text-sm font-semibold text-content font-display">{language === 'en' ? 'No feedback recorded yet' : 'Belum ada penilaian'}</p>
                    <p className="mt-1 text-xs text-content-muted">
                      {feedbackKind === 'dislike'
                        ? (language === 'en' ? 'No responses marked as unhelpful.' : 'Belum ada jawaban yang ditandai kurang sesuai.')
                        : (language === 'en' ? 'No responses marked as helpful.' : 'Belum ada jawaban yang ditandai membantu.')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-content-muted">
                        {language === 'en'
                          ? `Showing ${feedbackData.items.length} of ${feedbackData.total} ratings.`
                          : `Menampilkan ${feedbackData.items.length} dari ${feedbackData.total} penilaian.`}
                      </p>
                      <span className="text-[11px] font-mono text-content-subtle bg-surface-sunken px-2.5 py-0.5 rounded-lg border border-line/60">
                        {feedbackKind.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {feedbackData.items.map((item) => (
                        <div
                          key={item.message_id}
                          className="rounded-2xl border border-line/80 bg-surface p-5 transition-all hover:border-indigo-500/40 hover:shadow-md shadow-xs space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-content-muted pb-2 border-b border-line/60">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 font-bold text-content px-2 py-0.5 rounded-md bg-surface-sunken border border-line/60">
                                <UserCheck className="h-3.5 w-3.5 text-accent" />
                                {item.username}
                              </span>
                              <span className="truncate max-w-[16rem] text-content-secondary font-medium">{item.session_title}</span>
                            </div>
                            {item.created_at && (
                              <span className="font-mono text-[10px] text-content-subtle">{new Date(item.created_at).toLocaleString(language === 'en' ? 'en-US' : 'id-ID')}</span>
                            )}
                          </div>

                          {item.question && (
                            <div className="rounded-xl bg-surface-sunken/80 border border-line/60 px-3.5 py-2.5 space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-accent font-display">
                                {language === 'en' ? 'Question' : 'Pertanyaan'}
                              </p>
                              <p className="whitespace-pre-wrap text-xs text-content leading-relaxed">
                                {item.question}
                              </p>
                            </div>
                          )}

                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-content-subtle font-display">
                              {language === 'en' ? 'Assistant response' : 'Jawaban asisten'}
                            </p>
                            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary bg-surface-sunken/40 border border-line/50 p-3 rounded-xl select-text font-mono">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="h-full flex flex-col space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line shrink-0">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight">
                      {language === 'en' ? 'Chat Audit Logs' : 'Audit Log Percakapan'}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Monitor chat history across all users for compliance and troubleshooting.' : 'Pantau riwayat percakapan dari seluruh user untuk keperluan audit dan troubleshooting.'}
                    </p>
                  </div>

                    <div className="relative w-full sm:w-auto">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                    <input 
                      type="text"
                      placeholder={language === 'en' ? 'Search user / chat title...' : 'Cari user / judul chat...'}
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="pl-9 pr-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full sm:w-72 text-content placeholder:text-content-subtle transition-all"
                    />
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 min-h-0">
                  {/* Sessions List: Hidden on mobile when a session is selected */}
                  <div className={`${
                    selectedAuditSession ? 'hidden md:block' : 'block'
                  } border border-line/80 rounded-2xl overflow-y-auto max-h-[60vh] md:max-h-[65vh] divide-y divide-line/60 bg-surface shadow-xs`}>
                    {filteredAuditSessions.length > 0 ? (
                      filteredAuditSessions.map((s) => (
                        <button
                          key={s.session_id}
                          onClick={() => {
                            setSelectedAuditSession(s);
                            fetchAuditMessages(s.session_id);
                          }}
                          className={`w-full text-left p-3.5 transition-all cursor-pointer ${
                            selectedAuditSession?.session_id === s.session_id
                              ? 'bg-accent/10 border-l-4 border-accent font-semibold'
                              : 'hover:bg-surface-hover/70'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-content truncate">{s.username}</span>
                            <span className="text-[10px] text-content-muted font-mono">{s.updated_at ? s.updated_at.slice(0, 10) : ''}</span>
                          </div>
                          <p className="text-xs text-content-muted truncate mt-1">{s.title}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-mono bg-surface-sunken px-2 py-0.5 rounded-md text-content-muted border border-line/60">
                              {s.message_count} {language === 'en' ? 'messages' : 'pesan'}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-center text-xs text-content-muted py-8">{language === 'en' ? 'No session history found.' : 'Belum ada riwayat sesi ditemukan.'}</p>
                    )}
                  </div>

                  {/* Messages Viewer: Visible on mobile when a session is selected */}
                  <div className={`${
                    !selectedAuditSession ? 'hidden md:flex' : 'flex'
                  } md:col-span-2 border border-line/80 rounded-2xl p-4 sm:p-5 overflow-y-auto max-h-[60vh] md:max-h-[65vh] bg-surface-sunken/40 flex-col shadow-xs`}>
                    {selectedAuditSession ? (
                      <div className="space-y-3.5 sm:space-y-4">
                        {/* Mobile Back Button */}
                        <button 
                          onClick={() => setSelectedAuditSession(null)}
                          className="md:hidden flex items-center gap-1.5 text-xs font-bold text-accent py-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> {language === 'en' ? 'Back to session list' : 'Kembali ke daftar sesi'}
                        </button>

                        <div className="pb-3 border-b border-line/80 flex items-center justify-between">
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs sm:text-sm text-content truncate font-display">{selectedAuditSession.title}</h4>
                            <p className="text-[11px] sm:text-xs text-content-muted truncate mt-0.5">User: <span className="font-semibold text-accent">{selectedAuditSession.username}</span> • ID: <span className="font-mono">{selectedAuditSession.session_id}</span></p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {auditMessages.length > 0 ? (
                            auditMessages.map((m, i) => (
                              <div 
                                key={i} 
                                className={`p-3.5 rounded-xl text-xs leading-relaxed transition-all ${
                                  m.role === 'user' 
                                    ? 'bg-indigo-500/10 border border-indigo-500/25 text-content shadow-2xs' 
                                    : 'bg-surface border border-line/80 text-content shadow-2xs'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 font-semibold">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-content">{m.role === 'user' ? selectedAuditSession.username : 'AI Assistant'}</span>
                                    {m.role !== 'user' && (m.feedback === 'like' || m.feedback === 'up') && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                        <ThumbsUp className="w-2.5 h-2.5" /> {language === 'en' ? 'Helpful' : 'Membantu'}
                                      </span>
                                    )}
                                    {m.role !== 'user' && (m.feedback === 'dislike' || m.feedback === 'down') && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                        <ThumbsDown className="w-2.5 h-2.5" /> {language === 'en' ? 'Unhelpful' : 'Kurang Sesuai'}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-content-subtle font-mono">{m.created_at ? m.created_at.slice(11, 16) : ''}</span>
                                </div>
                                <div className="whitespace-pre-wrap font-sans select-text">{m.content}</div>
                              </div>
                            ))
                          ) : (
                            <p className="text-center text-xs text-content-muted py-6">{language === 'en' ? 'Loading messages...' : 'Memuat pesan...'}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-content-muted text-xs py-16">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-30 text-accent" />
                        {language === 'en' ? 'Select a session on the left to view conversation messages.' : 'Pilih salah satu sesi di sebelah kiri untuk melihat pesan percakapan.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Standardized Confirmation Modal */}
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
        cancelText={confirmModal.cancelText}
      />
    </>
  );
}