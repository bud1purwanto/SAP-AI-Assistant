import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Search,
  Edit3,
  Trash2,
  Check,
  X,
  Shield,
  Users,
  Tag,
  Sparkles,
  AlertTriangle,
  Info,
  ToggleLeft,
  ToggleRight,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const DEFAULT_FORM = {
  code: '',
  name: '',
  description: '',
  assistant_persona: '',
  rag_allowed_tags: 'ALL',
  enabled: true,
  sort_order: 10,
};

export default function AdminDivisions({ onRefreshDivisions }) {
  const { t, isEn, language } = useLanguage();

  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Persona detail view modal
  const [previewPersona, setPreviewPersona] = useState(null);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    division: null,
    impactLoading: false,
    impactCount: 0,
    deleting: false,
  });

  const fetchDivisions = async () => {
    setLoading(true);
    setActionError('');
    try {
      const data = await api.adminDivisions();
      const list = Array.isArray(data) ? data : [];
      setDivisions(list);
      if (onRefreshDivisions) {
        onRefreshDivisions();
      }
    } catch (err) {
      console.error('Failed to fetch divisions:', err);
      setActionError(err.message || (isEn ? 'Failed to fetch divisions' : 'Gagal memuat data divisi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDivisions();
  }, []);

  const filteredDivisions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return divisions;
    return divisions.filter((d) => {
      const code = (d.code || '').toLowerCase();
      const name = (d.name || '').toLowerCase();
      const desc = (d.description || '').toLowerCase();
      const tags = (d.rag_allowed_tags || '').toLowerCase();
      return code.includes(q) || name.includes(q) || desc.includes(q) || tags.includes(q);
    });
  }, [divisions, searchQuery]);

  const activeCount = useMemo(() => divisions.filter((d) => d.enabled).length, [divisions]);
  const totalAssignedUsers = useMemo(
    () => divisions.reduce((sum, d) => sum + (Number(d.user_count) || 0), 0),
    [divisions]
  );

  const handleOpenCreate = () => {
    setFormData({
      ...DEFAULT_FORM,
      sort_order: (divisions.length + 1) * 10,
    });
    setIsEditing(false);
    setIsModalOpen(true);
    setActionError('');
  };

  const handleOpenEdit = (div) => {
    setFormData({
      code: div.code,
      name: div.name,
      description: div.description || '',
      assistant_persona: div.assistant_persona || '',
      rag_allowed_tags: div.rag_allowed_tags || 'ALL',
      enabled: div.enabled !== false,
      sort_order: div.sort_order ?? 100,
    });
    setIsEditing(true);
    setIsModalOpen(true);
    setActionError('');
  };

  const handleSaveDivision = async (e) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');
    setSubmitting(true);

    const cleanCode = (formData.code || '').trim().toUpperCase();
    if (!cleanCode) {
      setActionError(isEn ? 'Division code is required.' : 'Kode divisi wajib diisi.');
      setSubmitting(false);
      return;
    }
    if (!formData.name.trim()) {
      setActionError(isEn ? 'Division name is required.' : 'Nama divisi wajib diisi.');
      setSubmitting(false);
      return;
    }

    try {
      if (isEditing) {
        await api.adminUpdateDivision(cleanCode, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          assistant_persona: formData.assistant_persona.trim(),
          rag_allowed_tags: formData.rag_allowed_tags.trim() || 'ALL',
          enabled: formData.enabled,
          sort_order: Number(formData.sort_order) || 10,
        });
        setActionSuccess(
          isEn
            ? `Division '${cleanCode}' updated successfully.`
            : `Divisi '${cleanCode}' berhasil diperbarui.`
        );
      } else {
        await api.adminCreateDivision({
          code: cleanCode,
          name: formData.name.trim(),
          description: formData.description.trim(),
          assistant_persona: formData.assistant_persona.trim(),
          rag_allowed_tags: formData.rag_allowed_tags.trim() || 'ALL',
          enabled: formData.enabled,
          sort_order: Number(formData.sort_order) || 10,
        });
        setActionSuccess(
          isEn
            ? `Division '${cleanCode}' created successfully.`
            : `Divisi '${cleanCode}' berhasil ditambahkan.`
        );
      }
      setIsModalOpen(false);
      await fetchDivisions();
    } catch (err) {
      console.error('Save division error:', err);
      setActionError(err.message || (isEn ? 'Failed to save division.' : 'Gagal menyimpan divisi.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (div) => {
    try {
      const nextState = !div.enabled;
      await api.adminUpdateDivision(div.code, { enabled: nextState });
      setDivisions((prev) =>
        prev.map((d) => (d.code === div.code ? { ...d, enabled: nextState } : d))
      );
      setActionSuccess(
        isEn
          ? `Division '${div.code}' ${nextState ? 'enabled' : 'disabled'}.`
          : `Divisi '${div.code}' berhasil ${nextState ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
      if (onRefreshDivisions) onRefreshDivisions();
    } catch (err) {
      setActionError(
        err.message || (isEn ? 'Failed to update division status.' : 'Gagal mengubah status divisi.')
      );
    }
  };

  const handleOpenDelete = async (div) => {
    setDeleteModal({
      isOpen: true,
      division: div,
      impactLoading: true,
      impactCount: div.user_count || 0,
      deleting: false,
    });

    try {
      const impact = await api.adminDivisionImpact(div.code);
      setDeleteModal((prev) => ({
        ...prev,
        impactLoading: false,
        impactCount: impact.user_count ?? impact.affected_users_count ?? (div.user_count || 0),
      }));
    } catch (err) {
      console.warn('Failed to load division impact:', err);
      setDeleteModal((prev) => ({ ...prev, impactLoading: false }));
    }
  };

  const handleConfirmDelete = async () => {
    const div = deleteModal.division;
    if (!div) return;

    setDeleteModal((prev) => ({ ...prev, deleting: true }));
    setActionError('');
    setActionSuccess('');

    try {
      await api.adminDeleteDivision(div.code);
      setActionSuccess(
        isEn
          ? `Division '${div.code}' deleted successfully. Assigned users set to No Division.`
          : `Divisi '${div.code}' berhasil dihapus. Pengguna terkait telah dialihkan ke Tanpa Divisi.`
      );
      setDeleteModal({
        isOpen: false,
        division: null,
        impactLoading: false,
        impactCount: 0,
        deleting: false,
      });
      await fetchDivisions();
    } catch (err) {
      console.error('Delete division error:', err);
      setActionError(err.message || (isEn ? 'Failed to delete division.' : 'Gagal menghapus divisi.'));
      setDeleteModal((prev) => ({ ...prev, deleting: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Alert Notifications */}
      {actionError && (
        <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs sm:text-sm animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionError}</div>
          <button
            onClick={() => setActionError('')}
            className="p-1 hover:bg-rose-500/10 rounded-lg text-rose-400 hover:text-rose-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs sm:text-sm animate-fadeIn">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionSuccess}</div>
          <button
            onClick={() => setActionSuccess('')}
            className="p-1 hover:bg-emerald-500/10 rounded-lg text-emerald-400 hover:text-emerald-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-surface border border-line shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-sky-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shadow-sm shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-content font-display flex items-center gap-2">
              {t('admin.divisionsTitle') || (isEn ? 'Divisions & Personas' : 'Master Divisi & Persona')}
              <span className="text-[10px] bg-accent-soft text-accent border border-accent/20 px-2 py-0.5 rounded-full font-mono font-bold">
                {divisions.length}
              </span>
            </h3>
            <p className="text-xs text-content-muted mt-0.5 max-w-xl">
              {t('admin.divisionsSubtitle') ||
                (isEn
                  ? 'Manage organizational divisions, AI persona prompts, and document access boundaries.'
                  : 'Kelola unit organisasi, layer persona AI divisi, dan batasan hak akses dokumen/RAG.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={fetchDivisions}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-content-muted hover:text-content bg-surface-raised hover:bg-surface-hover border border-line rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-xl shadow-sm shadow-indigo-500/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{t('admin.addDivision') || (isEn ? 'New Division' : 'Tambah Divisi')}</span>
          </button>
        </div>
      </div>

      {/* Persona & RAG Info Architecture Explainer */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-purple-500/5 border border-sky-500/20 text-xs text-content-muted space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-content text-[11px] sm:text-xs">
          <Sparkles className="w-4 h-4 text-sky-500" />
          <span>{isEn ? 'Division Persona & RAG Boundary Architecture' : 'Arsitektur Persona Divisi & Batasan RAG'}</span>
        </div>
        <p className="text-[11px] sm:text-xs text-content-secondary leading-relaxed">
          {isEn ? (
            <>
              <strong>3-Tier Persona Layering:</strong> Global Org Persona &rarr; <strong>Division Persona</strong> (domain tone & operational focus) &rarr; User Persona.
              Meanwhile, <strong>RAG Access Boundaries</strong> are strictly enforced by document tags (e.g. <code className="px-1 py-0.5 bg-surface rounded text-[10px] font-mono text-emerald-500">ALL, IT</code>), ensuring that persona alone does not act as the sole security boundary.
            </>
          ) : (
            <>
              <strong>Lapisan Persona 3 Tingkat:</strong> Persona Global &rarr; <strong>Persona Divisi</strong> (gaya bahasa & fokus operasional) &rarr; Persona User.
              Sementara <strong>Batasan Akses RAG</strong> ditegakkan ketat melalui tag dokumen (contoh: <code className="px-1 py-0.5 bg-surface rounded text-[10px] font-mono text-emerald-500">ALL, IT</code>) sehingga persona tidak menjadi satu-satunya pembatas dokumen.
            </>
          )}
        </p>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-surface rounded-xl border border-line">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              t('admin.divisionSearchPlaceholder') ||
              (isEn ? 'Search division by code, name, or description…' : 'Cari divisi berdasarkan kode, nama, atau deskripsi…')
            }
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-surface-sunken border border-line rounded-lg focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] sm:text-xs text-content-muted shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{isEn ? `${activeCount} Active` : `${activeCount} Aktif`}</span>
          </span>
          <span className="text-line">•</span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-accent" />
            <span>{isEn ? `${totalAssignedUsers} Users` : `${totalAssignedUsers} Pengguna`}</span>
          </span>
        </div>
      </div>

      {/* Divisions Table */}
      <div className="border border-line/80 rounded-2xl overflow-hidden shadow-xs bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-surface-sunken/70 border-b border-line/80 text-content-muted text-[10px] sm:text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
              <tr>
                <th className="px-4 py-3">{t('admin.divisionCode') || (isEn ? 'Code' : 'Kode')}</th>
                <th className="px-4 py-3">{t('admin.divisionName') || (isEn ? 'Name' : 'Nama')}</th>
                <th className="px-4 py-3">{t('admin.divisionDesc') || (isEn ? 'Description' : 'Deskripsi')}</th>
                <th className="px-4 py-3">{t('admin.divisionPersona') || (isEn ? 'Persona' : 'Persona')}</th>
                <th className="px-4 py-3">{t('admin.divisionRagScope') || (isEn ? 'RAG Scope' : 'Tag Dokumen')}</th>
                <th className="px-4 py-3 text-center">{t('admin.divisionUsersCount') || (isEn ? 'Users' : 'User')}</th>
                <th className="px-4 py-3 text-center">{t('admin.divisionStatus') || (isEn ? 'Status' : 'Status')}</th>
                <th className="px-4 py-3 text-right">{t('common.edit') || (isEn ? 'Actions' : 'Aksi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-content-secondary">
              {loading && divisions.length === 0 ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 w-16 bg-surface-sunken rounded-md" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-32 bg-surface-sunken/80 rounded-md" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-44 bg-surface-sunken/60 rounded-md" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-36 bg-surface-sunken/60 rounded-md" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-24 bg-surface-sunken/60 rounded-md" /></td>
                    <td className="px-4 py-3.5 text-center"><div className="h-5 w-8 bg-surface-sunken/50 rounded-md mx-auto" /></td>
                    <td className="px-4 py-3.5 text-center"><div className="h-5 w-12 bg-surface-sunken/50 rounded-md mx-auto" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="h-6 w-14 bg-surface-sunken/50 rounded-md ml-auto" /></td>
                  </tr>
                ))
              ) : filteredDivisions.length > 0 ? (
                filteredDivisions.map((div) => {
                  const tags = (div.rag_allowed_tags || 'ALL')
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);

                  return (
                    <tr key={div.code} className="hover:bg-surface-hover/70 transition-colors">
                      {/* Code */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            {div.code}
                          </span>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3 font-semibold text-content text-xs whitespace-nowrap sm:whitespace-normal">
                        {div.name}
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 text-xs text-content-muted max-w-xs truncate" title={div.description}>
                        {div.description || <span className="italic text-content-subtle">—</span>}
                      </td>

                      {/* Persona */}
                      <td className="px-4 py-3 text-xs text-content-muted max-w-xs">
                        {div.assistant_persona ? (
                          <button
                            type="button"
                            onClick={() => setPreviewPersona(div)}
                            className="text-left group flex items-center gap-1 hover:text-accent cursor-pointer transition-colors max-w-full"
                            title={isEn ? 'Click to inspect persona prompt' : 'Klik untuk melihat prompt persona'}
                          >
                            <span className="truncate max-w-[180px]">{div.assistant_persona}</span>
                            <Sparkles className="w-3 h-3 shrink-0 text-amber-500 opacity-70 group-hover:opacity-100" />
                          </button>
                        ) : (
                          <span className="italic text-content-subtle text-[11px]">
                            {isEn ? 'Standard Org Persona' : 'Persona Standar Org'}
                          </span>
                        )}
                      </td>

                      {/* RAG Allowed Tags */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                                tag.toUpperCase() === 'ALL'
                                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                              }`}
                            >
                              <Tag className="w-2.5 h-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Assigned Users Count */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold ${
                            div.user_count > 0
                              ? 'bg-accent-soft text-accent border border-accent/20'
                              : 'bg-surface-sunken text-content-subtle border border-line'
                          }`}
                          title={`${div.user_count || 0} ${isEn ? 'users assigned' : 'pengguna terdaftar'}`}
                        >
                          <Users className="w-3 h-3" />
                          {div.user_count || 0}
                        </span>
                      </td>

                      {/* Enabled Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(div)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-all ${
                            div.enabled
                              ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-surface-sunken text-content-subtle border-line opacity-70 hover:opacity-100'
                          }`}
                          title={isEn ? 'Click to toggle status' : 'Klik untuk mengubah status'}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              div.enabled ? 'bg-emerald-500' : 'bg-content-subtle'
                            }`}
                          />
                          <span>
                            {div.enabled
                              ? t('admin.divisionActive') || (isEn ? 'Active' : 'Aktif')
                              : t('admin.divisionInactive') || (isEn ? 'Inactive' : 'Nonaktif')}
                          </span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(div)}
                          className="p-1.5 text-content-subtle hover:text-accent hover:bg-surface-raised rounded-lg transition-colors cursor-pointer"
                          title={t('admin.editDivision') || (isEn ? 'Edit division' : 'Edit divisi')}
                          aria-label={`Edit division ${div.code}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenDelete(div)}
                          className="p-1.5 text-content-subtle hover:text-rose-500 hover:bg-surface-raised rounded-lg transition-colors cursor-pointer"
                          title={t('admin.deleteDivision') || (isEn ? 'Delete division' : 'Hapus divisi')}
                          aria-label={`Hapus division ${div.code}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-content-subtle">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-xs">
                      {searchQuery
                        ? isEn
                          ? 'No divisions match your search.'
                          : 'Tidak ada divisi yang cocok dengan pencarian.'
                        : isEn
                        ? 'No divisions created yet.'
                        : 'Belum ada divisi yang dibuat.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs"
          style={{
            paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
            paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)',
          }}
        >
          <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fadeIn modal-panel my-auto overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-line/80">
              <h4 className="font-bold text-sm sm:text-base text-content flex items-center gap-2 font-display">
                <Building2 className="w-4 h-4 text-accent" />
                {isEditing
                  ? t('admin.editDivision') || (isEn ? `Edit Division '${formData.code}'` : `Edit Divisi '${formData.code}'`)
                  : t('admin.addDivision') || (isEn ? 'Create New Division' : 'Tambah Divisi Baru')}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDivision} className="space-y-3.5 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Code */}
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">
                    {t('admin.divisionCode') || (isEn ? 'Division Code' : 'Kode Divisi')} *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 text-xs font-mono uppercase bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all disabled:opacity-60"
                    placeholder="e.g. IT, IA, HR"
                    maxLength={16}
                  />
                  <p className="text-[10px] text-content-subtle mt-1">
                    {isEditing
                      ? isEn
                        ? 'Code cannot be altered once created.'
                        : 'Kode tidak dapat diubah setelah dibuat.'
                      : isEn
                      ? 'Unique uppercase code (e.g. IT, IA, HR, FIN).'
                      : 'Kode unik huruf kapital (contoh: IT, IA, HR, FIN).'}
                  </p>
                </div>

                {/* Sort Order */}
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">
                    {t('admin.divisionSortOrder') || (isEn ? 'Sort Order' : 'Urutan Tampilan')}
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                    placeholder="10, 20, 30..."
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">
                  {t('admin.divisionName') || (isEn ? 'Division Name' : 'Nama Divisi')} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  placeholder="e.g. Information Technology"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">
                  {t('admin.divisionDesc') || (isEn ? 'Description' : 'Deskripsi')}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  placeholder="e.g. IT Operations, Architecture, Security & Development"
                />
              </div>

              {/* Division Persona */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-content-muted flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    {t('admin.divisionPersona') || (isEn ? 'Division Persona (AI Prompt Layer)' : 'Persona Divisi (Layer Prompt AI)')}
                  </label>
                  <span className="text-[10px] text-content-subtle font-medium">
                    {isEn ? 'Optional' : 'Opsional'}
                  </span>
                </div>
                <textarea
                  rows="3"
                  value={formData.assistant_persona}
                  onChange={(e) => setFormData({ ...formData, assistant_persona: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none resize-none text-content transition-all"
                  placeholder={
                    isEn
                      ? 'e.g. As an AI assistant for the IT Division, prioritize enterprise architecture, ABAP security, code optimization, and SAP transport best practices...'
                      : 'contoh: Sebagai asisten divisi IT, Anda berfokus pada arsitektur sistem SAP, integritas data ABAP, security transport, dan kepatuhan ITIL...'
                  }
                />
                <p className="text-[10px] text-content-subtle mt-1">
                  {t('admin.divisionPersonaHint') ||
                    (isEn
                      ? 'Acts between Global Organization Persona and User Personal Persona.'
                      : 'Berada di antara Persona Organisasi Global dan Persona Pribadi User.')}
                </p>
              </div>

              {/* Allowed RAG Tags */}
              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-500" />
                  {t('admin.divisionRagScope') || (isEn ? 'Allowed RAG Tags' : 'Tag Akses Dokumen / RAG')}
                </label>
                <input
                  type="text"
                  value={formData.rag_allowed_tags}
                  onChange={(e) => setFormData({ ...formData, rag_allowed_tags: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs font-mono bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  placeholder="ALL, IT, GENERAL"
                />
                <p className="text-[10px] text-content-subtle mt-1">
                  {t('admin.divisionRagScopeHint') ||
                    (isEn
                      ? 'Comma-separated document tags (e.g. ALL, IT, HR). Documents indexed in RAG with these tags will be accessible to users in this division.'
                      : 'Daftar tag dokumen dipisahkan koma (contoh: ALL, IT, HR). Hanya dokumen RAG dengan tag ini yang dapat diakses oleh user pada divisi ini.')}
                </p>
              </div>

              {/* Enabled Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="divEnabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 rounded text-accent focus:ring-accent/30 bg-surface-sunken border-line cursor-pointer"
                />
                <label htmlFor="divEnabled" className="text-xs font-semibold text-content cursor-pointer">
                  {isEn ? 'Enable this division (active for user assignment)' : 'Aktifkan divisi ini (dapat dipilih saat membuat/edit user)'}
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-line/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 rounded-xl shadow-sm shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? isEn
                      ? 'Saving…'
                      : 'Menyimpan…'
                    : isEditing
                    ? isEn
                      ? 'Update Division'
                      : 'Perbarui Divisi'
                    : isEn
                    ? 'Create Division'
                    : 'Simpan Divisi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERSONA PREVIEW MODAL */}
      {previewPersona && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-xs"
          style={{
            paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
            paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)',
          }}
        >
          <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fadeIn my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line/80">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h4 className="font-bold text-sm sm:text-base text-content font-display">
                  {isEn ? `Division Persona: ${previewPersona.name}` : `Persona Divisi: ${previewPersona.name}`}
                </h4>
              </div>
              <button
                onClick={() => setPreviewPersona(null)}
                className="text-content-muted hover:text-content p-1 rounded-lg hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-surface-sunken border border-line rounded-xl text-xs text-content leading-relaxed whitespace-pre-wrap font-mono">
              {previewPersona.assistant_persona}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewPersona(null)}
                className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-xs"
          style={{
            paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
            paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)',
          }}
        >
          <div className="bg-surface-raised border border-line/80 rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn my-auto">
            <div className="flex items-center gap-3 text-rose-500 pb-2 border-b border-line/80">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-content font-display">
                  {t('admin.divisionDeleteConfirmTitle') || (isEn ? 'Delete Division' : 'Hapus Divisi')}
                </h4>
                <span className="text-xs font-mono font-bold text-rose-500">
                  {deleteModal.division?.code} - {deleteModal.division?.name}
                </span>
              </div>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              {isEn
                ? `Are you sure you want to delete division '${deleteModal.division?.code}'?`
                : `Apakah Anda yakin ingin menghapus divisi '${deleteModal.division?.code}'?`}
            </p>

            {/* Impact Warning */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>{isEn ? 'Zero Data Loss Safe Deletion' : 'Penghapusan Aman Bebas Hilang Data'}</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {deleteModal.impactLoading
                  ? isEn
                    ? 'Calculating user impact…'
                    : 'Menghitung dampak pengguna…'
                  : isEn
                  ? `${deleteModal.impactCount} user(s) currently assigned to this division will be reset to 'No Division'. No user accounts will be deleted.`
                  : `${deleteModal.impactCount} pengguna yang terhubung akan dialihkan ke 'Tanpa Divisi'. Akun pengguna tidak akan terhapus.`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line/80">
              <button
                type="button"
                disabled={deleteModal.deleting}
                onClick={() => setDeleteModal({ isOpen: false, division: null, impactLoading: false, impactCount: 0, deleting: false })}
                className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteModal.deleting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm shadow-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {deleteModal.deleting
                  ? isEn
                    ? 'Deleting…'
                    : 'Menghapus…'
                  : isEn
                  ? 'Confirm Delete'
                  : 'Konfirmasi Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

