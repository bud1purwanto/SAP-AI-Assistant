import React, { useState, useEffect } from 'react';
import {
  UserCog,
  Plus,
  RefreshCw,
  Search,
  Edit3,
  Trash2,
  Lock,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
  Users,
  Code2,
  Gauge,
  Sliders,
  ChevronDown,
  Info,
  Copy,
  AlertTriangle,
  ArrowDown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import {
  ROLE_COLOR_MAP,
  ROLE_COLOR_OPTIONS,
  ROLE_ICON_OPTIONS,
  getRoleBadgeStyle,
  getRoleIconComponent,
  getRoleColorLabel,
  getRoleIconLabel,
} from '../lib/roles';

const DEFAULT_FORM = {
  code: '',
  label: '',
  description: '',
  color: 'zinc',
  icon: 'users',
  can_modify_program: false,
  enabled: true,
  sort_order: 100,
  daily_token_limit: 100000,
  per_minute_limit: 5,
};

export default function AdminRoles({ onRefreshRoles }) {
  const { isEn } = useLanguage();

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'system' | 'custom'

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [cloneForm, setCloneForm] = useState({ code: '', label: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [impactModal, setImpactModal] = useState(null); // { role, nextStatus, loading, impact }

  const fetchRoles = async () => {
    setLoading(true);
    setActionError('');
    try {
      const data = await api.adminRoles();
      setRoles(Array.isArray(data) ? data : []);
      if (onRefreshRoles) onRefreshRoles();
    } catch (err) {
      console.error('Gagal mengambil daftar peran:', err);
      setActionError(err.message || (isEn ? 'Failed to fetch roles' : 'Gagal mengambil data peran'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      ...DEFAULT_FORM,
      sort_order: (roles.length + 1) * 10,
    });
    setActionError('');
    setActionSuccess('');
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (role) => {
    setSelectedRole(role);
    setFormData({
      code: role.code,
      label: role.label,
      description: role.description || '',
      color: role.color || 'zinc',
      icon: role.icon || 'users',
      can_modify_program: Boolean(role.can_modify_program),
      enabled: Boolean(role.enabled),
      sort_order: role.sort_order ?? 100,
    });
    setActionError('');
    setActionSuccess('');
    setIsEditOpen(true);
  };

  const handleOpenDelete = (role) => {
    setSelectedRole(role);
    setActionError('');
    setActionSuccess('');
    setIsDeleteOpen(true);
  };

  const handleOpenClone = (role) => {
    setSelectedRole(role);
    setCloneForm({
      code: '',
      label: `${role.label} (Copy)`,
      description: role.description || '',
    });
    setActionError('');
    setActionSuccess('');
    setIsCloneOpen(true);
  };

  const handleCloneSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRole) return;
    setActionError('');
    setSubmitting(true);

    const cleanCode = (cloneForm.code || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(cleanCode)) {
      setActionError(
        isEn
          ? 'Role code must be 2-40 characters, lowercase letters, numbers, and underscores only.'
          : 'Kode peran wajib 2-40 karakter, hanya huruf kecil, angka, dan garis bawah (_).'
      );
      setSubmitting(false);
      return;
    }
    if (!cloneForm.label.trim()) {
      setActionError(isEn ? 'Role label is required.' : 'Label peran wajib diisi.');
      setSubmitting(false);
      return;
    }

    try {
      await api.adminCloneRole(selectedRole.code, {
        code: cleanCode,
        label: cloneForm.label.trim(),
        description: cloneForm.description.trim(),
      });

      setActionSuccess(
        isEn
          ? `Role '${cleanCode}' created as a copy of '${selectedRole.code}', including its MCP resource and chat mode permissions.`
          : `Peran '${cleanCode}' berhasil dibuat sebagai salinan '${selectedRole.code}', lengkap dengan izin resource MCP dan mode chatnya.`
      );
      setIsCloneOpen(false);
      fetchRoles();
    } catch (err) {
      setActionError(err.message || (isEn ? 'Failed to clone role' : 'Gagal mengkloning peran'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setActionError('');
    setSubmitting(true);

    const cleanCode = (formData.code || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(cleanCode)) {
      setActionError(
        isEn
          ? 'Role code must be 2-40 characters, lowercase letters, numbers, and underscores only.'
          : 'Kode peran wajib 2-40 karakter, hanya huruf kecil, angka, dan garis bawah (_).'
      );
      setSubmitting(false);
      return;
    }

    if (!formData.label.trim()) {
      setActionError(isEn ? 'Role label is required.' : 'Label peran wajib diisi.');
      setSubmitting(false);
      return;
    }

    try {
      await api.adminCreateRole({
        code: cleanCode,
        label: formData.label.trim(),
        description: formData.description.trim(),
        color: formData.color,
        icon: formData.icon,
        can_modify_program: formData.can_modify_program,
        enabled: formData.enabled,
        sort_order: Number(formData.sort_order) || 100,
        daily_token_limit: Number(formData.daily_token_limit) || 100000,
        per_minute_limit: Number(formData.per_minute_limit) || 5,
      });

      setActionSuccess(
        isEn
          ? `Role '${cleanCode}' created successfully with least-privilege defaults.`
          : `Peran '${cleanCode}' berhasil dibuat dengan perizinan default-deny.`
      );
      setIsCreateOpen(false);
      fetchRoles();
    } catch (err) {
      setActionError(err.message || (isEn ? 'Failed to create role' : 'Gagal membuat peran'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRole) return;
    setActionError('');
    setSubmitting(true);

    try {
      await api.adminUpdateRole(selectedRole.code, {
        label: formData.label.trim(),
        description: formData.description.trim(),
        color: formData.color,
        icon: formData.icon,
        can_modify_program: formData.can_modify_program,
        enabled: formData.enabled,
        sort_order: Number(formData.sort_order) || 100,
      });

      setActionSuccess(
        isEn ? `Role '${selectedRole.code}' updated successfully.` : `Peran '${selectedRole.code}' berhasil diperbarui.`
      );
      setIsEditOpen(false);
      fetchRoles();
    } catch (err) {
      setActionError(err.message || (isEn ? 'Failed to update role' : 'Gagal memperbarui peran'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!selectedRole) return;
    setActionError('');
    setSubmitting(true);

    try {
      await api.adminDeleteRole(selectedRole.code);
      setActionSuccess(
        isEn ? `Role '${selectedRole.code}' deleted successfully.` : `Peran '${selectedRole.code}' berhasil dihapus.`
      );
      setIsDeleteOpen(false);
      fetchRoles();
    } catch (err) {
      setActionError(err.message || (isEn ? 'Failed to delete role' : 'Gagal menghapus peran'));
    } finally {
      setSubmitting(false);
    }
  };

  const applyRoleFlag = async (role, field, nextValue) => {
    try {
      await api.adminUpdateRole(role.code, { [field]: nextValue });
      setRoles((prev) => prev.map((r) => (r.code === role.code ? { ...r, [field]: nextValue } : r)));
      if (onRefreshRoles) onRefreshRoles();
    } catch (err) {
      setActionError(err.message || (isEn ? 'Failed to update role status' : 'Gagal mengubah status peran'));
    }
  };

  // 'enabled' hanya soal boleh-tidaknya peran ini DIPILIH untuk user baru (dropdown
  // form tambah/ubah user). Pemegang yang sudah ada TIDAK terpengaruh sama sekali,
  // jadi tidak perlu pratinjau dampak.
  const handleToggleEnabled = (role) => {
    if (role.is_system) return;
    applyRoleFlag(role, 'enabled', !role.enabled);
  };

  // 'suspended' mencabut izin peran ini dari SELURUH pemegangnya saat ini juga --
  // ini aksi berdampak nyata, jadi tampilkan pratinjau dulu sebelum benar-benar
  // dieksekusi (mengaktifkan kembali/un-suspend tidak butuh konfirmasi).
  const handleToggleSuspended = async (role) => {
    if (role.is_system) return;
    const nextSuspended = !role.suspended;

    if (nextSuspended && role.user_count > 0) {
      setImpactModal({ role, field: 'suspended', nextValue: nextSuspended, loading: true, impact: null });
      try {
        const impact = await api.adminRoleImpact(role.code);
        setImpactModal({ role, field: 'suspended', nextValue: nextSuspended, loading: false, impact });
      } catch (err) {
        setImpactModal(null);
        setActionError(err.message || (isEn ? 'Failed to load impact preview' : 'Gagal memuat pratinjau dampak'));
      }
      return;
    }

    applyRoleFlag(role, 'suspended', nextSuspended);
  };

  const confirmImpactModal = async () => {
    if (!impactModal) return;
    await applyRoleFlag(impactModal.role, impactModal.field, impactModal.nextValue);
    setImpactModal(null);
  };

  // Filtered roles
  const filteredRoles = roles.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      r.code.toLowerCase().includes(q) ||
      (r.label || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q);

    if (!matchQuery) return false;
    if (filterType === 'system') return r.is_system;
    if (filterType === 'custom') return !r.is_system;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="text-rose-400/80 hover:text-rose-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-start gap-2 animate-fadeIn">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess('')}
            className="text-emerald-400/80 hover:text-emerald-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-line/80 rounded-2xl p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-content font-display tracking-tight flex items-center gap-2">
              <UserCog className="w-5 h-5 text-accent" />
              {isEn ? 'Master Roles Management' : 'Master Data Peran & Otoritas'}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent font-mono font-bold">
              {roles.length} {isEn ? 'Roles' : 'Peran'}
            </span>
          </div>
          <p className="text-xs text-content-muted mt-1">
            {isEn
              ? 'Manage dynamic system & custom roles, mutation permissions, and user distribution.'
              : 'Kelola peran dinamis, hak mutasi program SAP, kuota default, dan perizinan sistem.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={fetchRoles}
            disabled={loading}
            className="p-2 rounded-xl bg-surface-raised border border-line hover:bg-surface-hover active:scale-95 text-content-muted hover:text-content transition-all cursor-pointer shadow-2xs"
            title={isEn ? 'Refresh' : 'Muat Ulang'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-hover active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isEn ? 'Add Role' : 'Tambah Peran'}
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search code, label, description...' : 'Cari kode, label, deskripsi...'}
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-content placeholder:text-content-subtle focus:border-accent focus:outline-hidden transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-subtle hover:text-content"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-xl border border-line/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-surface text-content shadow-2xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            {isEn ? 'All' : 'Semua'} ({roles.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('system')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              filterType === 'system'
                ? 'bg-surface text-content shadow-2xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            {isEn ? 'System' : 'Sistem'} ({roles.filter((r) => r.is_system).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('custom')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              filterType === 'custom'
                ? 'bg-surface text-content shadow-2xs'
                : 'text-content-muted hover:text-content'
            }`}
          >
            {isEn ? 'Custom' : 'Kustom'} ({roles.filter((r) => !r.is_system).length})
          </button>
        </div>
      </div>

      {/* Roles List */}
      <div className="bg-surface border border-line/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-sunken/50 text-[11px] font-bold text-content-subtle uppercase tracking-wider">
                <th className="py-3 px-4">{isEn ? 'Role & Code' : 'Peran & Kode'}</th>
                <th className="py-3 px-4">{isEn ? 'Description' : 'Deskripsi'}</th>
                <th className="py-3 px-3 text-center">
                  <div className="inline-flex items-center gap-1 justify-center">
                    <span>{isEn ? 'SAP Program Mutation' : 'Mutasi Program SAP'}</span>
                    <span
                      title={
                        isEn
                          ? 'Controls permission to create, edit, activate ABAP programs, repository objects, and transport requests in SAP.'
                          : 'Hak akses untuk membuat, mengubah, mengaktifkan program/kode ABAP, dan transport request di SAP.'
                      }
                      className="cursor-help text-content-subtle hover:text-accent transition-colors"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </th>
                <th className="py-3 px-3 text-center">{isEn ? 'Users' : 'Pengguna'}</th>
                <th className="py-3 px-3 text-center">{isEn ? 'Type' : 'Tipe'}</th>
                <th className="py-3 px-3 text-center">{isEn ? 'Status' : 'Status'}</th>
                <th className="py-3 px-4 text-right">{isEn ? 'Actions' : 'Aksi'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-content-muted">
                    <UserCog className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">
                      {isEn ? 'No roles match your search.' : 'Tidak ada peran yang cocok.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRoles.map((role) => {
                  const IconComp = getRoleIconComponent(role.icon);
                  const badgeStyle = getRoleBadgeStyle(role.color);
                  const colorProps = ROLE_COLOR_MAP[role.color] || ROLE_COLOR_MAP.zinc;

                  return (
                    <tr
                      key={role.code}
                      className="hover:bg-surface-hover/50 transition-colors group"
                    >
                      {/* Code & Label */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${colorProps.bg} ${colorProps.text} ${colorProps.border}`}
                          >
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-content text-xs">
                              <span>{role.label}</span>
                            </div>
                            <span className="font-mono text-[11px] text-content-subtle">
                              {role.code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-3 px-4 max-w-xs text-content-muted text-xs truncate">
                        {role.description || (
                          <span className="text-content-subtle/50 italic">
                            {isEn ? 'No description' : 'Tanpa deskripsi'}
                          </span>
                        )}
                      </td>

                      {/* Modify Program Permission */}
                      <td className="py-3 px-3 text-center">
                        {role.can_modify_program ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-help"
                            title={
                              isEn
                                ? 'Full access: Can create, edit, delete, and activate ABAP code/objects in SAP.'
                                : 'Izin Penuh: Berhak membuat, mengubah, menghapus, dan mengaktifkan program/kode ABAP di SAP.'
                            }
                          >
                            <Code2 className="w-3 h-3" />
                            {isEn ? 'Can Modify' : 'Boleh Ubah'}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-sunken text-content-subtle border border-line cursor-help"
                            title={
                              isEn
                                ? 'Read-only: Can only inspect/read ABAP programs, tables, and dictionary structures in SAP.'
                                : 'Hanya Baca: Hanya berhak membaca/melihat kode program ABAP dan struktur tabel di SAP.'
                            }
                          >
                            {isEn ? 'Read Only' : 'Hanya Baca'}
                          </span>
                        )}
                      </td>

                      {/* User Count */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold ${
                            role.user_count > 0
                              ? 'bg-accent-soft text-accent border border-accent/20'
                              : 'bg-surface-sunken text-content-subtle border border-line'
                          }`}
                          title={`${role.user_count} ${isEn ? 'users assigned' : 'pengguna terdaftar'}`}
                        >
                          <Users className="w-3 h-3" />
                          {role.user_count || 0}
                        </span>
                      </td>

                      {/* Type (System vs Custom) */}
                      <td className="py-3 px-3 text-center">
                        {role.is_system ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Lock className="w-3 h-3" />
                            {isEn ? 'System' : 'Sistem'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-sunken text-content-subtle border border-line">
                            {isEn ? 'Custom' : 'Kustom'}
                          </span>
                        )}
                      </td>

                      {/* Status: dua toggle independen -- Enabled (boleh dipilih untuk user
                          baru) dan Suspended (mencabut izin dari pemegang saat ini) */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-semibold text-content-subtle w-14 text-right">
                              {isEn ? 'Assignable' : 'Bisa Dipilih'}
                            </span>
                            <button
                              type="button"
                              disabled={role.is_system}
                              onClick={() => handleToggleEnabled(role)}
                              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                role.enabled ? 'bg-emerald-500' : 'bg-surface-sunken'
                              } ${role.is_system ? 'opacity-60 cursor-not-allowed' : ''}`}
                              title={
                                role.is_system
                                  ? isEn
                                    ? 'System roles cannot be disabled'
                                    : 'Peran sistem tidak dapat dinonaktifkan'
                                  : role.enabled
                                  ? isEn
                                    ? 'Shown when assigning roles to users (click to hide from new assignments; current holders unaffected)'
                                    : 'Muncul saat menetapkan peran ke user (klik untuk sembunyikan dari penetapan baru; pemegang saat ini tidak terpengaruh)'
                                  : isEn
                                  ? 'Hidden from new assignments (click to make assignable again)'
                                  : 'Disembunyikan dari penetapan baru (klik untuk tampilkan lagi)'
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  role.enabled ? 'translate-x-3' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-semibold text-content-subtle w-14 text-right">
                              {isEn ? 'Suspended' : 'Disuspend'}
                            </span>
                            <button
                              type="button"
                              disabled={role.is_system}
                              onClick={() => handleToggleSuspended(role)}
                              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                role.suspended ? 'bg-rose-500' : 'bg-surface-sunken'
                              } ${role.is_system ? 'opacity-60 cursor-not-allowed' : ''}`}
                              title={
                                role.is_system
                                  ? isEn
                                    ? 'System roles cannot be suspended'
                                    : 'Peran sistem tidak dapat disuspend'
                                  : role.suspended
                                  ? isEn
                                    ? "Access revoked for all current holders (click to restore)"
                                    : 'Akses dicabut dari seluruh pemegang saat ini (klik untuk pulihkan)'
                                  : isEn
                                  ? "Click to revoke this role's access from all current holders immediately"
                                  : 'Klik untuk mencabut akses peran ini dari seluruh pemegangnya seketika'
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  role.suspended ? 'translate-x-3' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenClone(role)}
                            className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-colors cursor-pointer"
                            title={
                              isEn
                                ? 'Clone Role (copy permissions to a new role)'
                                : 'Kloning Peran (salin izin ke peran baru)'
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(role)}
                            className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-colors cursor-pointer"
                            title={isEn ? 'Edit Role' : 'Ubah Peran'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={role.is_system || role.user_count > 0}
                            onClick={() => handleOpenDelete(role)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              role.is_system || role.user_count > 0
                                ? 'text-content-subtle/30 cursor-not-allowed'
                                : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/20'
                            }`}
                            title={
                              role.is_system
                                ? isEn
                                  ? 'System roles cannot be deleted'
                                  : 'Peran sistem tidak dapat dihapus'
                                : role.user_count > 0
                                ? isEn
                                  ? `Cannot delete: ${role.user_count} user(s) assigned`
                                  : `Tidak dapat dihapus: ${role.user_count} pengguna masih menggunakannya`
                                : isEn
                                ? 'Delete Role'
                                : 'Hapus Peran'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                  <UserCog className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content">
                    {isEn ? 'Create New Master Role' : 'Tambah Peran Baru'}
                  </h3>
                  <p className="text-xs text-content-muted">
                    {isEn ? 'Configure role details, mutation rights, and default quotas' : 'Atur detail peran, hak mutasi, dan kuota awal'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              {/* Code */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Role Code' : 'Kode Peran'} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                  }
                  placeholder="e.g. sap_auditor"
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs font-mono text-content focus:border-accent focus:outline-hidden"
                />
                <p className="text-[10px] text-content-subtle mt-0.5">
                  {isEn
                    ? 'Unique identifier (2-40 chars, lowercase, digits, and underscores only).'
                    : 'Pengenal unik (2-40 karakter, huruf kecil, angka, dan underscore saja).'}
                </p>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Display Label' : 'Label Tampilan'} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g. SAP Auditor"
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Description' : 'Deskripsi'}
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={isEn ? 'Brief description of duties and scope...' : 'Deskripsi tugas dan cakupan peran ini...'}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Color & Icon Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content mb-1">
                    {isEn ? 'Badge Color' : 'Warna Badge'}
                  </label>
                  <select
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden cursor-pointer"
                  >
                    {ROLE_COLOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {getRoleColorLabel(opt.value, isEn)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content mb-1">
                    {isEn ? 'Icon' : 'Ikon'}
                  </label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden cursor-pointer"
                  >
                    {ROLE_ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {getRoleIconLabel(opt.value, isEn)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modify Program Checkbox */}
              <div className="p-3 bg-surface-sunken/60 border border-line/80 rounded-xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_modify_program}
                    onChange={(e) => setFormData({ ...formData, can_modify_program: e.target.checked })}
                    className="mt-0.5 rounded border-line text-accent focus:ring-accent"
                  />
                  <div>
                    <span className="text-xs font-bold text-content flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-accent" />
                      {isEn ? 'Allow Program Mutation (can_modify_program)' : 'Izinkan Mutasi Program SAP'}
                    </span>
                    <p className="text-[11px] text-content-muted mt-0.5">
                      {isEn
                        ? 'Permits invoking destructive or modifying SAP tools (transport, activate, write, insert, delete).'
                        : 'Mengizinkan eksekusi tool SAP yang mengubah data atau kode (transport, activate, write, update, delete).'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Initial Quota Section */}
              <div className="p-3 bg-surface-sunken/40 border border-line/60 rounded-xl space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-content">
                  <Gauge className="w-3.5 h-3.5 text-accent" />
                  {isEn ? 'Initial Token Quota' : 'Inisialisasi Kuota Token'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-content-muted mb-1">
                      {isEn ? 'Daily Token Limit' : 'Batas Token Harian'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.daily_token_limit}
                      onChange={(e) => setFormData({ ...formData, daily_token_limit: Number(e.target.value) })}
                      className="w-full bg-surface-raised border border-line rounded-lg px-2.5 py-1.5 text-xs font-mono text-content focus:border-accent focus:outline-hidden"
                    />
                    <span className="text-[10px] text-content-subtle">0 = {isEn ? 'unlimited' : 'tanpa batas'}</span>
                  </div>

                  <div>
                    <label className="block text-[11px] text-content-muted mb-1">
                      {isEn ? 'Req / Minute' : 'Req / Menit'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.per_minute_limit}
                      onChange={(e) => setFormData({ ...formData, per_minute_limit: Number(e.target.value) })}
                      className="w-full bg-surface-raised border border-line rounded-lg px-2.5 py-1.5 text-xs font-mono text-content focus:border-accent focus:outline-hidden"
                    />
                    <span className="text-[10px] text-content-subtle">0 = {isEn ? 'unlimited' : 'tanpa batas'}</span>
                  </div>
                </div>
              </div>

              {/* Least Privilege Notice */}
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl text-[11px] text-blue-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'New roles start with default-deny on all LLM chat modes and MCP resources. Configure permissions in Chat Modes and MCP Access tabs.'
                    : 'Peran baru dibuat dengan izin default-deny untuk seluruh mode chat dan resource MCP. Atur izin di tab Mode Chat dan MCP Access.'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
                >
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? (isEn ? 'Creating...' : 'Menyimpan...') : isEn ? 'Create Role' : 'Simpan Peran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditOpen && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content">
                    {isEn ? 'Edit Role' : 'Ubah Peran'}:{' '}
                    <span className="font-mono text-accent">{selectedRole.code}</span>
                  </h3>
                  <p className="text-xs text-content-muted">
                    {selectedRole.is_system
                      ? isEn
                        ? 'System role metadata editing'
                        : 'Pengaturan metadata peran sistem'
                      : isEn
                      ? 'Modify role attributes and status'
                      : 'Ubah atribut dan status peran'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              {/* Code (Read-Only) */}
              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">
                  {isEn ? 'Role Code (Immutable)' : 'Kode Peran (Tetap)'}
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedRole.code}
                  className="w-full bg-surface-sunken border border-line/60 rounded-lg px-3 py-2 text-xs font-mono text-content-subtle cursor-not-allowed"
                />
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Display Label' : 'Label Tampilan'} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Description' : 'Deskripsi'}
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Color & Icon Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content mb-1">
                    {isEn ? 'Badge Color' : 'Warna Badge'}
                  </label>
                  <select
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden cursor-pointer"
                  >
                    {ROLE_COLOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {getRoleColorLabel(opt.value, isEn)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-content mb-1">
                    {isEn ? 'Icon' : 'Ikon'}
                  </label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden cursor-pointer"
                  >
                    {ROLE_ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {getRoleIconLabel(opt.value, isEn)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Sort Order' : 'Urutan Tampilan'}
                </label>
                <input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs font-mono text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              {/* Modify Program Checkbox */}
              <div className="p-3 bg-surface-sunken/60 border border-line/80 rounded-xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.can_modify_program}
                    onChange={(e) => setFormData({ ...formData, can_modify_program: e.target.checked })}
                    className="mt-0.5 rounded border-line text-accent focus:ring-accent"
                  />
                  <div>
                    <span className="text-xs font-bold text-content flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-accent" />
                      {isEn ? 'Allow Program Mutation (can_modify_program)' : 'Izinkan Mutasi Program SAP'}
                    </span>
                    <p className="text-[11px] text-content-muted mt-0.5">
                      {isEn
                        ? 'Permits invoking destructive or modifying SAP tools.'
                        : 'Mengizinkan eksekusi tool SAP yang mengubah data atau kode.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* System Role Alert */}
              {selectedRole.is_system && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-[11px] text-amber-400 flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {isEn
                      ? 'This is a system role. It cannot be disabled or deleted.'
                      : 'Ini adalah peran sistem bawaan. Peran ini tidak dapat dinonaktifkan atau dihapus.'}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
                >
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? (isEn ? 'Saving...' : 'Menyimpan...') : isEn ? 'Save Changes' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteOpen && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-content">
                  {isEn ? 'Delete Role' : 'Hapus Peran'}:{' '}
                  <span className="font-mono text-rose-400">{selectedRole.code}</span>
                </h3>
                <p className="text-xs text-content-muted">
                  {isEn ? 'Confirm role removal from the system' : 'Konfirmasi penghapusan peran dari sistem'}
                </p>
              </div>
            </div>

            {selectedRole.is_system ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-400 flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'System roles are essential for application stability and cannot be deleted.'
                    : 'Peran sistem dilindungi demi stabilitas aplikasi dan tidak dapat dihapus.'}
                </span>
              </div>
            ) : selectedRole.user_count > 0 ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? `Cannot delete this role because it is currently assigned to ${selectedRole.user_count} user(s). Reassign those users first.`
                    : `Tidak dapat menghapus peran ini karena masih digunakan oleh ${selectedRole.user_count} pengguna. Pindahkan peran pengguna tersebut terlebih dahulu.`}
                </span>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-content-muted">
                <p>
                  {isEn
                    ? `Are you sure you want to permanently delete role '${selectedRole.label}' (${selectedRole.code})?`
                    : `Apakah Anda yakin ingin menghapus peran '${selectedRole.label}' (${selectedRole.code}) secara permanen?`}
                </p>
                <p className="text-[11px] text-content-subtle">
                  {isEn
                    ? 'Associated quota limits and role mode permissions will be cleaned up automatically.'
                    : 'Batas kuota dan matriks izin mode yang terkait akan dibersihkan secara otomatis.'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
              >
                {isEn ? 'Cancel' : 'Batal'}
              </button>
              {!selectedRole.is_system && selectedRole.user_count === 0 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDeleteSubmit}
                  className="px-4 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? (isEn ? 'Deleting...' : 'Menghapus...') : isEn ? 'Delete Permanently' : 'Hapus Permanen'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLONE MODAL */}
      {isCloneOpen && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content">
                    {isEn ? 'Clone Role' : 'Kloning Peran'}:{' '}
                    <span className="font-mono text-accent">{selectedRole.code}</span>
                  </h3>
                  <p className="text-xs text-content-muted">
                    {isEn
                      ? 'Create a new role starting from this one’s permissions'
                      : 'Buat peran baru dimulai dari izin peran ini'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCloneOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloneSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'New Role Code' : 'Kode Peran Baru'} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={cloneForm.code}
                  onChange={(e) =>
                    setCloneForm({ ...cloneForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                  }
                  placeholder={`${selectedRole.code}_v2`}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs font-mono text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Display Label' : 'Label Tampilan'} <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cloneForm.label}
                  onChange={(e) => setCloneForm({ ...cloneForm, label: e.target.value })}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content mb-1">
                  {isEn ? 'Description' : 'Deskripsi'}
                </label>
                <textarea
                  rows={2}
                  value={cloneForm.description}
                  onChange={(e) => setCloneForm({ ...cloneForm, description: e.target.value })}
                  className="w-full bg-surface-raised border border-line rounded-lg px-3 py-2 text-xs text-content focus:border-accent focus:outline-hidden"
                />
              </div>

              <div className="p-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl text-[11px] text-blue-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? `This new role will start with the exact same MCP resource access and chat mode permissions as '${selectedRole.label}'. Badge color, icon, program mutation right, and token quota are also copied — adjust anything afterwards in Edit Role.`
                    : `Peran baru ini akan memulai dengan izin resource MCP dan mode chat yang persis sama dengan '${selectedRole.label}'. Warna badge, ikon, hak mutasi program, dan kuota token juga disalin — sesuaikan lagi lewat Ubah Peran bila perlu.`}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsCloneOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
                >
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all disabled:opacity-50"
                >
                  {submitting ? (isEn ? 'Cloning...' : 'Mengkloning...') : isEn ? 'Clone Role' : 'Kloning Peran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPACT PREVIEW MODAL (before suspending a role still in use) */}
      {impactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-content">
                  {isEn ? 'Suspend Role' : 'Suspend Peran'}:{' '}
                  <span className="font-mono text-rose-400">{impactModal.role.code}</span>
                </h3>
                <p className="text-xs text-content-muted">
                  {isEn ? 'Review who and what this affects before confirming' : 'Tinjau siapa dan apa yang terdampak sebelum konfirmasi'}
                </p>
              </div>
            </div>

            {impactModal.loading ? (
              <div className="py-6 text-center text-xs text-content-muted">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
                {isEn ? 'Loading impact preview...' : 'Memuat pratinjau dampak...'}
              </div>
            ) : (
              <>
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-400 flex items-start gap-2">
                  <ArrowDown className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {isEn
                      ? "Disabling does not lock users out — everyone below falls back to 'Standard User' permissions immediately."
                      : "Menonaktifkan TIDAK memblokir user — semua user di bawah ini otomatis turun ke hak akses 'Standard User' seketika."}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-surface-sunken border border-line/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-content">{impactModal.impact?.resource_count ?? 0}</p>
                    <p className="text-[10px] text-content-muted">
                      {isEn ? 'MCP resources allowed' : 'Izin resource MCP'}
                    </p>
                  </div>
                  <div className="p-2.5 bg-surface-sunken border border-line/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-content">{impactModal.impact?.mode_count ?? 0}</p>
                    <p className="text-[10px] text-content-muted">
                      {isEn ? 'Chat modes allowed' : 'Izin mode chat'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-content mb-1.5">
                    {isEn ? 'Affected users' : 'Pengguna terdampak'} ({(impactModal.impact?.affected_users || []).length})
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-line/60 divide-y divide-line/40">
                    {(impactModal.impact?.affected_users || []).map((u) => (
                      <div key={u.username} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-content">{u.full_name || u.username}</span>
                        {u.only_role && (
                          <span
                            className="text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded"
                            title={
                              isEn
                                ? 'This is their only role — they lose all elevated access.'
                                : 'Ini satu-satunya peran mereka — mereka kehilangan seluruh hak akses tambahan.'
                            }
                          >
                            {isEn ? 'only role' : 'satu-satunya peran'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setImpactModal(null)}
                className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors"
              >
                {isEn ? 'Cancel' : 'Batal'}
              </button>
              <button
                type="button"
                disabled={impactModal.loading}
                onClick={confirmImpactModal}
                className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-50"
              >
                {isEn ? 'Disable Role' : 'Nonaktifkan Peran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

