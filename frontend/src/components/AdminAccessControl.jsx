import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Code2,
  Cpu,
  Database,
  Edit2,
  Eye,
  EyeOff,
  Filter,
  Globe,
  HardDrive,
  Info,
  Layers,
  Lock,
  Mail,
  PenTool,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Unlock,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const ALL_ROLES = [
  {
    role: 'superadmin',
    label: 'Super Admin',
    desc: 'Full System & Access',
    color: 'purple',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    icon: ShieldCheck,
  },
  {
    role: 'abaper',
    label: 'ABAPer',
    desc: 'Technical & Development',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    icon: Code2,
  },
  {
    role: 'functional',
    label: 'Functional',
    desc: 'Business Consultant Modules',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: Terminal,
  },
  {
    role: 'backend',
    label: 'Backend',
    desc: 'Backend & Database Systems',
    color: 'amber',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    icon: Database,
  },
  {
    role: 'frontend',
    label: 'Frontend',
    desc: 'Frontend & UI Engineering',
    color: 'cyan',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    icon: Globe,
  },
  {
    role: 'basis',
    label: 'Basis',
    desc: 'SAP Basis & Infrastructure',
    color: 'rose',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    icon: Cpu,
  },
  {
    role: 'data_analyst',
    label: 'Data Analyst',
    desc: 'BI & Analytical Reporting',
    color: 'teal',
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    icon: Layers,
  },
  {
    role: 'user',
    label: 'Standard User',
    desc: 'General End-User Access',
    color: 'sky',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: User,
  },
  {
    role: 'guest',
    label: 'Guest',
    desc: 'Public / Unregistered',
    color: 'zinc',
    badgeClass: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    icon: Globe,
  },
];

export default function AdminAccessControl({
  setActionSuccess,
  setActionError,
  setConfirmModal,
}) {
  const { t, language } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState('roles'); // 'roles' | 'users' | 'audit'
  const [roleViewMode, setRoleViewMode] = useState('grid'); // 'grid' | 'cards'
  const [selectedRoleCard, setSelectedRoleCard] = useState('abaper');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [resources, setResources] = useState([]);

  // Role Matrix State
  const [roleMatrix, setRoleMatrix] = useState({});
  const [modifiedRoles, setModifiedRoles] = useState(new Set());

  // User Access State
  const [usersList, setUsersList] = useState([]);
  const [searchUser, setSearchUser] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userResources, setUserResources] = useState([]);
  const [userDirty, setUserDirty] = useState(false);

  // Bulk Action State
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkSelectedUsers, setBulkSelectedUsers] = useState([]);
  const [bulkResource, setBulkResource] = useState('');
  const [bulkState, setBulkState] = useState('allow');
  const [bulkCanWrite, setBulkCanWrite] = useState(false);
  const [bulkValidUntil, setBulkValidUntil] = useState('');

  // Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Production write confirmation modal
  const [prodModal, setProdModal] = useState(null); // { target, resource, callback }
  const [prodInputConfirm, setProdInputConfirm] = useState('');

  // Fetch initial data
  useEffect(() => {
    loadRoleMatrix();
    loadUsersList();
  }, []);

  const loadRoleMatrix = async () => {
    try {
      setLoading(true);
      const res = await api.adminAccessRoles();
      setMasterEnabled(Boolean(res.master_enabled));
      setResources(res.resources || []);
      setRoleMatrix(res.matrix || {});
      setModifiedRoles(new Set());
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal memuat matriks peran');
    } finally {
      setLoading(false);
    }
  };

  const loadUsersList = async () => {
    try {
      const uRes = await api.adminUsers();
      setUsersList(uRes || []);
    } catch (err) {
      console.error('Gagal mengambil user list:', err);
    }
  };

  const loadUserAccess = async (username) => {
    try {
      setLoading(true);
      const res = await api.adminUserAccess(username);
      setSelectedUser(username);
      setUserResources(res.resources || []);
      setUserDirty(false);
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal memuat izin pengguna');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setAuditLoading(true);
      const res = await api.adminAccessAudit(100, 0);
      setAuditLogs(res.logs || []);
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal memuat log audit');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSyncResources = async () => {
    try {
      setLoading(true);
      const res = await api.adminSyncAccessResources();
      setResources(res.resources || []);
      await loadRoleMatrix();
      if (setActionSuccess) {
        setActionSuccess(
          t('access.syncSuccess', { count: res.synced_count ?? res.resources?.length ?? 0 })
        );
      }
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal sinkronisasi resource');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMaster = async () => {
    const nextState = !masterEnabled;
    try {
      setSaving(true);
      await api.adminToggleAccessMaster(nextState);
      setMasterEnabled(nextState);
      if (setActionSuccess) {
        setActionSuccess(
          nextState
            ? 'Penegakan kontrol akses MCP sekarang AKTIF.'
            : 'Penegakan kontrol akses MCP sekarang NONAKTIF (Transisi aman).'
        );
      }
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal mengubah status master switch');
    } finally {
      setSaving(false);
    }
  };

  // Role Matrix Cell Toggle
  const handleRoleToggle = (role, resourceKey, field) => {
    if (role === 'superadmin') return;

    setRoleMatrix((prev) => {
      const next = { ...prev };
      const roleMap = { ...(next[role] || {}) };
      const current = roleMap[resourceKey] || { allowed: false, can_write: false };

      const resObj = resources.find((r) => r.resource_key === resourceKey);
      const isProd = resObj?.is_production;

      let newAllowed = current.allowed;
      let newCanWrite = current.can_write;

      if (field === 'allowed') {
        newAllowed = !current.allowed;
        if (!newAllowed) newCanWrite = false; // Jika read mati, write otomatis mati
      } else if (field === 'can_write') {
        newCanWrite = !current.can_write;
        if (newCanWrite) newAllowed = true; // Jika write aktif, read otomatis aktif
      }

      // Konfirmasi keamanan bila memberi write pada production
      if (field === 'can_write' && newCanWrite && isProd) {
        setProdModal({
          target: `Role '${role}'`,
          resource: resObj,
          callback: () => {
            setRoleMatrix((p) => {
              const n = { ...p };
              const rMap = { ...(n[role] || {}) };
              rMap[resourceKey] = { allowed: true, can_write: true };
              n[role] = rMap;
              return n;
            });
            setModifiedRoles((prevMod) => new Set(prevMod).add(role));
            setProdModal(null);
            setProdInputConfirm('');
          },
        });
        return prev;
      }

      roleMap[resourceKey] = { allowed: newAllowed, can_write: newCanWrite };
      next[role] = roleMap;
      return next;
    });

    setModifiedRoles((prev) => new Set(prev).add(role));
  };

  // Quick Action: Grant all Read for a role
  const handleQuickGrantAllRead = (role) => {
    if (role === 'superadmin') return;
    setRoleMatrix((prev) => {
      const next = { ...prev };
      const roleMap = { ...(next[role] || {}) };
      resources.forEach((r) => {
        const cur = roleMap[r.resource_key] || { allowed: false, can_write: false };
        roleMap[r.resource_key] = { allowed: true, can_write: cur.can_write };
      });
      next[role] = roleMap;
      return next;
    });
    setModifiedRoles((prev) => new Set(prev).add(role));
  };

  // Quick Action: Reset all to None for a role
  const handleQuickResetRole = (role) => {
    if (role === 'superadmin') return;
    setRoleMatrix((prev) => {
      const next = { ...prev };
      const roleMap = { ...(next[role] || {}) };
      resources.forEach((r) => {
        roleMap[r.resource_key] = { allowed: false, can_write: false };
      });
      next[role] = roleMap;
      return next;
    });
    setModifiedRoles((prev) => new Set(prev).add(role));
  };

  const handleSaveRole = async (role) => {
    try {
      setSaving(true);
      const roleItems = Object.entries(roleMatrix[role] || {}).map(([rk, val]) => ({
        resource_key: rk,
        allowed: val.allowed,
        can_write: val.can_write,
      }));
      await api.adminUpdateAccessRoles({ role, items: roleItems });
      setModifiedRoles((prev) => {
        const next = new Set(prev);
        next.delete(role);
        return next;
      });
      if (setActionSuccess) setActionSuccess(`Izin untuk peran '${role}' berhasil disimpan.`);
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal menyimpan izin peran');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllModifiedRoles = async () => {
    try {
      setSaving(true);
      for (const role of modifiedRoles) {
        const roleItems = Object.entries(roleMatrix[role] || {}).map(([rk, val]) => ({
          resource_key: rk,
          allowed: val.allowed,
          can_write: val.can_write,
        }));
        await api.adminUpdateAccessRoles({ role, items: roleItems });
      }
      setModifiedRoles(new Set());
      if (setActionSuccess) setActionSuccess('Semua perubahan matriks peran berhasil disimpan.');
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal menyimpan izin peran');
    } finally {
      setSaving(false);
    }
  };

  // User Resource Toggle
  const handleUserStateChange = (resourceKey, newState) => {
    setUserResources((prev) =>
      prev.map((item) => {
        if (item.resource_key !== resourceKey) return item;
        const willAllow = newState === 'allow';
        return {
          ...item,
          state: newState,
          can_write: willAllow ? item.can_write : false,
        };
      })
    );
    setUserDirty(true);
  };

  const handleUserWriteToggle = (resourceKey) => {
    const item = userResources.find((r) => r.resource_key === resourceKey);
    if (!item) return;

    const nextWrite = !item.can_write;
    const isProd = item.is_production;

    if (nextWrite && isProd) {
      setProdModal({
        target: `User '${selectedUser}'`,
        resource: item,
        callback: () => {
          setUserResources((prev) =>
            prev.map((r) =>
              r.resource_key === resourceKey
                ? { ...r, state: 'allow', can_write: true }
                : r
            )
          );
          setUserDirty(true);
          setProdModal(null);
          setProdInputConfirm('');
        },
      });
      return;
    }

    setUserResources((prev) =>
      prev.map((r) => {
        if (r.resource_key !== resourceKey) return r;
        return {
          ...r,
          can_write: nextWrite,
          state: nextWrite ? 'allow' : r.state,
        };
      })
    );
    setUserDirty(true);
  };

  const handleUserExpiryChange = (resourceKey, dateVal) => {
    setUserResources((prev) =>
      prev.map((r) => (r.resource_key === resourceKey ? { ...r, valid_until: dateVal || null } : r))
    );
    setUserDirty(true);
  };

  const handleSaveUserAccess = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      const items = userResources.map((r) => ({
        resource_key: r.resource_key,
        state: r.state,
        can_write: r.can_write,
        valid_until: r.valid_until || null,
      }));
      await api.adminUpdateUserAccess(selectedUser, { items });
      setUserDirty(false);
      if (setActionSuccess) setActionSuccess(`Override izin untuk '${selectedUser}' berhasil disimpan.`);
      await loadUserAccess(selectedUser);
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal menyimpan override pengguna');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyBulk = async () => {
    if (!bulkResource || bulkSelectedUsers.length === 0) return;
    try {
      setSaving(true);
      const res = await api.adminBulkUserAccess({
        usernames: bulkSelectedUsers,
        resource_key: bulkResource,
        state: bulkState,
        can_write: bulkCanWrite,
        valid_until: bulkValidUntil || null,
      });
      setIsBulkOpen(false);
      setBulkSelectedUsers([]);
      if (setActionSuccess) {
        setActionSuccess(`Berhasil menerapkan izin ke ${res.updated_count || bulkSelectedUsers.length} pengguna.`);
      }
      if (selectedUser) loadUserAccess(selectedUser);
    } catch (err) {
      console.error(err);
      if (setActionError) setActionError(err.message || 'Gagal menerapkan aksi massal');
    } finally {
      setSaving(false);
    }
  };

  // Group resources by kind
  const sapResources = resources.filter((r) => r.kind === 'sap');
  const sqlResources = resources.filter((r) => r.kind === 'sql');
  const serviceResources = resources.filter((r) => r.kind === 'service');

  const filteredUsers = usersList.filter((u) => {
    const q = searchUser.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. MASTER SWITCH BANNER - HERO STYLE */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-all shadow-md ${
          masterEnabled
            ? 'bg-gradient-to-r from-emerald-950/40 via-surface to-surface border-emerald-500/40'
            : 'bg-gradient-to-r from-amber-950/40 via-surface to-surface border-amber-500/40'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-2xl shrink-0 shadow-inner ${
                masterEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ring-4 ring-emerald-500/10'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 ring-4 ring-amber-500/10'
              }`}
            >
              {masterEnabled ? <ShieldCheck className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-bold text-base sm:text-lg text-content tracking-tight">
                  {t('access.masterSwitch')}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    masterEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${masterEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {masterEnabled ? t('access.masterSwitchOn') : t('access.masterSwitchOff')}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-content-muted mt-1.5 leading-relaxed max-w-2xl">
                {masterEnabled ? t('access.masterDescOn') : t('access.masterDescOff')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={handleSyncResources}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover border border-line text-content transition-all cursor-pointer disabled:opacity-50 hover:border-line/80 shadow-xs"
              title="Sinkronkan penemuan resource MCP terbaru"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-accent ${loading ? 'animate-spin' : ''}`} />
              <span>{t('access.syncResources')}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMaster}
              disabled={saving}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-[0.98] ${
                masterEnabled
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
              }`}
            >
              {masterEnabled ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{t('access.disableSwitch')}</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>{t('access.enableSwitch')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION BAR & VIEW CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-surface-sunken rounded-xl border border-line/60 self-start">
          <button
            type="button"
            onClick={() => setActiveSubTab('roles')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'roles'
                ? 'bg-accent text-white shadow-xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t('access.tabRoles')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'users'
                ? 'bg-accent text-white shadow-xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>{t('access.tabUsers')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('audit');
              loadAuditLogs();
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-accent text-white shadow-xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{t('access.tabAudit')}</span>
          </button>
        </div>

        {/* View Switcher for Roles tab */}
        {activeSubTab === 'roles' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-content-subtle font-medium">Tampilan:</span>
            <div className="inline-flex rounded-lg p-0.5 bg-surface-sunken border border-line text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRoleViewMode('grid')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  roleViewMode === 'grid'
                    ? 'bg-surface text-accent shadow-xs font-bold'
                    : 'text-content-subtle hover:text-content'
                }`}
              >
                Matriks Tabel
              </button>
              <button
                type="button"
                onClick={() => setRoleViewMode('cards')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  roleViewMode === 'cards'
                    ? 'bg-surface text-accent shadow-xs font-bold'
                    : 'text-content-subtle hover:text-content'
                }`}
              >
                Per Peran (Cards)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. SUBTAB CONTENT: ROLES MATRIX (TABEL GRID / ROLE CARDS) */}
      {activeSubTab === 'roles' && (
        <div className="space-y-4">
          {/* VIEW A: MATRIKS TABEL (GRID VIEW) */}
          {roleViewMode === 'grid' && (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="border-b border-line bg-surface-sunken/80 backdrop-blur-md">
                      <th className="py-4 px-4 w-[340px] min-w-[320px] text-xs font-bold uppercase tracking-wider text-content-subtle">
                        {t('access.resource')}
                      </th>
                      {ALL_ROLES.map((r) => {
                        const Icon = r.icon;
                        const isSuper = r.role === 'superadmin';
                        return (
                          <th key={r.role} className="py-3 px-3 text-center border-l border-line/40">
                            <div className="flex flex-col items-center">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${r.badgeClass}`}>
                                <Icon className="w-3.5 h-3.5" />
                                <span>{r.label}</span>
                              </span>
                              <span className="text-[10px] text-content-subtle font-normal mt-1 max-w-[130px] truncate">
                                {r.desc}
                              </span>

                              {/* Quick Action buttons */}
                              {!isSuper && (
                                <div className="flex items-center gap-1.5 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleQuickGrantAllRead(r.role)}
                                    className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
                                    title={`Beri hak baca ke semua server untuk ${r.label}`}
                                  >
                                    All Read
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickResetRole(r.role)}
                                    className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-sunken hover:bg-surface-hover text-content-subtle hover:text-content border border-line transition-all cursor-pointer"
                                    title={`Reset perizinan ${r.label}`}
                                  >
                                    Reset
                                  </button>
                                </div>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60 text-xs">
                    {/* SECTION: SAP ERP */}
                    <tr className="bg-surface-sunken/60">
                      <td colSpan={1 + ALL_ROLES.length} className="py-2.5 px-4 border-y border-line/60">
                        <div className="flex items-center gap-2 font-bold text-accent text-xs">
                          <Server className="w-4 h-4 text-accent" />
                          <span>SAP ERP Systems</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-accent/15 text-accent border border-accent/30">
                            {sapResources.length} Server
                          </span>
                        </div>
                      </td>
                    </tr>
                    {sapResources.map((res) => renderModernRoleRow(res))}

                    {/* SECTION: SQL DATABASE */}
                    <tr className="bg-surface-sunken/60">
                      <td colSpan={1 + ALL_ROLES.length} className="py-2.5 px-4 border-y border-line/60">
                        <div className="flex items-center gap-2 font-bold text-blue-400 text-xs">
                          <Database className="w-4 h-4 text-blue-400" />
                          <span>SQL Database Instances</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            {sqlResources.length} Database
                          </span>
                        </div>
                      </td>
                    </tr>
                    {sqlResources.map((res) => renderModernRoleRow(res))}

                    {/* SECTION: COMPANION SERVICES */}
                    <tr className="bg-surface-sunken/60">
                      <td colSpan={1 + ALL_ROLES.length} className="py-2.5 px-4 border-y border-line/60">
                        <div className="flex items-center gap-2 font-bold text-amber-400 text-xs">
                          <Layers className="w-4 h-4 text-amber-400" />
                          <span>Companion Integrations</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            {serviceResources.length} Layanan
                          </span>
                        </div>
                      </td>
                    </tr>
                    {serviceResources.map((res) => renderModernRoleRow(res))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW B: ROLE CARDS (DETAIL PER PERAN) */}
          {roleViewMode === 'cards' && (
            <div className="space-y-5">
              {/* Role Picker Pills */}
              <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-surface border border-line">
                {ALL_ROLES.map((r) => {
                  const isSel = selectedRoleCard === r.role;
                  const Icon = r.icon;
                  const isMod = modifiedRoles.has(r.role);
                  return (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => setSelectedRoleCard(r.role)}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSel
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-content-muted hover:text-content hover:bg-surface-hover'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{r.label}</span>
                      {isMod && <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-surface animate-pulse" />}
                    </button>
                  );
                })}
              </div>

              {/* Cards for the selected role */}
              <div className="p-5 rounded-2xl border border-line bg-surface space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
                  <div>
                    <h3 className="text-base font-bold text-content flex items-center gap-2">
                      <span>Perizinan Khusus untuk</span>
                      <span className="text-accent underline decoration-accent/40 underline-offset-4">
                        {ALL_ROLES.find((r) => r.role === selectedRoleCard)?.label}
                      </span>
                    </h3>
                    <p className="text-xs text-content-muted mt-1">
                      {ALL_ROLES.find((r) => r.role === selectedRoleCard)?.desc}
                    </p>
                  </div>

                  {selectedRoleCard !== 'superadmin' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickGrantAllRead(selectedRoleCard)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer transition-all"
                      >
                        Beri Semua Izin Baca
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickResetRole(selectedRoleCard)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover text-content-subtle hover:text-content border border-line cursor-pointer transition-all"
                      >
                        Kosongkan (Deny All)
                      </button>
                    </div>
                  )}
                </div>

                {/* Groups */}
                <div className="space-y-6">
                  {/* SAP ERP Group */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-2 mb-3">
                      <Server className="w-4 h-4" /> SAP ERP Systems ({sapResources.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sapResources.map((res) => renderCardItem(res, selectedRoleCard))}
                    </div>
                  </div>

                  {/* SQL Group */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4" /> SQL Database Instances ({sqlResources.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sqlResources.map((res) => renderCardItem(res, selectedRoleCard))}
                    </div>
                  </div>

                  {/* Services Group */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4" /> Companion Integrations ({serviceResources.length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {serviceResources.map((res) => renderCardItem(res, selectedRoleCard))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FLOATING ACTION BAR FOR UNSAVED CHANGES */}
          {modifiedRoles.size > 0 && (
            <div className="sticky bottom-4 z-40 flex items-center justify-between p-4 rounded-2xl bg-surface-raised/95 backdrop-blur-xl border border-accent/40 shadow-2xl animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent/20 text-accent animate-pulse">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-content">
                    Ada perubahan pada {modifiedRoles.size} peran yang belum disimpan
                  </h4>
                  <p className="text-[11px] text-content-muted">
                    Peran: {[...modifiedRoles].join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadRoleMatrix}
                  disabled={saving}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover text-content border border-line cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllModifiedRoles}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-accent text-white hover:bg-accent/90 shadow-md cursor-pointer transition-all active:scale-[0.98]"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Menyimpan…' : 'Simpan Semua Perubahan'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. SUBTAB CONTENT: USER OVERRIDES */}
      {activeSubTab === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* User Selector Column */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-content-subtle">
                Daftar Pengguna ({usersList.length})
              </h4>
              <button
                type="button"
                onClick={() => setIsBulkOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-bold cursor-pointer"
              >
                <span>+ {t('access.bulkAction')}</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-content-subtle absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                placeholder={t('access.searchUser')}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-sunken border border-line text-content focus:border-accent focus:outline-none"
              />
            </div>

            <div className="max-h-[560px] overflow-y-auto space-y-1.5 pr-1">
              {filteredUsers.map((u) => {
                const isSel = selectedUser === u.username;
                return (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => loadUserAccess(u.username)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all cursor-pointer ${
                      isSel
                        ? 'bg-accent/15 border border-accent/50 text-accent font-bold shadow-xs'
                        : 'bg-surface hover:bg-surface-hover border border-line text-content'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-content">{u.full_name || u.username}</p>
                      <p className="text-[10px] text-content-muted truncate font-mono">@{u.username}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 justify-end max-w-[140px]">
                      {(u.roles && u.roles.length > 0 ? u.roles : [u.role || 'user']).map((r) => (
                        <span key={r} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-surface-sunken border border-line text-content-subtle">
                          {r}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Resource Matrix Column */}
          <div className="md:col-span-2 space-y-4">
            {selectedUser ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface border border-line shadow-xs">
                  <div>
                    <h3 className="text-sm font-bold text-content flex items-center gap-2 flex-wrap">
                      <span>Override Hak Akses:</span>
                      <span className="text-accent font-mono px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/30">
                        @{selectedUser}
                      </span>
                      {(() => {
                        const selU = usersList.find((x) => x.username === selectedUser);
                        const roles = selU?.roles && selU.roles.length > 0 ? selU.roles : [selU?.role || 'user'];
                        return (
                          <span className="text-xs text-content-muted font-normal">
                            ({roles.map((r) => r.toUpperCase()).join(' + ')})
                          </span>
                        );
                      })()}
                    </h3>
                    <p className="text-[11px] text-content-muted mt-1">
                      Pilih 'Warisi' untuk mengikuti template Role gabungan, atau tentukan Allow / Deny khusus.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveUserAccess}
                    disabled={!userDirty || saving}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                      userDirty
                        ? 'bg-accent text-white hover:bg-accent/90'
                        : 'bg-surface-sunken text-content-subtle border border-line cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Menyimpan…' : 'Simpan Override'}</span>
                  </button>
                </div>

                {/* Matrix Table */}
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-line bg-surface-sunken/80 text-content-subtle text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4 w-[280px] min-w-[260px]">Sumber Daya</th>
                          <th className="py-3 px-3">Status Izin (Tri-State)</th>
                          <th className="py-3 px-3 text-center">Hak Tulis (Write)</th>
                          <th className="py-3 px-3">Berlaku Hingga</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {userResources.map((res) => {
                          const isProd = res.is_production;
                          return (
                            <tr key={res.resource_key} className="hover:bg-surface-hover/50 transition-colors">
                              <td className="py-3 px-4 w-[280px] min-w-[260px]">
                                <div className="font-semibold text-content flex items-center gap-2">
                                  <span>{res.label || res.resource_key}</span>
                                  {isProd && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-danger/15 text-danger border border-danger/30 leading-none">
                                      PRD
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-content-subtle font-mono">{res.resource_key}</span>
                              </td>

                              {/* Tri-state buttons */}
                              <td className="py-3 px-3">
                                <div className="inline-flex rounded-xl p-0.5 bg-surface-sunken border border-line text-[10px] font-bold">
                                  <button
                                    type="button"
                                    onClick={() => handleUserStateChange(res.resource_key, 'inherit')}
                                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                                      res.state === 'inherit'
                                        ? 'bg-surface text-content shadow-xs font-extrabold border border-line'
                                        : 'text-content-subtle hover:text-content'
                                    }`}
                                    title="Mewarisi aturan peran"
                                  >
                                    {t('access.stateInherit')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUserStateChange(res.resource_key, 'allow')}
                                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                                      res.state === 'allow'
                                        ? 'bg-emerald-500 text-white shadow-xs font-extrabold'
                                        : 'text-content-subtle hover:text-emerald-400'
                                    }`}
                                  >
                                    {t('access.stateAllow')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUserStateChange(res.resource_key, 'deny')}
                                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                                      res.state === 'deny'
                                        ? 'bg-danger text-white shadow-xs font-extrabold'
                                        : 'text-content-subtle hover:text-danger'
                                    }`}
                                  >
                                    {t('access.stateDeny')}
                                  </button>
                                </div>
                              </td>

                              {/* Can Write Toggle */}
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleUserWriteToggle(res.resource_key)}
                                  disabled={res.state === 'deny'}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                    res.can_write
                                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 shadow-xs'
                                      : 'bg-surface-sunken text-content-subtle border-line hover:text-content'
                                  }`}
                                >
                                  <PenTool className="w-3 h-3" />
                                  <span>{res.can_write ? 'Write Aktif' : 'Nonaktif'}</span>
                                </button>
                              </td>

                              {/* Valid Until Input */}
                              <td className="py-3 px-3">
                                <input
                                  type="date"
                                  value={res.valid_until ? res.valid_until.slice(0, 10) : ''}
                                  onChange={(e) => handleUserExpiryChange(res.resource_key, e.target.value)}
                                  className="text-xs px-2.5 py-1.5 rounded-xl bg-surface-sunken border border-line text-content focus:border-accent focus:outline-none"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-line bg-surface-sunken/40">
                <div className="p-3 rounded-2xl bg-surface border border-line text-content-subtle mb-3">
                  <Users className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold text-content">Pilih Pengguna</h4>
                <p className="text-xs text-content-muted mt-1 max-w-sm">
                  {t('access.selectUser')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SUBTAB CONTENT: AUDIT LOG */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-content-subtle flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <span>Riwayat Perubahan Hak Akses MCP ({auditLogs.length})</span>
            </h4>
            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={auditLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface border border-line text-content hover:bg-surface-hover cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-accent ${auditLoading ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken/80 text-content-subtle text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-3">Pelaku</th>
                    <th className="py-3 px-3">Target</th>
                    <th className="py-3 px-3">Aksi</th>
                    <th className="py-3 px-4">Detail Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {auditLogs.length > 0 ? (
                    auditLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-hover/50">
                        <td className="py-3 px-4 text-content-muted whitespace-nowrap font-mono text-[11px]">
                          {l.created_at ? new Date(l.created_at).toLocaleString() : '-'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-content">@{l.actor}</td>
                        <td className="py-3 px-3 font-mono text-content-muted">
                          <span className="px-2 py-0.5 rounded bg-surface-sunken border border-line">
                            {l.target_type}:{l.target_id}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-accent/15 text-accent border border-accent/30">
                            {l.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-content-muted">{l.detail}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-content-subtle text-xs">
                        Belum ada riwayat audit perubahan hak akses.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL BULK ACTION */}
      {isBulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-bold text-sm text-content flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                <span>{t('access.bulkAction')} (Aksi Massal)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="p-1 rounded-lg text-content-subtle hover:text-content cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-content-subtle font-bold mb-1">Target Sumber Daya</label>
                <select
                  value={bulkResource}
                  onChange={(e) => setBulkResource(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-content focus:border-accent focus:outline-none"
                >
                  <option value="">-- Pilih Resource --</option>
                  {resources.map((r) => (
                    <option key={r.resource_key} value={r.resource_key}>
                      {r.label} ({r.resource_key}) {r.is_production ? '[PRD]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-content-subtle font-bold mb-1">Status Izin</label>
                <div className="grid grid-cols-3 gap-2">
                  {['allow', 'deny', 'inherit'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBulkState(st)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                        bulkState === st
                          ? 'bg-accent text-white shadow-sm'
                          : 'bg-surface-sunken text-content border border-line hover:bg-surface-hover'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="bulkCanWrite"
                  checked={bulkCanWrite}
                  onChange={(e) => setBulkCanWrite(e.target.checked)}
                  disabled={bulkState === 'deny'}
                  className="w-4 h-4 rounded text-accent cursor-pointer"
                />
                <label htmlFor="bulkCanWrite" className="text-content font-medium cursor-pointer">
                  Berikan juga hak tulis (can_write)
                </label>
              </div>

              <div>
                <label className="block text-content-subtle font-bold mb-1">Berlaku Hingga (Opsional)</label>
                <input
                  type="date"
                  value={bulkValidUntil}
                  onChange={(e) => setBulkValidUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-content focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-content-subtle font-bold mb-1">
                  Pilih Pengguna ({bulkSelectedUsers.length} terpilih)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-xl bg-surface-sunken border border-line">
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-line">
                    <button
                      type="button"
                      onClick={() => setBulkSelectedUsers(usersList.map((u) => u.username))}
                      className="text-[10px] text-accent font-bold hover:underline cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSelectedUsers([])}
                      className="text-[10px] text-content-subtle hover:underline cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  </div>
                  {usersList.map((u) => {
                    const isChecked = bulkSelectedUsers.includes(u.username);
                    return (
                      <label
                        key={u.username}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface cursor-pointer text-[11px]"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setBulkSelectedUsers(bulkSelectedUsers.filter((x) => x !== u.username));
                            } else {
                              setBulkSelectedUsers([...bulkSelectedUsers, u.username]);
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-accent cursor-pointer"
                        />
                        <span className="font-semibold text-content">{u.username}</span>
                        <span className="text-content-subtle text-[10px]">({u.role})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover text-content border border-line cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyBulk}
                disabled={saving || !bulkResource || bulkSelectedUsers.length === 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {t('access.bulkApply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL KONFIRMASI PRODUCTION WRITE */}
      {prodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in zoom-in-95">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-danger/50 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-danger">
              <div className="p-3 rounded-2xl bg-danger/20 border border-danger/40 ring-4 ring-danger/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-content">{t('access.confirmProdWriteTitle')}</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-danger/20 text-danger border border-danger/40">
                  Critical Security Protection
                </span>
              </div>
            </div>

            <p className="text-xs text-content-muted leading-relaxed">
              Anda akan memberikan hak <strong>TULIS (WRITE / MODIFY)</strong> pada server <strong>PRODUCTION</strong> (
              <span className="text-danger font-bold">{prodModal.resource?.label || prodModal.resource?.resource_key}</span>
              ) untuk <strong>{prodModal.target}</strong>.
            </p>

            <p className="text-xs text-content-subtle">
              Ketik nama server <code className="text-danger font-mono font-bold">{prodModal.resource?.resource_key}</code> di bawah untuk mengonfirmasi:
            </p>

            <input
              type="text"
              value={prodInputConfirm}
              onChange={(e) => setProdInputConfirm(e.target.value)}
              placeholder={prodModal.resource?.resource_key}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-sunken border border-danger/40 text-danger font-mono text-xs focus:outline-none focus:ring-2 focus:ring-danger"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setProdModal(null);
                  setProdInputConfirm('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover text-content border border-line cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={prodModal.callback}
                disabled={prodInputConfirm.trim() !== prodModal.resource?.resource_key}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-danger text-white hover:bg-danger/90 disabled:opacity-40 cursor-pointer shadow-md"
              >
                Konfirmasi Hak Tulis PRD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Modern Row Renderer for Grid View
  function renderModernRoleRow(res) {
    const isProd = res.is_production;
    return (
      <tr key={res.resource_key} className="hover:bg-surface-hover/60 transition-colors">
        <td className="py-3 px-4 w-[340px] min-w-[320px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-content whitespace-nowrap">{res.label || res.resource_key}</span>
            {isProd && (
              <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-danger/20 text-danger border border-danger/40 leading-none">
                PRD
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-content-subtle font-mono whitespace-nowrap">
              {res.resource_key}
            </span>
            {(res.sid || res.client) && (
              <span className="inline-flex items-center shrink-0 whitespace-nowrap px-2 py-0.5 rounded-md bg-surface-sunken border border-line font-mono text-[10px] text-content-muted">
                {res.sid ? res.sid : ''}
                {res.sid && res.client ? ' • ' : ''}
                {res.client ? `Client ${res.client}` : ''}
              </span>
            )}
          </div>
        </td>

        {ALL_ROLES.map((r) => {
          const roleMap = roleMatrix[r.role] || {};
          const current = roleMap[res.resource_key] || { allowed: false, can_write: false };
          const isSuper = r.role === 'superadmin';

          if (isSuper) {
            return (
              <td key={r.role} className="py-3 px-3 text-center border-l border-line/40 bg-purple-500/5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30">
                  <ShieldCheck className="w-3 h-3" /> Full Bypass
                </span>
              </td>
            );
          }

          const isRead = Boolean(current.allowed);
          const isWrite = Boolean(current.can_write);

          return (
            <td key={r.role} className="py-3 px-2 text-center border-l border-line/40">
              <div className="flex items-center justify-center gap-1.5">
                {/* Read Button */}
                <button
                  type="button"
                  onClick={() => handleRoleToggle(r.role, res.resource_key, 'allowed')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                    isRead
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/20'
                      : 'bg-surface-sunken text-content-subtle/70 border-line hover:text-content hover:bg-surface-hover'
                  }`}
                  title={isRead ? 'Izin Baca Aktif (Klik untuk matikan)' : 'Izin Baca Nonaktif (Klik untuk aktifkan)'}
                >
                  <Eye className={`w-3 h-3 ${isRead ? 'text-emerald-400' : 'text-content-subtle'}`} />
                  <span>Read</span>
                </button>

                {/* Write Button */}
                <button
                  type="button"
                  onClick={() => handleRoleToggle(r.role, res.resource_key, 'can_write')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                    isWrite
                      ? isProd
                        ? 'bg-danger/25 text-danger border-danger/50 shadow-xs ring-1 ring-danger/30 font-black'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-xs ring-1 ring-indigo-500/20'
                      : 'bg-surface-sunken text-content-subtle/70 border-line hover:text-content hover:bg-surface-hover'
                  }`}
                  title={isWrite ? 'Izin Tulis Aktif (Klik untuk matikan)' : 'Izin Tulis Nonaktif (Klik untuk aktifkan)'}
                >
                  <PenTool className={`w-3 h-3 ${isWrite ? (isProd ? 'text-danger' : 'text-indigo-400') : 'text-content-subtle'}`} />
                  <span>Write</span>
                </button>
              </div>
            </td>
          );
        })}
      </tr>
    );
  }

  // Card Item Renderer for Role View Mode
  function renderCardItem(res, role) {
    const isSuper = role === 'superadmin';
    const roleMap = roleMatrix[role] || {};
    const current = roleMap[res.resource_key] || { allowed: false, can_write: false };
    const isProd = res.is_production;
    const isRead = isSuper || Boolean(current.allowed);
    const isWrite = isSuper || Boolean(current.can_write);

    return (
      <div
        key={res.resource_key}
        className={`p-3.5 rounded-xl border transition-all ${
          isRead
            ? 'bg-surface-raised border-line shadow-xs'
            : 'bg-surface-sunken/40 border-line/50 opacity-75'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h5 className="font-bold text-xs text-content truncate">{res.label || res.resource_key}</h5>
              {isProd && (
                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-danger/20 text-danger border border-danger/40">
                  PRD
                </span>
              )}
            </div>
            <p className="text-[10px] text-content-subtle font-mono mt-0.5 truncate">
              {res.resource_key} {res.sid ? `(${res.sid})` : ''}
            </p>
          </div>

          {/* Status Badge */}
          <span
            className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase ${
              isWrite
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : isRead
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-surface-sunken text-content-subtle border border-line'
            }`}
          >
            {isWrite ? 'Read + Write' : isRead ? 'Read-Only' : 'Tolak'}
          </span>
        </div>

        {/* Toggles */}
        {!isSuper ? (
          <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-line/60">
            <button
              type="button"
              onClick={() => handleRoleToggle(role, res.resource_key, 'allowed')}
              className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                isRead
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-surface-sunken text-content-subtle border-line hover:text-content'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{isRead ? 'Baca: ON' : 'Baca: OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleToggle(role, res.resource_key, 'can_write')}
              className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                isWrite
                  ? isProd
                    ? 'bg-danger/25 text-danger border-danger/50 font-black'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-surface-sunken text-content-subtle border-line hover:text-content'
              }`}
            >
              <PenTool className="w-3 h-3" />
              <span>{isWrite ? 'Tulis: ON' : 'Tulis: OFF'}</span>
            </button>
          </div>
        ) : (
          <div className="pt-2 mt-2 border-t border-line/40 text-center text-[10px] text-purple-300 font-semibold">
            Superadmin memiliki akses penuh permanen
          </div>
        )}
      </div>
    );
  }
}
