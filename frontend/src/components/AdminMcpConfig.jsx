import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import ConfirmModal from './ConfirmModal';

// ponytail: single-component CRUD with simple modal and inline feedback; extract subcomponents when complexity exceeds 300 LOC.
export default function AdminMcpConfig({ onRefreshMcpServers }) {
  const { t } = useLanguage();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null); // { id, success, message }
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', enabled: true });

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });
  const [deleting, setDeleting] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    setActionError('');
    try {
      const res = await api.adminMcpServers();
      const list = Array.isArray(res?.servers) ? res.servers : (Array.isArray(res) ? res : []);
      setServers(list);
      if (onRefreshMcpServers) {
        onRefreshMcpServers();
      }
    } catch (err) {
      setActionError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setForm({ name: '', url: '', enabled: true });
    setIsModalOpen(true);
  };

  const openEditModal = (server) => {
    setEditingId(server.id);
    setForm({
      name: server.name || '',
      url: server.url || '',
      enabled: server.enabled !== false,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingId(null);
    setForm({ name: '', url: '', enabled: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;

    setSubmitting(true);
    setActionError('');
    setActionSuccess('');

    try {
      if (editingId) {
        await api.adminUpdateMcpServer(editingId, {
          name: form.name.trim(),
          url: form.url.trim(),
          enabled: form.enabled,
        });
      } else {
        await api.adminCreateMcpServer({
          id: form.name.trim().toLowerCase().replace(/\s+/g, '-'),
          name: form.name.trim(),
          url: form.url.trim(),
          enabled: form.enabled,
        });
      }
      setActionSuccess(t('mcp.saved'));
      closeModal();
      await fetchServers();
    } catch (err) {
      setActionError(err.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (server) => {
    setDeleteConfirm({
      isOpen: true,
      id: server.id,
      name: server.name || server.id,
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    setDeleting(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.adminDeleteMcpServer(deleteConfirm.id);
      setActionSuccess(t('mcp.deleted'));
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      await fetchServers();
    } catch (err) {
      setActionError(err.message || t('common.error'));
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async (server) => {
    const id = server.id;
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await api.adminTestMcpConnection({ server_id: id, url: server.url });
      const ok = res?.online ?? res?.success ?? true;
      setTestResult({
        id,
        success: ok,
        message: ok ? t('mcp.testSuccess') : (res?.error || t('mcp.testFailed')),
      });
    } catch (err) {
      setTestResult({
        id,
        success: false,
        message: err.message || t('mcp.testFailed'),
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line/80">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
            <Server className="w-5 h-5 text-accent" />
            <span>MCP Servers</span>
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            URL-only registry for Model Context Protocol upstream servers.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-accent hover:bg-accent/90 text-accent-contrast rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{t('mcp.addServer')}</span>
        </button>
      </div>

      {/* Action feedback banners */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {actionSuccess}
          </span>
          <button type="button" onClick={() => setActionSuccess('')} className="cursor-pointer opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {actionError}
          </span>
          <button type="button" onClick={() => setActionError('')} className="cursor-pointer opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Loading skeleton / empty / list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-content-muted text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('common.loading')}</span>
        </div>
      ) : servers.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-line rounded-2xl bg-surface/50 text-content-muted text-xs">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No MCP servers registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {servers.map((server) => {
            const sid = server.id;
            const isTesting = testingId === sid;
            const result = testResult && testResult.id === sid ? testResult : null;
            const isEnabled = server.enabled !== false;

            return (
              <div
                key={sid}
                className="p-4 rounded-xl border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-line-focus"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-content truncate">
                      {server.name || sid}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        isEnabled
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                      }`}
                    >
                      {isEnabled ? t('mcp.enabled') : 'Disabled'}
                    </span>
                    {result && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] ${
                          result.success
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{result.message}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-content-muted truncate break-all">
                    {server.url || '—'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => handleTest(server)}
                    aria-label="Test connection"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line hover:bg-surface-hover text-content text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-accent" />
                    )}
                    <span className="hidden xs:inline">Test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(server)}
                    aria-label={t('mcp.editServer')}
                    className="p-1.5 rounded-lg border border-line hover:bg-surface-hover text-content text-xs transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(server)}
                    aria-label={t('common.delete')}
                    className="p-1.5 rounded-lg border border-line hover:bg-rose-500/10 text-rose-500 hover:border-rose-500/20 text-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-scaleUp">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h4 className="text-sm font-bold text-content flex items-center gap-2">
                <Server className="w-4 h-4 text-accent" />
                <span>{editingId ? t('mcp.editServer') : t('mcp.addServer')}</span>
              </h4>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="p-1 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-content block">
                  {t('mcp.serverName')}
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. SAP ERP Gateway"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-sunken border border-line focus:outline-hidden focus:border-accent text-content"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-content block">
                  {t('mcp.serverUrl')}
                </label>
                <input
                  type="url"
                  required
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://mcp.internal.example.com"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface-sunken border border-line focus:outline-hidden focus:border-accent text-content font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="mcp-enabled-checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-line text-accent focus:ring-accent cursor-pointer"
                />
                <label htmlFor="mcp-enabled-checkbox" className="text-xs text-content cursor-pointer select-none">
                  {t('mcp.enabled')}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-3 py-1.5 rounded-xl border border-line text-content text-xs font-medium hover:bg-surface-hover cursor-pointer disabled:opacity-50"
                >
                  {t('common.back')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:bg-accent/90 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingId ? t('common.save') : t('mcp.addServer')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => !deleting && setDeleteConfirm({ isOpen: false, id: null, name: '' })}
        onConfirm={handleDelete}
        title={t('mcp.deleteConfirm')}
        message={`"${deleteConfirm.name}"`}
        isLoading={deleting}
        variant="danger"
      />
    </div>
  );
}
