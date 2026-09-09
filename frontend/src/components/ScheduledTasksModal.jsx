import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit2,
  FileText,
  Loader2,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const SAP_TEMPLATES = [
  {
    id: 'po_unreleased',
    label: '📦 PO Belum Rilis',
    title: 'Rekap Harian PO Belum Rilis',
    prompt: 'Cek daftar Purchase Order (PO) di SAP yang masih berstatus belum rilis (pending approval). Tampilkan nomor PO, vendor, nilai, dan approver berikutnya dalam tabel ringkas.',
    type: 'daily',
    time: '08:00',
    interval: 'interval_1h',
  },
  {
    id: 'invoice_due',
    label: '⚠️ Invoice Jatuh Tempo',
    title: 'Early Warning Invoice Vendor Jatuh Tempo',
    prompt: 'Identifikasi invoice vendor yang akan jatuh tempo dalam 7 hari ke depan pada modul SAP FI/MM. Rangkum total tagihan dan daftar invoice prioritas.',
    type: 'workdays',
    time: '08:30',
    interval: 'interval_1h',
  },
  {
    id: 'idoc_rfc_error',
    label: '⚙️ IDoc & RFC Error',
    title: 'Monitoring IDoc & RFC Gagal',
    title: 'Pemeriksaan IDoc & RFC Gagal',
    prompt: 'Periksa status IDoc yang berstatus error (status 51 / 68) dan background RFC job yang failed dalam 24 jam terakhir. Jelaskan indikasi penyebab kegagalan.',
    type: 'interval',
    time: '08:00',
    interval: 'interval_2h',
  },
  {
    id: 'critical_stock',
    label: '📊 Stok Material Kritis',
    title: 'Laporan Stok Material Kritis',
    prompt: 'Cek ketersediaan stok material pada plant utama yang berada di bawah tingkat safety stock (tabel MARC/MARD). Urutkan berdasarkan prioritas pengadaan.',
    type: 'daily',
    time: '07:30',
    interval: 'interval_1h',
  },
];

const INTERVAL_OPTIONS = [
  { value: 'interval_30m', label: 'Setiap 30 Menit' },
  { value: 'interval_1h', label: 'Setiap 1 Jam' },
  { value: 'interval_2h', label: 'Setiap 2 Jam' },
  { value: 'interval_4h', label: 'Setiap 4 Jam' },
  { value: 'interval_6h', label: 'Setiap 6 Jam' },
  { value: 'interval_12h', label: 'Setiap 12 Jam' },
];

export default function ScheduledTasksModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const { t, language } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Penjadwalan State
  const [scheduleType, setScheduleType] = useState('daily'); // 'daily' | 'workdays' | 'interval' | 'custom'
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleInterval, setScheduleInterval] = useState('interval_1h');
  const [scheduleCustomCron, setScheduleCustomCron] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [expandedResultTaskId, setExpandedResultTaskId] = useState(null);
  const [copiedResultId, setCopiedResultId] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getScheduledTasks();
      setTasks(res.tasks || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar pemantauan');
      setError(err.message || (language === 'en' ? 'Failed to load scheduled tasks' : 'Gagal memuat daftar tugas terjadwal'));
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
    setFormEmail('');
    setScheduleType('daily');
    setScheduleTime('08:00');
    setScheduleInterval('interval_1h');
    setScheduleCustomCron('');
    setFormActive(true);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const parseCronExpression = (cronExpr) => {
    const cron = (cronExpr || 'daily@08:00').trim().toLowerCase();
    if (cron.startsWith('daily@')) {
      return { type: 'daily', time: cron.split('@')[1] || '08:00', interval: 'interval_1h', custom: '' };
    }
    if (cron === 'daily') {
      return { type: 'daily', time: '08:00', interval: 'interval_1h', custom: '' };
    }
    if (cron.startsWith('workdays@')) {
      return { type: 'workdays', time: cron.split('@')[1] || '08:00', interval: 'interval_1h', custom: '' };
    }
    if (['interval_30m', 'every_30m', '30m', 'interval_1h', 'hourly', '1h', 'interval_2h', 'interval_4h', 'interval_6h', 'interval_12h'].includes(cron)) {
      let intVal = cron;
      if (cron === 'every_30m' || cron === '30m') intVal = 'interval_30m';
      else if (cron === 'hourly' || cron === '1h') intVal = 'interval_1h';
      return { type: 'interval', time: '08:00', interval: intVal, custom: '' };
    }
    return { type: 'custom', time: '08:00', interval: 'interval_1h', custom: cronExpr };
  };

  const handleOpenEdit = (task) => {
    setEditingTaskId(task.id);
    setFormTitle(task.title || '');
    setFormPrompt(task.prompt || '');
    setFormEmail(task.email_to || '');
    setFormActive(task.is_active);

    const parsed = parseCronExpression(task.cron_expression);
    setScheduleType(parsed.type);
    setScheduleTime(parsed.time);
    setScheduleInterval(parsed.interval);
    setScheduleCustomCron(parsed.custom);

    setIsFormOpen(true);
  };

  const handleApplyTemplate = (tmpl) => {
    setFormTitle(tmpl.title);
    setFormPrompt(tmpl.prompt);
    setScheduleType(tmpl.type);
    if (tmpl.time) setScheduleTime(tmpl.time);
    if (tmpl.interval) setScheduleInterval(tmpl.interval);
  };

  const computeCronPayload = () => {
    if (scheduleType === 'daily') {
      return `daily@${scheduleTime || '08:00'}`;
    }
    if (scheduleType === 'workdays') {
      return `workdays@${scheduleTime || '08:00'}`;
    }
    if (scheduleType === 'interval') {
      return scheduleInterval || 'interval_1h';
    }
    return (scheduleCustomCron || 'daily@08:00').trim();
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formPrompt.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const cronPayload = computeCronPayload();
      const payload = {
        title: formTitle.trim(),
        prompt: formPrompt.trim(),
        cron_expression: cronPayload,
        email_to: formEmail.trim() || null,
        is_active: formActive,
      };

      if (editingTaskId) {
        await api.updateScheduledTask(editingTaskId, payload);
        setSuccessMsg('Pemantauan berhasil diperbarui.');
        setSuccessMsg(language === 'en' ? 'Scheduled task updated successfully.' : 'Tugas terjadwal berhasil diperbarui.');
      } else {
        await api.createScheduledTask(payload);
        setSuccessMsg('Pemantauan baru berhasil ditambahkan.');
        setSuccessMsg(language === 'en' ? 'New scheduled task added successfully.' : 'Tugas terjadwal baru berhasil ditambahkan.');
      }
      resetForm();
      await fetchTasks();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Gagal menyimpan pemantauan');
      setError(err.message || (language === 'en' ? 'Failed to save scheduled task' : 'Gagal menyimpan tugas terjadwal'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Hapus pemantauan terjadwal ini?')) return;
    if (!window.confirm(language === 'en' ? 'Delete this scheduled task?' : 'Hapus tugas terjadwal ini?')) return;
    try {
      await api.deleteScheduledTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message || 'Gagal menghapus pemantauan');
      setError(err.message || (language === 'en' ? 'Failed to delete scheduled task' : 'Gagal menghapus tugas terjadwal'));
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

  const handleCopyResult = (taskId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedResultId(taskId);
    setTimeout(() => setCopiedResultId(null), 2000);
  };

  const getScheduleBadgeInfo = (cronExpr) => {
    const str = (cronExpr || 'daily@08:00').trim().toLowerCase();
    if (str.startsWith('daily@')) {
      const time = str.split('@')[1] || '08:00';
      return {
        label: `Setiap Hari • ${time} WIB`,
        icon: Calendar,
        className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
      };
    }
    if (str === 'daily') {
      return {
        label: 'Setiap Hari • 08:00 WIB',
        icon: Calendar,
        className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
      };
    }
    if (str.startsWith('workdays@')) {
      const time = str.split('@')[1] || '08:00';
      return {
        label: `Hari Kerja • ${time} WIB`,
        icon: Calendar,
        className: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
      };
    }
    if (str === 'interval_30m' || str === 'every_30m' || str === '30m') {
      return {
        label: 'Setiap 30 Menit',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    if (str === 'interval_1h' || str === 'hourly' || str === '1h') {
      return {
        label: 'Setiap 1 Jam',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    if (str === 'interval_2h') {
      return {
        label: 'Setiap 2 Jam',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    if (str === 'interval_4h') {
      return {
        label: 'Setiap 4 Jam',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    if (str === 'interval_6h') {
      return {
        label: 'Setiap 6 Jam',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    if (str === 'interval_12h') {
      return {
        label: 'Setiap 12 Jam',
        icon: Clock,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      };
    }
    return {
      label: cronExpr,
      icon: Clock,
      className: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-line bg-surface shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-raised">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-soft text-accent-soft-fg">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-content font-display">
                {t('scheduled.title')}
              </h2>
              <p className="text-xs text-content-muted">
                {language === 'en' ? 'Automated SAP query execution & scheduled reports via Email (Multi-Recipient)' : 'Otomasi eksekusi query SAP & laporan terjadwal via Email (Multi-Penerima)'}
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
                {tasks.length} {language === 'en' ? 'active scheduled tasks' : 'tugas terjadwal aktif'}
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
              className="p-4 sm:p-5 rounded-2xl border border-line bg-surface-raised space-y-4 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <span className="text-xs font-bold text-content flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-accent" />
                  {editingTaskId ? 'Edit Pemantauan' : 'Tambah Pemantauan Baru'}
                  {editingTaskId ? (language === 'en' ? 'Edit Scheduled Task' : 'Edit Tugas Terjadwal') : (language === 'en' ? 'New Scheduled Task' : 'Tambah Tugas Terjadwal')}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-content-muted hover:text-content cursor-pointer"
                >
                  Batal
                </button>
              </div>

              {/* Quick Template Picker */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] text-content-muted font-medium mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>{t('scheduled.quickTemplates')}:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SAP_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleApplyTemplate(tmpl)}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-surface hover:bg-surface-hover border border-line hover:border-accent/40 text-content transition-all cursor-pointer"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Judul & Prompt */}
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

              {/* Penjadwalan: Frekuensi & Jam Spesifik */}
              <div className="p-3.5 rounded-xl border border-line bg-surface space-y-3">
                <label className="block text-xs font-semibold text-content">
                  {t('scheduled.cron')}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-content-muted mb-1">
                      {t('scheduled.frequency')}
                    </label>
                    <select
                      value={scheduleType}
                      onChange={(e) => setScheduleType(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface-raised focus:border-accent focus:outline-none text-content"
                    >
                      <option value="daily">📅 Setiap Hari (Harian)</option>
                      <option value="workdays">💼 Hari Kerja (Senin - Jumat)</option>
                      <option value="interval">⏱️ Interval Berkala</option>
                      <option value="custom">⚙️ Kustom (Cron Expression)</option>
                    </select>
                  </div>

                  {/* Input spesifik berdasarkan pilihan frekuensi */}
                  {(scheduleType === 'daily' || scheduleType === 'workdays') && (
                    <div>
                      <label className="block text-[11px] font-medium text-content-muted mb-1">
                        {t('scheduled.executionTime')} (Format 24 Jam)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          required
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs rounded-xl border border-line bg-surface-raised focus:border-accent focus:outline-none text-content"
                        />
                        <span className="text-[11px] text-content-muted font-medium">WIB</span>
                      </div>
                    </div>
                  )}

                  {scheduleType === 'interval' && (
                    <div>
                      <label className="block text-[11px] font-medium text-content-muted mb-1">
                        {t('scheduled.interval')}
                      </label>
                      <select
                        value={scheduleInterval}
                        onChange={(e) => setScheduleInterval(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface-raised focus:border-accent focus:outline-none text-content"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {scheduleType === 'custom' && (
                    <div>
                      <label className="block text-[11px] font-medium text-content-muted mb-1">
                        {t('scheduled.customCron')}
                      </label>
                      <input
                        type="text"
                        placeholder="misal: 0 8 * * 1-5"
                        value={scheduleCustomCron}
                        onChange={(e) => setScheduleCustomCron(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface-raised focus:border-accent focus:outline-none text-content font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-content-subtle pt-1 border-t border-line/40">
                  {scheduleType === 'daily' && (
                    <span>💡 Pemantauan dijalankan sekali setiap hari pada pukul {scheduleTime} WIB.</span>
                    <span>{language === 'en' ? `💡 Task runs once daily at ${scheduleTime} WIB.` : `💡 Tugas dijalankan sekali setiap hari pada pukul ${scheduleTime} WIB.`}</span>
                  )}
                  {scheduleType === 'workdays' && (
                    <span>💡 Pemantauan dijalankan setiap hari kerja (Senin - Jumat) pukul {scheduleTime} WIB.</span>
                    <span>{language === 'en' ? `💡 Task runs on workdays (Mon - Fri) at ${scheduleTime} WIB.` : `💡 Tugas dijalankan setiap hari kerja (Senin - Jumat) pukul ${scheduleTime} WIB.`}</span>
                  )}
                  {scheduleType === 'interval' && (
                    <span>💡 Pemantauan diulang secara otomatis setiap interval yang dipilih.</span>
                    <span>{language === 'en' ? '💡 Task repeats automatically at selected interval.' : '💡 Tugas diulang secara otomatis setiap interval yang dipilih.'}</span>
                  )}
                  {scheduleType === 'custom' && (
                    <span>💡 Menggunakan format ekspresi cron kustom standar Linux/Unix.</span>
                    <span>{language === 'en' ? '💡 Uses standard Linux/Unix cron expression format.' : '💡 Menggunakan format ekspresi cron kustom standar Linux/Unix.'}</span>
                  )}
                </div>
              </div>

              {/* Email Penerima (Multiple support) */}
              <div>
                <label className="block text-xs font-medium text-content mb-1">
                  {t('scheduled.emailTo')} (Opsional)
                </label>
                <input
                  type="text"
                  placeholder={t('scheduled.emailPlaceholder')}
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-surface focus:border-accent focus:outline-none text-content"
                />
                <p className="text-[11px] text-content-subtle mt-1">
                  {t('scheduled.emailHint')}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formActive"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent cursor-pointer"
                />
                <label htmlFor="formActive" className="text-xs text-content select-none cursor-pointer">
                  Aktifkan pemantauan ini secara otomatis
                  {language === 'en' ? 'Enable this schedule automatically' : 'Aktifkan jadwal ini secara otomatis'}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-1.5 rounded-xl border border-line text-xs font-medium text-content-muted hover:text-content bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Pemantauan</span>
                  <span>{language === 'en' ? 'Save Schedule' : 'Simpan Jadwal'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Tasks List */}
          {loading && tasks.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-content-muted space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="text-xs">Memuat daftar tugas...</span>
              <span className="text-xs">{language === 'en' ? 'Loading tasks...' : 'Memuat daftar tugas...'}</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-12 text-center text-content-muted border border-dashed border-line rounded-2xl p-6">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-medium">{t('scheduled.noTasks')}</p>
              <p className="text-[11px] mt-1 text-content-subtle">
                Klik tombol "Tambah Pemantauan" untuk membuat pemantauan otomatis pertama Anda.
                {language === 'en' ? 'Click "Add Scheduled Task" to configure your first automated schedule.' : 'Klik tombol "Tambah Tugas Terjadwal" untuk membuat jadwal otomatis pertama Anda.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const badge = getScheduleBadgeInfo(task.cron_expression);
                const BadgeIcon = badge.icon;
                const isExpanded = expandedResultTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className="p-4 rounded-2xl border border-line bg-surface-raised hover:border-accent/40 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-content">
                            {task.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(task)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer transition-all ${
                              task.is_active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-surface-sunken text-content-muted border-line hover:bg-surface-hover'
                            }`}
                            title="Klik untuk mengubah status aktif/nonaktif"
                          >
                            {task.is_active ? t('scheduled.active') : t('scheduled.inactive')}
                          </button>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${badge.className}`}
                          >
                            <BadgeIcon className="w-3 h-3 shrink-0" />
                            <span>{badge.label}</span>
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
                      <div className="flex items-center gap-3 flex-wrap">
                        {task.email_to && (
                          <span
                            className="flex items-center gap-1 text-content-muted font-medium truncate max-w-xs"
                            title={task.email_to}
                          >
                            <Mail className="w-3 h-3 shrink-0 text-accent" />
                            <span className="truncate">{task.email_to}</span>
                          </span>
                        )}
                        <span>
                          {t('scheduled.lastRun')}:{' '}
                          {task.last_run_at ? new Date(task.last_run_at).toLocaleString('id-ID') : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
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

                        {task.last_result && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedResultTaskId(isExpanded ? null : task.id)
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-accent hover:underline cursor-pointer ml-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>{isExpanded ? t('scheduled.hideResult') : t('scheduled.viewResult')}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Result Snippet */}
                    {isExpanded && task.last_result && (
                      <div className="mt-2 p-3 rounded-xl bg-surface border border-line text-xs font-mono text-content-secondary space-y-2 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between text-[10px] text-content-muted pb-1 border-b border-line/40">
                          <span className="font-semibold uppercase tracking-wider">Hasil Eksekusi AI Terakhir:</span>
                          <button
                            type="button"
                            onClick={() => handleCopyResult(task.id, task.last_result)}
                            className="inline-flex items-center gap-1 text-content hover:text-accent cursor-pointer"
                          >
                            {copiedResultId === task.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-500">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">
                          {task.last_result}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

