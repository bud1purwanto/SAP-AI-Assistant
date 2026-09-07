import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  Clock,
  Edit2,
  Loader2,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const CRON_PRESETS = [
  { value: 'daily', labelId: 'Setiap Hari (Daily Digest)' },
  { value: 'hourly', labelId: 'Setiap Jam (Hourly)' },
  { value: 'every_30m', labelId: 'Setiap 30 Menit' },
];

export default function ScheduledTasksModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formCron, setFormCron] = useState('daily');
  const [formEmail, setFormEmail] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getScheduledTasks();
      setTasks(res.tasks || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar pemantauan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
    }
  }, [isOpen]);

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingTaskId(null);
    setFormTitle('');
    setFormPrompt('');
    setFormCron('daily');
    setFormEmail('');
    setFormActive(true);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (task) => {
    setEditingTaskId(task.id);
    setFormTitle(task.title || '');
    setFormPrompt(task.prompt || '');
    setFormCron(task.cron_expression || 'daily');
    setFormEmail(task.email_to || '');
    setFormActive(task.is_active);
    setIsFormOpen(true);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formPrompt.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      if (editingTaskId) {
        await api.updateScheduledTask(editingTaskId, {
          title: formTitle,
          prompt: formPrompt,
          cron_expression: formCron,
          email_to: formEmail || null,
          is_active: formActive,
        });
        setSuccessMsg('Pemantauan berhasil diperbarui.');
      } else {
        await api.createScheduledTask({
          title: formTitle,
          prompt: formPrompt,
          cron_expression: formCron,
          email_to: formEmail || null,
          is_active: formActive,
        });
        setSuccessMsg('Pemantauan baru berhasil ditambahkan.');
      }
      resetForm();
      await fetchTasks();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan pemantauan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Hapus pemantauan terjadwal ini?')) return;
    try {
      await api.deleteScheduledTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message || 'Gagal menghapus pemantauan');
    }
  };

  const handleToggleActive = async (task) => {
    try {
      const nextActive = !task.is_active;
      await api.updateScheduledTask(task.id, { is_active: nextActive });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, is_active: nextActive } : t))
      );
    } catch (err) {
      setError(err.message || 'Gagal mengubah status');
    }
  };

  const handleRunNow = async (taskId) => {
    setRunningTaskId(taskId);
    try {
      await api.runScheduledTask(taskId);
      setSuccessMsg('Tugas berhasil dipicu dan sedang berjalan di latar belakang.');
      setTimeout(() => {
        setSuccessMsg('');
        fetchTasks();
      }, 4000);
    } catch (err) {
      setError(err.message || 'Gagal menjalankan tugas');
    } finally {
      setRunningTaskId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-line bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-raised">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-soft text-accent-soft-fg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-content font-display">
                {t('scheduled.title')}
              </h2>
              <p className="text-xs text-content-muted">
                Otomasi eksekusi query SAP & laporan harian via Email
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Action Bar */}
          {!isFormOpen && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-content-muted">
                {tasks.length} tugas pemantauan aktif
              </span>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-90 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('scheduled.addTask')}</span>
              </button>
            </div>
          )}

          {/* Create/Edit Form */}
          {isFormOpen && (
            <form
              onSubmit={handleSubmitForm}
              className="p-4 rounded-2xl border border-line bg-surface-raised space-y-3.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <span className="text-xs font-bold text-content">
                  {editingTaskId ? 'Edit Pemantauan' : 'Tambah Pemantauan Baru'}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-content-muted hover:text-content"
                >
                  Batal
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">
                  {t('scheduled.taskName')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rekap Harian PO Belum Rilis"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface focus:border-accent focus:outline-none text-content"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content mb-1">
                  {t('scheduled.prompt')}
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Contoh: Cek daftar Purchase Order yang belum dirilis di SAP MM, rangkum dalam tabel ringkas."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface focus:border-accent focus:outline-none text-content resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-content mb-1">
                    {t('scheduled.cron')}
                  </label>
                  <select
                    value={formCron}
                    onChange={(e) => setFormCron(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface focus:border-accent focus:outline-none text-content"
                  >
                    {CRON_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.labelId}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content mb-1">
                    {t('scheduled.emailTo')} (Opsional)
                  </label>
                  <input
                    type="email"
                    placeholder="nama@perusahaan.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface focus:border-accent focus:outline-none text-content"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formActive"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                <label htmlFor="formActive" className="text-xs text-content select-none">
                  Aktifkan pemantauan ini
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-1.5 rounded-xl border border-line text-xs font-medium text-content-muted hover:text-content bg-surface hover:bg-surface-hover transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Pemantauan</span>
                </button>
              </div>
            </form>
          )}

          {/* Tasks List */}
          {loading && tasks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-content-muted space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-xs">Memuat daftar tugas...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-content-muted border border-dashed border-line rounded-2xl p-6">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-medium">{t('scheduled.noTasks')}</p>
              <p className="text-[11px] mt-1 text-content-subtle">
                Klik tombol "Tambah Pemantauan" untuk membuat pemantauan otomatis pertama Anda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-2xl border border-line bg-surface-raised hover:border-accent/40 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-content">
                          {task.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            task.is_active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-surface-sunken text-content-muted border-line'
                          }`}
                        >
                          {task.is_active ? t('scheduled.active') : t('scheduled.inactive')}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-content-muted font-mono bg-surface-sunken px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" />
                          {task.cron_expression}
                        </span>
                      </div>
                      <p className="text-xs text-content-secondary line-clamp-2">
                        {task.prompt}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRunNow(task.id)}
                        disabled={runningTaskId === task.id}
                        className="p-1.5 rounded-lg text-content-muted hover:text-accent hover:bg-surface transition-colors cursor-pointer"
                        title={t('scheduled.runNow')}
                      >
                        <Play
                          className={`w-3.5 h-3.5 ${
                            runningTaskId === task.id ? 'animate-spin text-accent' : ''
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(task)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(task.id)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-rose-500 hover:bg-surface transition-colors cursor-pointer"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata & Status */}
                  <div className="flex items-center justify-between text-[11px] text-content-muted pt-2 border-t border-line/50 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      {task.email_to && (
                        <span className="flex items-center gap-1 text-content-muted">
                          <Mail className="w-3 h-3" />
                          {task.email_to}
                        </span>
                      )}
                      <span>
                        {t('scheduled.lastRun')}:{' '}
                        {task.last_run_at ? new Date(task.last_run_at).toLocaleString('id-ID') : '-'}
                      </span>
                    </div>

                    {task.last_status && (
                      <span
                        className={`font-mono text-[10px] uppercase font-semibold ${
                          task.last_status === 'success'
                            ? 'text-emerald-500'
                            : task.last_status === 'running'
                            ? 'text-amber-500'
                            : 'text-rose-500'
                        }`}
                      >
                        ● {task.last_status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

