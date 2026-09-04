import React, { useState, useEffect } from 'react';
import { Activity, ArrowLeft, BookOpen, Check, CheckCircle, ChevronDown, Code, Database, Edit3, Gauge, History, Key, Mail, MessageSquare, Plus, RefreshCw, RotateCcw, Save, Search, Server, ShieldCheck, Sliders, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, UserCheck, UserCog, Users, X, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmModal from './ConfirmModal';
import AdminChatModes from './AdminChatModes';
import AdminAccessControl from './AdminAccessControl';
import AdminRoles from './AdminRoles';

const formatRoleLabel = (role) => {
  const r = (role || '').toLowerCase().trim();
  switch (r) {
    case 'superadmin':
      return 'Super Admin';
    case 'abaper':
      return 'ABAPer';
    case 'functional':
      return 'Functional';
    case 'backend':
      return 'Backend';
    case 'frontend':
      return 'Frontend';
    case 'basis':
      return 'Basis';
    case 'data_analyst':
      return 'Data Analyst';
    case 'user':
      return 'Standard User';
    case 'guest':
      return 'Guest';
    default:
      return r.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
};

const getRoleBadgeStyle = (role) => {
  const r = (role || '').toLowerCase().trim();
  switch (r) {
    case 'superadmin':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'abaper':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    case 'functional':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'backend':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'frontend':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'basis':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'data_analyst':
      return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
    case 'user':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    default:
      return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
  }
};

const AVAILABLE_ROLES_OPTIONS = [
  { value: 'abaper', label: 'ABAPer' },
  { value: 'functional', label: 'Functional' },
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'basis', label: 'Basis' },
  { value: 'data_analyst', label: 'Data Analyst' },
  { value: 'user', label: 'Standard User' },
  { value: 'superadmin', label: 'Super Admin' },
];

export default function AdminDashboard({ isOpen, onClose, user, onRefreshMcpServers, onRefreshModes }) {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'persona' | 'mcp' | 'audit'
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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

  // Stats & Top Users State
  const [stats, setStats] = useState(null);
  const [topUsersPeriod, setTopUsersPeriod] = useState('month');
  const [topUsersList, setTopUsersList] = useState([]);
  const [topUsersLoading, setTopUsersLoading] = useState(false);

  // Feedback State — daftar jawaban yang dinilai pengguna
  const [feedbackKind, setFeedbackKind] = useState('dislike');
  const [feedbackData, setFeedbackData] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Users State
  const [usersList, setUsersList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', full_name: '', role: 'user', roles: ['user'], assistant_persona: '' });
  const [editUserForm, setEditUserForm] = useState({ role: 'user', roles: ['user'], assistant_persona: '', password: '', full_name: '' });
  const [masterRoles, setMasterRoles] = useState([]);

  // Skills State
  const [skillsList, setSkillsList] = useState([]);
  const [skillSearch, setSkillSearch] = useState('');
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [newSkillForm, setNewSkillForm] = useState({ name: '', description: '', content: '', tags: '', enabled: true });
  const [editSkillForm, setEditSkillForm] = useState({ name: '', description: '', content: '', tags: '', enabled: true });
  const [skillSaving, setSkillSaving] = useState(false);

  // AI & MCP Config State
  const [nineRouterEnabled, setNineRouterEnabled] = useState(true);
  const [nineRouterBaseUrl, setNineRouterBaseUrl] = useState('');
  const [nineRouterModel, setNineRouterModel] = useState('');
  const [nineRouterApiKey, setNineRouterApiKey] = useState('');

  const [openrouterEnabled, setOpenrouterEnabled] = useState(false);
  const [openrouterModel, setOpenrouterModel] = useState('');
  const [openrouterFallbackModel, setOpenrouterFallbackModel] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');

  const [mcpSapConfig, setMcpSapConfig] = useState('');
  const [mcpRagConfig, setMcpRagConfig] = useState('');
  const [mcpSqlConfig, setMcpSqlConfig] = useState('');
  const [mcpSaving, setMcpSaving] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  // Stats State
  const [statsLoading, setStatsLoading] = useState(false);

  // Users State
  const [usersLoading, setUsersLoading] = useState(false);

  // Skills Loading State
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Audit Logs State
  const [auditSessions, setAuditSessions] = useState([]);
  const [selectedAuditSession, setSelectedAuditSession] = useState(null);
  const [auditMessages, setAuditMessages] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSessionsLoading, setAuditSessionsLoading] = useState(false);
  const [auditMessagesLoading, setAuditMessagesLoading] = useState(false);

  // Kuota Token State
  const [kuota, setKuota] = useState(null);
  const [kuotaLoading, setKuotaLoading] = useState(false);
  const [batasDraft, setBatasDraft] = useState({});
  const [savingBatas, setSavingBatas] = useState(false);
  const [kuotaUserSearch, setKuotaUserSearch] = useState('');

  const fetchStats = async (period = topUsersPeriod) => {
    setStatsLoading(true);
    try {
      const data = await api.adminStats(period, 10);
      setStats(data);
      if (data?.top_users) {
        setTopUsersList(data.top_users);
      }
    } catch (err) {
      console.error("Gagal load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleTopUsersPeriodChange = async (newPeriod) => {
    setTopUsersPeriod(newPeriod);
    setTopUsersLoading(true);
    try {
      const res = await api.adminTopUsers(newPeriod, 10);
      setTopUsersList(res?.top_users || []);
    } catch (err) {
      console.error("Gagal load top users:", err);
    } finally {
      setTopUsersLoading(false);
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
    setUsersLoading(true);
    try {
      setUsersList(await api.adminUsers());
    } catch (err) {
      console.error("Gagal load users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchConfig = async () => {
    setConfigLoading(true);
    try {
      const data = await api.getConfig();
      setGlobalPersona(data.global_assistant_persona || '');
      setMcpSapConfig(data.mcp_sap_config_json || '');
      setMcpRagConfig(data.mcp_rag_config_json || '');
      setMcpSqlConfig(data.mcp_sql_config_json || data.mcp_email_config_json || '');
      setNineRouterEnabled(data.nine_router_enabled !== undefined ? data.nine_router_enabled : true);
      setNineRouterBaseUrl(data.nine_router_base_url || '');
      setNineRouterModel(data.nine_router_model || '');
      setNineRouterApiKey(data.nine_router_api_key || '');
      setOpenrouterEnabled(data.openrouter_enabled !== undefined ? data.openrouter_enabled : false);
      setOpenrouterModel(data.openrouter_model || '');
      setOpenrouterFallbackModel(data.openrouter_fallback_model || '');
      setOpenrouterApiKey(data.openrouter_api_key || '');
    } catch (err) {
      console.error("Gagal load config:", err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchSkills = async () => {
    setSkillsLoading(true);
    try {
      setSkillsList(await api.adminSkills());
    } catch (err) {
      console.error("Gagal load skills:", err);
    } finally {
      setSkillsLoading(false);
    }
  };

  const fetchAuditSessions = async () => {
    setAuditSessionsLoading(true);
    try {
      setAuditSessions(await api.adminSessions(100));
    } catch (err) {
      console.error("Gagal load audit sessions:", err);
    } finally {
      setAuditSessionsLoading(false);
    }
  };

  const fetchAuditMessages = async (sessionId) => {
    setAuditMessagesLoading(true);
    try {
      setAuditMessages(await api.adminSessionMessages(sessionId));
    } catch (err) {
      console.error("Gagal load audit messages:", err);
    } finally {
      setAuditMessagesLoading(false);
    }
  };

  const fetchMasterRoles = async () => {
    try {
      const data = await api.adminRoles();
      if (Array.isArray(data) && data.length > 0) {
        setMasterRoles(data);
      }
    } catch (err) {
      console.warn("Gagal memuat master roles:", err);
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
      fetchMasterRoles();
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

  const simpanSemuaBatas = async () => {
    setActionError('');
    setActionSuccess('');
    const roles = Object.keys(kuota?.role_limits || {});
    if (roles.length === 0) return;

    const payloadLimits = {};
    for (const peran of roles) {
      const draft = batasDraft[peran] || {};
      const rawHarian = String(draft.daily_token_limit ?? '').replace(/\D/g, '');
      const rawPermenit = String(draft.per_minute_limit ?? '').replace(/\D/g, '');
      const harian = rawHarian === '' ? 0 : Number.parseInt(rawHarian, 10);
      const permenit = rawPermenit === '' ? 0 : Number.parseInt(rawPermenit, 10);
      if (!Number.isFinite(harian) || !Number.isFinite(permenit) || harian < 0 || permenit < 0) {
        setActionError(language === 'en' ? `Limits for role '${peran}' must be non-negative integers.` : `Batas peran '${peran}' harus berupa angka bulat 0 atau lebih.`);
        return;
      }
      payloadLimits[peran] = {
        daily_token_limit: harian,
        per_minute_limit: permenit,
      };
    }

    setSavingBatas(true);
    try {
      const hasil = await api.adminQuotaBatas({ limits: payloadLimits });
      setKuota((k) => (k ? { ...k, role_limits: hasil.role_limits } : k));
      setActionSuccess(language === 'en' ? 'All role limits saved successfully.' : 'Semua batas peran berhasil disimpan.');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingBatas(false);
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
      const selectedRoles = (newUserForm.roles && newUserForm.roles.length > 0) ? newUserForm.roles : [newUserForm.role || 'user'];
      const payload = {
        ...newUserForm,
        roles: selectedRoles,
        role: selectedRoles[0] || 'user',
      };
      await api.adminCreateUser(payload);
      
      setActionSuccess(language === 'en' ? `User '${newUserForm.username}' created successfully!` : `User '${newUserForm.username}' berhasil dibuat!`);
      setNewUserForm({ username: '', password: '', full_name: '', role: 'user', roles: ['user'], assistant_persona: '' });
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
      const selectedRoles = (editUserForm.roles && editUserForm.roles.length > 0) ? editUserForm.roles : [editUserForm.role || 'user'];
      const payload = {
        ...editUserForm,
        roles: selectedRoles,
        role: selectedRoles[0] || 'user',
      };
      await api.adminUpdateUser(targetUsername, payload);
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
      setNewSkillForm({ name: '', description: '', content: '', tags: '', enabled: true });
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
        { id: 'roles', icon: UserCog, label: language === 'en' ? 'Roles' : 'Peran' },
        { id: 'access', icon: ShieldCheck, label: t('admin.tabAccess') },
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

  const allTabs = tabCategories.flatMap(g => g.tabs.map(tab => ({ ...tab, groupName: g.groupName })));
  const currentTab = allTabs.find(tab => tab.id === activeTab) || allTabs[0];
  const CurrentTabIcon = currentTab?.icon || Activity;

  const activeRoleOptions = masterRoles.length > 0
    ? masterRoles.filter(r => r.enabled).map(r => ({ value: r.code, label: r.label, enabled: true }))
    : AVAILABLE_ROLES_OPTIONS;

  const editRoleOptions = masterRoles.length > 0
    ? masterRoles
        .filter(r => r.enabled || (editUserForm.roles || [editUserForm.role]).includes(r.code))
        .map(r => ({
          value: r.code,
          label: r.label + (!r.enabled ? (language === 'en' ? ' (Nonaktif)' : ' (Nonaktif)') : ''),
          enabled: r.enabled,
        }))
    : AVAILABLE_ROLES_OPTIONS;

  const isCurrentTabLoading =
    (activeTab === 'overview' && statsLoading) ||
    (activeTab === 'users' && usersLoading) ||
    (activeTab === 'audit' && auditSessionsLoading) ||
    (activeTab === 'feedback' && feedbackLoading) ||
    (activeTab === 'kuota' && kuotaLoading) ||
    (activeTab === 'skills' && skillsLoading) ||
    (activeTab === 'persona' && configLoading) ||
    (activeTab === 'mcp' && configLoading);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-surface-raised w-screen overflow-hidden text-content animate-fadeIn"
        style={{ height: 'var(--app-height, 100dvh)' }}
      >
      {/* Header Modal */}
      <div
        className="relative flex items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 border-b border-line/80 bg-surface/95 backdrop-blur-xl shrink-0 z-40"
        style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.5rem)' }}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldCheck className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          {/* Desktop View: Clean Breadcrumb on a single row */}
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <span className="text-sm font-extrabold tracking-tight text-content font-display truncate">
              {t('admin.title')}
            </span>
            <span className="text-content-subtle/40 text-xs">/</span>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-accent bg-accent-soft/70 px-2 py-0.5 rounded-md border border-accent/20">
              <CurrentTabIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{currentTab?.label}</span>
            </div>
          </div>

          {/* Mobile View: Compact single-row trigger button */}
          <div className="md:hidden flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-extrabold text-content-muted shrink-0">Admin</span>
            <span className="text-content-subtle/40 text-xs shrink-0">/</span>
            <button
              type="button"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-accent font-bold px-2.5 py-1 rounded-lg bg-accent-soft/80 hover:bg-accent-soft active:scale-95 border border-accent/25 transition-all cursor-pointer shadow-2xs text-xs min-w-0"
              aria-expanded={isMobileNavOpen}
              aria-haspopup="listbox"
              title="Pilih Menu"
            >
              <CurrentTabIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">{currentTab?.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isMobileNavOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-surface-sunken border border-line text-content-subtle">
            Esc
          </kbd>
          <button 
            onClick={onClose}
            className="-mr-1 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-content-muted hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-colors shrink-0 cursor-pointer border border-line/60 hover:border-line"
            aria-label={t('admin.closeAria')}
            title="Tutup (Esc)"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Dropdown Popup Menu on Mobile */}
        {isMobileNavOpen && (
          <>
            <div 
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" 
              onClick={() => setIsMobileNavOpen(false)} 
            />
            <div className="md:hidden absolute left-3 right-3 top-[calc(100%+6px)] z-50 bg-surface-raised border border-line rounded-2xl shadow-2xl p-2 max-h-[65vh] overflow-y-auto space-y-2 animate-fadeIn backdrop-blur-xl">
              <div className="px-2.5 py-1.5 border-b border-line/60 mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                  {language === 'en' ? 'Administration Menu' : 'Pilih Menu Admin'}
                </span>
                <span className="text-[10px] font-mono text-content-muted">
                  {allTabs.length} Menu
                </span>
              </div>
              {tabCategories.map((group) => (
                <div key={group.groupName} className="space-y-1">
                  <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-extrabold tracking-wider text-content-subtle uppercase flex items-center gap-2">
                    <span>{group.groupName}</span>
                    <div className="h-px flex-1 bg-line/60" />
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {group.tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(tab.id);
                            if (tab.id !== 'audit') setSelectedAuditSession(null);
                            setIsMobileNavOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-accent/15 text-accent font-bold border border-accent/30'
                              : 'text-content hover:bg-surface-hover active:bg-surface-sunken border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-content-subtle'}`} />
                            <span className="truncate">{tab.label}</span>
                          </div>
                          {isActive && (
                            <Check className="w-4 h-4 text-accent shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
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
        
        {/* Desktop Categorized Navigation Sidebar (hidden md:flex) */}
        <div className="hidden md:flex w-64 border-r border-line/80 bg-surface p-3.5 flex-col gap-3 overflow-y-auto shrink-0">
          {tabCategories.map((group) => (
            <div key={group.groupName} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 px-3 pt-2 pb-1">
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
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer group ${
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
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-surface-raised pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Top Loading Progress Bar for Large Data */}
          {isCurrentTabLoading && (
            <div className="relative w-full h-1 bg-accent/15 overflow-hidden rounded-full -mt-1 mb-4 shadow-xs">
              <div className="progress-bar-indeterminate rounded-full" />
            </div>
          )}
            
            {/* TAB 1: OVERVIEW & STATS */}
            {activeTab === 'overview' && (
              <div className="space-y-3.5 sm:space-y-5 animate-fadeIn">
                <div className="flex items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line">
                  <div className="min-w-0 hidden sm:block">
                    <h3 className="text-sm sm:text-base font-bold text-content font-display tracking-tight truncate">
                      {language === 'en' ? 'System Overview & Metrics' : 'Ringkasan & Metrik Sistem'}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-content-muted mt-0.5 truncate">
                      {language === 'en' ? 'Chat activity statistics, user satisfaction, and live MCP server status.' : 'Statistik aktivitas percakapan, kepuasan pengguna, dan status live server MCP.'}
                    </p>
                  </div>
                  <div className="sm:hidden text-xs font-bold text-content truncate">
                    {language === 'en' ? 'System Overview' : 'Ringkasan Sistem'}
                  </div>
                  <button 
                    onClick={fetchStats}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 transition-all cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden xs:inline">{language === 'en' ? 'Refresh' : 'Refresh'}</span>
                  </button>
                </div>

                {/* Metrics Cards Grid: 3 cards in 1 row on mobile */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {/* Total Users */}
                  <div className="relative overflow-hidden p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-indigo-500/40 transition-all group">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] xs:text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Users' : 'Pengguna'}</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center shadow-xs shrink-0">
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-content font-mono tracking-tight">
                      {statsLoading && !stats ? (
                        <span className="inline-block w-12 h-6 bg-surface-sunken rounded animate-pulse" />
                      ) : (
                        stats?.total_users ?? 0
                      )}
                    </p>
                    <p className="text-[9px] xs:text-[10px] sm:text-[11px] text-content-muted mt-0.5 truncate hidden xs:flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <span className="truncate">{language === 'en' ? 'Accounts' : 'Akun'}</span>
                    </p>
                  </div>

                  {/* Total Chat Sessions */}
                  <div className="relative overflow-hidden p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-violet-500/40 transition-all group">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] xs:text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Sessions' : 'Sesi'}</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/25 flex items-center justify-center shadow-xs shrink-0">
                        <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-content font-mono tracking-tight">
                      {statsLoading && !stats ? (
                        <span className="inline-block w-12 h-6 bg-surface-sunken rounded animate-pulse" />
                      ) : (
                        stats?.total_sessions ?? 0
                      )}
                    </p>
                    <p className="text-[9px] xs:text-[10px] sm:text-[11px] text-content-muted mt-0.5 truncate hidden xs:flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                      <span className="truncate">{language === 'en' ? 'Stored' : 'Tersimpan'}</span>
                    </p>
                  </div>

                  {/* Total Messages */}
                  <div className="relative overflow-hidden p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-surface border border-line/80 shadow-xs hover:border-emerald-500/40 transition-all group">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] xs:text-[11px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Messages' : 'Pesan'}</span>
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center shadow-xs shrink-0">
                        <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </div>
                    <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-content font-mono tracking-tight">
                      {statsLoading && !stats ? (
                        <span className="inline-block w-12 h-6 bg-surface-sunken rounded animate-pulse" />
                      ) : (
                        stats?.total_messages ?? 0
                      )}
                    </p>
                    <p className="text-[9px] xs:text-[10px] sm:text-[11px] text-content-muted mt-0.5 truncate hidden xs:flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">{language === 'en' ? 'Queries' : 'Query & Res'}</span>
                    </p>
                  </div>
                </div>

                {/* User Satisfaction & Feedback Card */}
                <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-4">
                    <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-1.5 font-display truncate">
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{language === 'en' ? 'Satisfaction Metrics' : 'Metrik Kepuasan'}</span>
                    </h4>
                    <span className="text-[10px] sm:text-xs font-medium text-content-muted bg-surface-sunken px-2 py-0.5 rounded-md border border-line/60 shrink-0">
                      {language === 'en' ? `${stats?.total_feedback ?? 0} Ratings` : `${stats?.total_feedback ?? 0} Rating`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {/* Satisfaction Rate */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-surface-sunken/60 border border-line/80 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-amber-500">
                        <span className="text-[9px] xs:text-[10px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Rate' : 'Tingkat'}</span>
                        <Star className="w-3.5 h-3.5 fill-amber-500 shrink-0" />
                      </div>
                      <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-content font-mono">
                        {stats?.satisfaction_rate !== null && stats?.satisfaction_rate !== undefined ? `${stats.satisfaction_rate}%` : '100%'}
                      </p>
                      <p className="text-[9px] xs:text-[10px] text-content-muted mt-0.5 hidden xs:block truncate">{language === 'en' ? 'Helpful ratio' : 'Rasio suka'}</p>
                    </div>

                    {/* Likes count */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-500">
                        <span className="text-[9px] xs:text-[10px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Likes' : 'Suka'}</span>
                        <ThumbsUp className="w-3.5 h-3.5 shrink-0" />
                      </div>
                      <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-emerald-500 font-mono">
                        {stats?.likes_count ?? 0}
                      </p>
                      <p className="text-[9px] xs:text-[10px] text-content-muted mt-0.5 hidden xs:block truncate">{language === 'en' ? 'Helpful' : 'Membantu'}</p>
                    </div>

                    {/* Dislikes count */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-rose-500">
                        <span className="text-[9px] xs:text-[10px] sm:text-xs font-bold uppercase tracking-wider text-content-muted truncate">{language === 'en' ? 'Dislikes' : 'Tidak Suka'}</span>
                        <ThumbsDown className="w-3.5 h-3.5 shrink-0" />
                      </div>
                      <p className="text-base xs:text-xl sm:text-2xl font-black mt-1 text-rose-500 font-mono">
                        {stats?.dislikes_count ?? 0}
                      </p>
                      <p className="text-[9px] xs:text-[10px] text-content-muted mt-0.5 hidden xs:block truncate">{language === 'en' ? 'Need improvement' : 'Perlu dicek'}</p>
                    </div>
                  </div>
                </div>

                {/* MCP Live Status Card */}
                <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content mb-2.5 sm:mb-3.5 flex items-center gap-1.5 font-display">
                    <Server className="w-3.5 h-3.5 text-accent" /> {language === 'en' ? 'Live MCP Servers' : 'Status Server MCP'}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    {/* MCP SAP Card */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-content truncate">SAP Gateway</span>
                        {(stats?.mcp_status?.sap?.status === 'online' || stats?.mcp_status?.sap?.online === true) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0" title={stats?.mcp_status?.sap?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-content-muted mt-1 truncate">
                        {stats?.mcp_status?.sap?.tools_count ?? stats?.mcp_status?.sap?.tool_count ?? 0} tools • {stats?.mcp_status?.sap?.active_server || 'Default'}
                      </p>
                    </div>

                    {/* MCP RAG Card */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-content truncate">RAG Knowledge</span>
                        {(stats?.mcp_status?.rag?.status === 'online' || stats?.mcp_status?.rag?.online === true) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0" title={stats?.mcp_status?.rag?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-content-muted mt-1 truncate">
                        {stats?.mcp_status?.rag?.tools_count ?? stats?.mcp_status?.rag?.tool_count ?? 0} tools • Vector & Doc
                      </p>
                    </div>

                    {/* MCP SQL Card */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-content truncate">SQL Database</span>
                        {(stats?.mcp_status?.sql?.status === 'online' || stats?.mcp_status?.sql?.online === true) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0" title={stats?.mcp_status?.sql?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-content-muted mt-1 truncate">
                        {stats?.mcp_status?.sql?.tools_count ?? stats?.mcp_status?.sql?.tool_count ?? 0} tools • {stats?.mcp_status?.sql?.active_server || 'Database'}
                      </p>
                    </div>

                    {/* MCP Email Card */}
                    <div className="p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl bg-surface-sunken/60 border border-line/80 hover:border-line transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-content truncate">Email Gateway</span>
                        {(stats?.mcp_status?.email?.status === 'online' || stats?.mcp_status?.email?.online === true) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0" title={stats?.mcp_status?.email?.error || ''}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-content-muted mt-1 truncate">
                        {stats?.mcp_status?.email?.tools_count ?? stats?.mcp_status?.email?.tool_count ?? 0} tools • {stats?.mcp_status?.email?.active_server || 'Mail Archive'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Top Active Users */}
                <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-2 font-display">
                        <UserCheck className="w-4 h-4 text-indigo-400" /> {language === 'en' ? 'Most Active Users' : 'User Paling Aktif'}
                        <span className="text-[10px] font-normal text-content-muted lowercase">
                          (max 10)
                        </span>
                      </h4>
                      <p className="text-[11px] text-content-muted mt-0.5">
                        {language === 'en' ? 'Ranked by chat sessions created' : 'Diurutkan berdasarkan total sesi percakapan'}
                      </p>
                    </div>

                    {/* Filter Period: default per month */}
                    <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-xl border border-line/70 self-start sm:self-auto">
                      {[
                        { id: 'month', labelEn: 'Month', labelId: 'Bulan' },
                        { id: 'week', labelEn: 'Week', labelId: 'Minggu' },
                        { id: 'day', labelEn: 'Today', labelId: 'Hari Ini' },
                        { id: 'all', labelEn: 'All Time', labelId: 'Semua' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleTopUsersPeriodChange(p.id)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                            topUsersPeriod === p.id
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-content-muted hover:text-content hover:bg-surface-elevated/60'
                          }`}
                        >
                          {language === 'en' ? p.labelEn : p.labelId}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-line/60">
                    {topUsersLoading ? (
                      <div className="py-6 text-center text-content-muted text-xs flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        {language === 'en' ? 'Loading top users...' : 'Memuat user aktif...'}
                      </div>
                    ) : (topUsersList?.length > 0 ? (
                      topUsersList.map((u, i) => (
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
                      <p className="text-xs text-content-muted py-3">{language === 'en' ? 'No session activity recorded for this period.' : 'Belum ada aktivitas sesi pada periode ini.'}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: USER MANAGEMENT (CRUD) */}
            {activeTab === 'users' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line">
                  <div className="hidden sm:block">
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight">
                      {language === 'en' ? `User Management (${usersLoading && usersList.length === 0 ? '…' : usersList.length})` : `Manajemen Pengguna (${usersLoading && usersList.length === 0 ? '…' : usersList.length})`}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Add new accounts, manage superadmin/user roles, reset passwords, or set individual personas.' : 'Tambah akun baru, kelola role superadmin/user, reset password, atau atur persona pribadi.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-60 sm:flex-initial">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                      <input 
                        type="text"
                        placeholder={language === 'en' ? 'Search user...' : 'Cari user...'}
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="pl-9 pr-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full text-content placeholder:text-content-subtle transition-all"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddUserOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all shrink-0 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" /> <span className="hidden xs:inline">{language === 'en' ? 'New User' : 'User Baru'}</span><span className="xs:hidden">Baru</span>
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
                        {usersLoading && usersList.length === 0 ? (
                          [...Array(6)].map((_, i) => (
                            <tr key={i} className="animate-pulse">
                              <td className="px-4 py-3.5"><div className="h-4 w-28 bg-surface-sunken rounded-md" /></td>
                              <td className="px-4 py-3.5"><div className="h-4 w-36 bg-surface-sunken/80 rounded-md" /></td>
                              <td className="px-4 py-3.5"><div className="h-5 w-20 bg-surface-sunken/60 rounded-md" /></td>
                              <td className="px-4 py-3.5"><div className="h-4 w-40 bg-surface-sunken/60 rounded-md" /></td>
                              <td className="px-4 py-3.5 text-right"><div className="h-6 w-16 bg-surface-sunken/50 rounded-md ml-auto" /></td>
                            </tr>
                          ))
                        ) : filteredUsers.length > 0 ? (
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
                                  <div className="flex flex-wrap items-center gap-1 max-w-xs">
                                    {(u.roles && u.roles.length > 0 ? u.roles : [u.role]).map((r) => {
                                      const roleMeta = masterRoles.find((mr) => mr.code.toLowerCase() === r.toLowerCase());
                                      const isDisabled = roleMeta && roleMeta.enabled === false;
                                      return (
                                        <span
                                          key={r}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold border whitespace-nowrap ${
                                            isDisabled
                                              ? 'bg-surface-sunken text-content-subtle border-line/70 opacity-70 line-through'
                                              : getRoleBadgeStyle(r)
                                          }`}
                                          title={
                                            isDisabled
                                              ? (language === 'en'
                                                  ? `${formatRoleLabel(r)} (Disabled / Suspended by admin)`
                                                  : `${formatRoleLabel(r)} (Nonaktif / Ditangguhkan oleh admin)`)
                                              : formatRoleLabel(r)
                                          }
                                        >
                                          <span>{formatRoleLabel(r)}</span>
                                          {isDisabled && (
                                            <span className="text-[9px] no-underline font-normal text-rose-400">
                                              ({language === 'en' ? 'Disabled' : 'Nonaktif'})
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-content-muted max-w-xs truncate">
                                {u.assistant_persona || <span className="italic text-content-subtle text-[11px]">{language === 'en' ? 'Follows organization persona' : 'Mengikuti persona organisasi'}</span>}
                              </td>
                              <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                                <button
                                  onClick={() => {
                                    const userRoles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
                                    setEditingUser(u);
                                    setEditUserForm({
                                      role: u.role,
                                      roles: userRoles,
                                      full_name: u.full_name || '',
                                      assistant_persona: u.assistant_persona || '',
                                      password: '',
                                    });
                                  }}
                                  className="p-1.5 text-content-subtle hover:text-accent hover:bg-surface-raised rounded-lg transition-colors cursor-pointer"
                                  title={language === 'en' ? 'Edit user' : 'Edit user'}
                                  aria-label={`Edit user ${u.username}`}
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setActiveTab('access')}
                                  className="p-1.5 text-content-subtle hover:text-emerald-400 hover:bg-surface-raised rounded-lg transition-colors cursor-pointer"
                                  title={language === 'en' ? 'Manage MCP access' : 'Kelola hak akses MCP'}
                                  aria-label={`Akses MCP ${u.username}`}
                                >
                                  <ShieldCheck className="w-4 h-4" />
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
                          <label className="block text-xs font-semibold text-content-muted mb-1.5">
                            {language === 'en' ? 'Roles (Multi-Select)' : 'Peran / Roles (Dapat Dipilih Banyak)'} *
                          </label>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-surface-sunken border border-line rounded-xl">
                            {activeRoleOptions.map((opt) => {
                              const currentRoles = newUserForm.roles || [newUserForm.role];
                              const isSelected = currentRoles.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    let updated;
                                    if (isSelected) {
                                      updated = currentRoles.filter((r) => r !== opt.value);
                                      if (updated.length === 0) updated = ['user'];
                                    } else {
                                      updated = [...currentRoles, opt.value];
                                    }
                                    setNewUserForm({
                                      ...newUserForm,
                                      roles: updated,
                                      role: updated[0] || 'user',
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                                    isSelected
                                      ? getRoleBadgeStyle(opt.value) + ' shadow-xs ring-1 ring-accent/30'
                                      : 'bg-surface border-line text-content-muted hover:border-line-hover hover:text-content'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-content-subtle mt-1">
                            {language === 'en'
                              ? 'Users inherit combined permissions from all assigned roles.'
                              : 'Pengguna mewarisi izin gabungan paling permisif dari seluruh peran terpilih.'}
                          </p>
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
                          <label className="block text-xs font-semibold text-content-muted mb-1.5">
                            {language === 'en' ? 'Roles (Multi-Select)' : 'Peran / Roles (Dapat Dipilih Banyak)'} *
                          </label>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-surface-sunken border border-line rounded-xl">
                            {editRoleOptions.map((opt) => {
                              const currentRoles = editUserForm.roles || [editUserForm.role];
                              const isSelected = currentRoles.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    let updated;
                                    if (isSelected) {
                                      updated = currentRoles.filter((r) => r !== opt.value);
                                      if (updated.length === 0) updated = ['user'];
                                    } else {
                                      updated = [...currentRoles, opt.value];
                                    }
                                    setEditUserForm({
                                      ...editUserForm,
                                      roles: updated,
                                      role: updated[0] || 'user',
                                    });
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                                    isSelected
                                      ? getRoleBadgeStyle(opt.value) + ' shadow-xs ring-1 ring-accent/30'
                                      : 'bg-surface border-line text-content-muted hover:border-line-hover hover:text-content'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-content-subtle mt-1">
                            {language === 'en'
                              ? 'Users inherit combined permissions from all assigned roles.'
                              : 'Pengguna mewarisi izin gabungan paling permisif dari seluruh peran terpilih.'}
                          </p>
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

            {/* TAB: MASTER ROLES */}
            {activeTab === 'roles' && (
              <AdminRoles onRefreshRoles={fetchMasterRoles} />
            )}

            {/* TAB: ACCESS CONTROL MCP */}
            {activeTab === 'access' && (
              <AdminAccessControl
                setActionSuccess={setActionSuccess}
                setActionError={setActionError}
                setConfirmModal={setConfirmModal}
                masterRoles={masterRoles}
                onRefreshRoles={fetchMasterRoles}
              />
            )}

            {/* TAB: CHAT MODES */}
            {activeTab === 'chat_modes' && (
              <AdminChatModes
                onRefreshModes={onRefreshModes}
                setActionSuccess={setActionSuccess}
                setActionError={setActionError}
                setConfirmModal={setConfirmModal}
                masterRoles={masterRoles}
              />
            )}

            {/* TAB: PERSONA ORGANISASI */}
            {activeTab === 'persona' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line/80">
                  <div className="hidden sm:block">
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-accent" />
                      {language === 'en' ? 'Organization Global Persona' : 'Persona Organisasi'}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Core instructions and guidelines applicable to AI assistant for all users.' : 'Aturan dasar dan gaya respons yang berlaku sebagai pedoman AI ke seluruh pengguna.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto">
                    <span className="sm:hidden text-xs font-bold text-content flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-accent" />
                      {language === 'en' ? 'Persona' : 'Persona'}
                    </span>
                    <button
                      onClick={handleSaveGlobalPersona}
                      disabled={personaSaving}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      {personaSaving ? (language === 'en' ? 'Saving…' : 'Menyimpan…') : (language === 'en' ? 'Save Persona' : 'Simpan Persona')}
                    </button>
                  </div>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line/80">
                  <div className="hidden sm:block">
                    <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-accent" />
                      {language === 'en' ? `Assistant Skill Catalog (${skillsLoading && skillsList.length === 0 ? '…' : skillsList.length})` : `Katalog Skill Asisten (${skillsLoading && skillsList.length === 0 ? '…' : skillsList.length})`}
                    </h3>
                    <p className="text-xs text-content-muted mt-0.5">
                      {language === 'en' ? 'Manage domain skill modules and SOPs (e.g. SAP ABAP, SAP PP, etc.) that the AI references during assistance.' : 'Kelola modul keahlian dan SOP khusus (misal: SAP ABAP, SAP PP, dsb.) yang wajib dibaca & dipatuhi AI saat melayani support.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56 sm:flex-initial">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
                      <input 
                        type="text"
                        placeholder={language === 'en' ? 'Search skill...' : 'Cari skill...'}
                        value={skillSearch}
                        onChange={(e) => setSkillSearch(e.target.value)}
                        className="pl-9 pr-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40 w-full text-content placeholder:text-content-subtle transition-all"
                      />
                    </div>
                    <button
                      onClick={() => setIsAddSkillOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all shrink-0 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" /> <span className="hidden xs:inline">{language === 'en' ? 'New Skill' : 'Skill Baru'}</span><span className="xs:hidden">Baru</span>
                    </button>
                  </div>
                </div>

                {/* Skills Grid Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {skillsLoading && skillsList.length === 0 ? (
                    [...Array(4)].map((_, i) => (
                      <div key={i} className="p-5 rounded-2xl border border-line bg-surface space-y-3 animate-pulse">
                        <div className="flex justify-between items-center">
                          <div className="h-5 w-32 bg-surface-sunken rounded" />
                          <div className="h-4 w-14 bg-surface-sunken rounded-full" />
                        </div>
                        <div className="h-3 w-48 bg-surface-sunken/70 rounded" />
                        <div className="h-24 bg-surface-sunken/40 rounded-xl" />
                      </div>
                    ))
                  ) : filteredSkills.length > 0 ? (
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
                                {sk.tags && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {sk.tags.split(',').map((tag, idx) => {
                                      const tClean = tag.trim();
                                      if (!tClean) return null;
                                      return (
                                        <span key={idx} className="px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono">
                                          #{tClean}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
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
                                  tags: sk.tags || '',
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
                            {language === 'en' ? 'Tags / Trigger Keywords (comma separated)' : 'Tags / Kata Kunci Pemicu (pisahkan dengan koma)'}
                          </label>
                          <input
                            type="text"
                            value={newSkillForm.tags}
                            onChange={(e) => setNewSkillForm({ ...newSkillForm, tags: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs font-mono bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder="e.g. pp, produksi, slit roll, slitting, bom, routing, order"
                          />
                          <p className="text-[10px] text-content-subtle mt-1">
                            {language === 'en' ? 'Keywords that automatically trigger selective injection of this SOP during chat.' : 'Kata kunci yang akan memicu pemuatan otomatis panduan ini ke memori AI saat percakapan relevan.'}
                          </p>
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
                            {language === 'en' ? 'Tags / Trigger Keywords (comma separated)' : 'Tags / Kata Kunci Pemicu (pisahkan dengan koma)'}
                          </label>
                          <input
                            type="text"
                            value={editSkillForm.tags}
                            onChange={(e) => setEditSkillForm({ ...editSkillForm, tags: e.target.value })}
                            className="w-full px-3.5 py-2 text-xs font-mono bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                            placeholder="e.g. pp, produksi, slit roll, slitting, bom, routing, order"
                          />
                          <p className="text-[10px] text-content-subtle mt-1">
                            {language === 'en' ? 'Keywords that automatically trigger selective injection of this SOP during chat.' : 'Kata kunci yang akan memicu pemuatan otomatis panduan ini ke memori AI saat percakapan relevan.'}
                          </p>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line/80">
                  <div className="hidden sm:block">
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
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto">
                    <span className="sm:hidden text-xs font-bold text-content flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-accent" />
                      MCP Gateway
                    </span>
                    <button
                      onClick={handleSaveMcpConfig}
                      disabled={mcpSaving}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      <Save className="w-4 h-4" />
                      {mcpSaving
                        ? (language === 'en' ? 'Saving...' : 'Menyimpan...')
                        : (language === 'en' ? 'Save MCP' : 'Simpan MCP')}
                    </button>
                  </div>
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
              <div className="space-y-3.5 sm:space-y-5 animate-fadeIn">
                <div className="flex items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-content truncate">{language === 'en' ? 'Token Quotas' : 'Kuota Token'}</h3>
                    <p className="text-[11px] sm:text-xs text-content-muted truncate">
                      {language === 'en' 
                        ? `Usage calculated for ${kuota?.usage_date || '—'} (midnight WIB reset).`
                        : `Pemakaian tanggal ${kuota?.usage_date || '—'} (reset tengah malam WIB).`}
                    </p>
                  </div>
                  <button
                    onClick={fetchKuota}
                    disabled={kuotaLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold bg-surface-hover text-content hover:bg-line transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${kuotaLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden xs:inline">{language === 'en' ? 'Refresh' : 'Muat ulang'}</span>
                  </button>
                </div>

                {kuotaLoading && !kuota ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-20 rounded-2xl bg-surface border border-line p-5" />
                    <div className="h-64 rounded-2xl bg-surface border border-line p-5" />
                    <div className="h-48 rounded-2xl bg-surface border border-line p-5" />
                  </div>
                ) : (
                  <>
                    {/* Saklar penegakan */}
                <div className="flex items-center justify-between gap-3 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-line/80 bg-surface shadow-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-content text-xs sm:text-sm">{language === 'en' ? 'Quota Enforcement' : 'Penegakan Batas Token'}</p>
                    <p className="text-[11px] sm:text-xs text-content-muted mt-0.5">
                      {kuota?.enforced
                        ? (language === 'en' ? 'Active — requests rejected when quota exceeded.' : 'Aktif — permintaan ditolak saat kuota habis.')
                        : (language === 'en' ? 'Inactive — usage is tracked without blocking.' : 'Nonaktif — pemakaian dicatat tanpa blokir.')}
                    </p>
                  </div>
                  <button
                    onClick={() => gantiSaklar(!kuota?.enforced)}
                    disabled={!kuota}
                    aria-label={language === 'en' ? 'Token limit enforcement' : 'Penegakan batas token'}
                    aria-pressed={!!kuota?.enforced}
                    className={`relative h-6 w-11 sm:h-7 sm:w-13 shrink-0 rounded-full transition-all cursor-pointer disabled:opacity-50 ${
                      kuota?.enforced ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 sm:top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        kuota?.enforced ? 'left-5 sm:left-7' : 'left-0.5 sm:left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Batas per peran - Redesigned as Table matching other tabs */}
                <div className="rounded-2xl border border-line/80 bg-surface overflow-hidden shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-line/80 bg-surface">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-content text-xs sm:text-sm">{language === 'en' ? 'Limits Per Role' : 'Batas per Peran'}</p>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-sunken border border-line text-content-muted">
                          {Object.keys(kuota?.role_limits || {}).length} {language === 'en' ? 'Roles' : 'Peran'}
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-content-muted mt-0.5">
                        {language === 'en' ? 'Enter 0 for unlimited. Per-minute limit controls burst requests.' : 'Isi 0 untuk tanpa batas. Batas per menit menahan kiriman beruntun.'}
                      </p>
                    </div>

                    <button
                      onClick={simpanSemuaBatas}
                      disabled={savingBatas || kuotaLoading}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-xs transition-all cursor-pointer shrink-0 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>
                        {savingBatas
                          ? (language === 'en' ? 'Saving...' : 'Menyimpan...')
                          : (language === 'en' ? 'Save All Limits' : 'Simpan Semua Batas')}
                      </span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="bg-surface-sunken/70 border-b border-line/80 text-content-muted text-[10px] sm:text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
                        <tr>
                          <th className="px-4 sm:px-5 py-3 sm:w-56">{language === 'en' ? 'Role' : 'Peran'}</th>
                          <th className="px-4 py-3">{language === 'en' ? 'Daily Tokens' : 'Token / Hari'}</th>
                          <th className="px-4 py-3 sm:w-48">{language === 'en' ? 'Per Minute (Burst)' : 'Batas per Menit'}</th>
                          <th className="px-4 sm:px-5 py-3 sm:w-56">{language === 'en' ? 'Limit Summary' : 'Ringkasan Batas'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60 text-content-secondary">
                        {Object.keys(kuota?.role_limits || {}).map((peran) => {
                          const draft = batasDraft[peran] || {};
                          const rawHarian = String(draft.daily_token_limit ?? '').replace(/\D/g, '');
                          const rawPermenit = String(draft.per_minute_limit ?? '').replace(/\D/g, '');
                          const isUnlimitedDaily = rawHarian === '0';
                          const isUnlimitedMinute = rawPermenit === '0';

                          return (
                            <tr key={peran} className="hover:bg-surface-hover/70 transition-colors">
                              {/* Role */}
                              <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${getRoleBadgeStyle(peran)}`}>
                                    {peran.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-xs sm:text-sm text-content">
                                        {formatRoleLabel(peran)}
                                      </span>
                                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono font-bold uppercase ${getRoleBadgeStyle(peran)}`}>
                                        {peran}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-content-subtle font-mono mt-0.5">role:{peran.toLowerCase()}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Daily Tokens Input */}
                              <td className="px-4 py-3">
                                <div className="max-w-xs">
                                  <input
                                    id={`harian-${peran}`}
                                    type="text"
                                    inputMode="numeric"
                                    value={formatNumberSeparator(draft.daily_token_limit)}
                                    onChange={(e) => {
                                      const cleanDigits = e.target.value.replace(/\D/g, '');
                                      setBatasDraft((d) => ({
                                        ...d,
                                        [peran]: { ...d[peran], daily_token_limit: cleanDigits },
                                      }));
                                    }}
                                    placeholder="0"
                                    className="w-full px-3 py-1.5 rounded-lg border border-line bg-surface-sunken/60 hover:bg-surface text-content text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                                  />
                                </div>
                              </td>

                              {/* Per Minute Input */}
                              <td className="px-4 py-3">
                                <div className="max-w-[150px]">
                                  <input
                                    id={`menit-${peran}`}
                                    type="text"
                                    inputMode="numeric"
                                    value={formatNumberSeparator(draft.per_minute_limit)}
                                    onChange={(e) => {
                                      const cleanDigits = e.target.value.replace(/\D/g, '');
                                      setBatasDraft((d) => ({
                                        ...d,
                                        [peran]: { ...d[peran], per_minute_limit: cleanDigits },
                                      }));
                                    }}
                                    placeholder="0"
                                    className="w-full px-3 py-1.5 rounded-lg border border-line bg-surface-sunken/60 hover:bg-surface text-content text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                                  />
                                </div>
                              </td>

                              {/* Summary Badges */}
                              <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isUnlimitedDaily ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      ♾️ {language === 'en' ? 'Unlimited' : 'Tanpa Batas'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                      ≈ {formatTokenWordHelper(draft.daily_token_limit)} / {language === 'en' ? 'day' : 'hari'}
                                    </span>
                                  )}
                                  {isUnlimitedMinute ? (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-sunken text-content-muted border border-line">
                                      Burst: ∞
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-sunken text-content-muted border border-line">
                                      Burst: {draft.per_minute_limit || 0}/m
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
              </>
            )}
              </div>
            )}

            {activeTab === 'feedback' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/80 pb-3 sm:pb-4">
                  <div className="hidden sm:block">
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

                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                    <span className="sm:hidden text-xs font-bold text-content flex items-center gap-1.5">
                      <ThumbsUp className="w-4 h-4 text-accent" />
                      {language === 'en' ? 'Feedback' : 'Penilaian'}
                    </span>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-line shrink-0">
                  <div className="hidden sm:block">
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
                    {auditSessionsLoading && auditSessions.length === 0 ? (
                      <div className="p-3 space-y-2.5 animate-pulse">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="p-3 rounded-xl bg-surface-sunken/60 space-y-2">
                            <div className="flex justify-between">
                              <div className="h-3.5 w-24 bg-surface-sunken rounded" />
                              <div className="h-3 w-16 bg-surface-sunken rounded" />
                            </div>
                            <div className="h-3 w-40 bg-surface-sunken/80 rounded" />
                          </div>
                        ))}
                      </div>
                    ) : filteredAuditSessions.length > 0 ? (
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
                      auditMessagesLoading ? (
                        <div className="space-y-4 p-3 animate-pulse">
                          <div className="flex justify-end"><div className="h-12 w-2/3 bg-accent/20 rounded-2xl" /></div>
                          <div className="flex justify-start"><div className="h-20 w-3/4 bg-surface-sunken rounded-2xl" /></div>
                          <div className="flex justify-end"><div className="h-10 w-1/2 bg-accent/20 rounded-2xl" /></div>
                          <div className="flex justify-start"><div className="h-24 w-4/5 bg-surface-sunken rounded-2xl" /></div>
                        </div>
                      ) : (
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
                      )
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