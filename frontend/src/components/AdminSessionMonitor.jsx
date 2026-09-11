import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  PowerOff,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  UserX,
  Laptop,
  Layers,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import { getRoleBadgeStyle, formatRoleLabel, getUserInitials } from '../lib/roles';
import ConfirmModal from './ConfirmModal';

export default function AdminSessionMonitor({ masterRoles = [] }) {
  const { t, language, isEn } = useLanguage();

  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState({
    total_active: 0,
    online_now: 0,
    desktop_count: 0,
    mobile_count: 0,
    kicked_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'kicked' | 'all'
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // Kick Confirmation State
  const [kickTarget, setKickTarget] = useState(null); // session object or null
  const [kickReason, setKickReason] = useState('');
  const [isKicking, setIsKicking] = useState(false);

  // Kick All Confirmation State
  const [kickAllUser, setKickAllUser] = useState(null); // username or null
  const [isKickingAll, setIsKickingAll] = useState(false);

  const fetchSessions = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.adminUserSessions(statusFilter, searchQuery);
      if (res) {
        setSessions(res.sessions || []);
        if (res.summary) setSummary(res.summary);
      }
      setActionError('');
    } catch (err) {
      if (!isSilent) setActionError(err.message || 'Gagal memuat daftar sesi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = setInterval(() => {
      fetchSessions(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchSessions]);

  const handleExecuteKick = async () => {
    if (!kickTarget) return;
    setIsKicking(true);
    try {
      await api.adminKickUserSession(kickTarget.id, kickReason);
      setActionSuccess(t('sessions.kickSuccess'));
      setKickTarget(null);
      setKickReason('');
      await fetchSessions();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Gagal memutuskan sesi.');
    } finally {
      setIsKicking(false);
    }
  };

  const handleExecuteKickAll = async () => {
    if (!kickAllUser) return;
    setIsKickingAll(true);
    try {
      await api.adminKickAllUserSessions(kickAllUser, kickReason);
      setActionSuccess(t('sessions.kickAllSuccess'));
      setKickAllUser(null);
      setKickReason('');
      await fetchSessions();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setActionError(err.message || 'Gagal memutuskan seluruh sesi user.');
    } finally {
      setIsKickingAll(false);
    }
  };

  const getDeviceIcon = (type, os) => {
    if (type === 'mobile') return Smartphone;
    if (type === 'tablet') return Tablet;
    if (os && os.toLowerCase().includes('mac')) return Laptop;
    return Monitor;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner Alert / Success */}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Online Now */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-content-muted">{t('sessions.onlineNow')}</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-display text-content">{summary.online_now}</span>
            <span className="text-[10px] text-emerald-500 font-medium">{isEn ? 'live users' : 'user aktif'}</span>
          </div>
        </div>

        {/* Card 2: Total Active Sessions */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-content-muted">{t('sessions.totalActive')}</span>
            <Activity className="w-4 h-4 text-accent" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-display text-content">{summary.total_active}</span>
            <span className="text-[10px] text-content-muted">{isEn ? 'terminals' : 'perangkat'}</span>
          </div>
        </div>

        {/* Card 3: Desktop */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-content-muted">{t('sessions.desktopCount')}</span>
            <Monitor className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-display text-content">{summary.desktop_count}</span>
            <span className="text-[10px] text-content-muted">{isEn ? 'PCs' : 'PC'}</span>
          </div>
        </div>

        {/* Card 4: Mobile */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-content-muted">{t('sessions.mobileCount')}</span>
            <Smartphone className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-display text-content">{summary.mobile_count}</span>
            <span className="text-[10px] text-content-muted">{isEn ? 'mobiles' : 'HP'}</span>
          </div>
        </div>

        {/* Card 5: Kicked Today */}
        <div className="col-span-2 sm:col-span-1 p-3.5 sm:p-4 rounded-2xl bg-surface border border-line shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-content-muted">{t('sessions.kickedToday')}</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-display text-content">{summary.kicked_today}</span>
            <span className="text-[10px] text-rose-500 font-medium">{isEn ? 'terminated' : 'diputus'}</span>
          </div>
        </div>
      </div>

      {/* Action Bar: Search, Filters & Live Radar Toggle */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
            <input
              type="text"
              placeholder={t('sessions.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full text-content placeholder:text-content-subtle transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 text-content cursor-pointer transition-all shrink-0"
          >
            <option value="active">{t('sessions.filterActive')}</option>
            <option value="kicked">{t('sessions.filterKicked')}</option>
            <option value="all">{t('sessions.filterAll')}</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Live Radar Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-surface-sunken border-line text-content-muted'
            }`}
            title={isEn ? 'Toggle live auto refresh' : 'Saklar pembaruan otomatis'}
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            <span>{t('sessions.autoRefresh')}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500' : 'bg-content-muted/40'}`} />
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => fetchSessions()}
            disabled={refreshing}
            className="p-2 text-content-muted hover:text-content bg-surface-sunken hover:bg-surface-hover border border-line rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title={t('admin.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </div>

      {/* Session List Table & Cards */}
      <div className="border border-line rounded-2xl overflow-hidden shadow-xs bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-surface-sunken/70 border-b border-line text-content-muted text-[10px] sm:text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
              <tr>
                <th className="px-4 py-3">{isEn ? 'User & Division' : 'Pengguna & Divisi'}</th>
                <th className="px-4 py-3">{t('sessions.terminalHardware')}</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">{t('sessions.currentAction')}</th>
                <th className="px-4 py-3">{isEn ? 'Status & Last Active' : 'Status & Terakhir Aktif'}</th>
                <th className="px-4 py-3 text-right">{isEn ? 'Action' : 'Aksi'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-content-secondary">
              {loading && sessions.length === 0 ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 w-32 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-28 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-20 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-36 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-24 bg-line rounded" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="h-6 w-16 bg-line rounded ml-auto" /></td>
                  </tr>
                ))
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-content-muted text-xs sm:text-sm">
                    {t('sessions.empty')}
                  </td>
                </tr>
              ) : (
                sessions.map((sess) => {
                  const DevIcon = getDeviceIcon(sess.device_type, sess.os);
                  const isOnline = sess.is_online;
                  const isIdle = sess.is_idle;
                  const isTerminated = !sess.is_active;

                  return (
                    <tr
                      key={sess.id}
                      className={`hover:bg-surface-hover/50 transition-colors ${
                        isTerminated ? 'opacity-60 bg-surface-sunken/30' : ''
                      }`}
                    >
                      {/* 1. User & Division */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-accent/20 border border-line flex items-center justify-center font-bold text-xs text-accent shrink-0">
                            {getUserInitials(sess.full_name || sess.username)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-content truncate">{sess.full_name || sess.username}</span>
                              <span className="text-[10px] text-content-muted">(@{sess.username})</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold ${getRoleBadgeStyle(sess.role)}`}>
                                {formatRoleLabel(sess.role, masterRoles, language)}
                              </span>
                              {sess.division_name && (
                                <span className="text-[10px] text-content-muted truncate">
                                  • {sess.division_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Terminal & Device Info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-surface-sunken border border-line text-content-muted shrink-0">
                            <DevIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-content text-xs truncate max-w-[180px]">
                              {sess.device_name || 'Terminal'}
                            </div>
                            <div className="text-[10px] text-content-muted truncate">
                              {sess.terminal_info || `${sess.browser || ''} ${sess.os || ''}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. IP Address */}
                      <td className="px-4 py-3 font-mono text-[11px] text-content-secondary whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-content-subtle" />
                          <span>{sess.ip_address || '127.0.0.1'}</span>
                        </div>
                      </td>

                      {/* 4. Current Action */}
                      <td className="px-4 py-3">
                        <div className="max-w-[200px]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-sunken border border-line text-[11px] text-content-secondary truncate">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-content-muted'}`} />
                            <span className="truncate">{sess.current_action || 'Membuka Chat Utama'}</span>
                          </span>
                        </div>
                      </td>

                      {/* 5. Status & Last Active */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            {isTerminated ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[10px] font-bold">
                                <PowerOff className="w-2.5 h-2.5" />
                                {sess.status === 'kicked_by_new_login'
                                  ? (isEn ? 'Kicked (New Login)' : 'Kicked (Login Baru)')
                                  : sess.status === 'kicked_by_admin'
                                  ? (isEn ? 'Kicked by Admin' : 'Diputus Admin')
                                  : (isEn ? 'Logged Out' : 'Keluar')}
                              </span>
                            ) : isOnline ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                {t('sessions.statusOnline')}
                              </span>
                            ) : isIdle ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                {t('sessions.statusIdle')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-sunken text-content-muted border border-line text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-content-muted" />
                                {t('sessions.statusOffline')}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-content-subtle mt-0.5">
                            {sess.last_active_at ? new Date(sess.last_active_at).toLocaleTimeString() : 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* 6. Action: Kick Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {sess.is_active ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setKickTarget(sess);
                                setKickReason('');
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                              title={t('sessions.kickBtn')}
                            >
                              <PowerOff className="w-3 h-3" />
                              <span>{isEn ? 'Kick' : 'Putuskan'}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-content-subtle italic">
                            {sess.kicked_at ? new Date(sess.kicked_at).toLocaleTimeString() : 'Nonaktif'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Konfirmasi Kick Sesi */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md animate-modal-backdrop" onClick={() => setKickTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-surface border border-rose-500/30 p-6 shadow-2xl shadow-rose-950/20 animate-modal-content overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-rose-500 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <PowerOff className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-content font-display">{t('sessions.kickConfirmTitle')}</h4>
                <p className="text-xs text-content-muted">
                  {kickTarget.full_name || kickTarget.username} • {kickTarget.device_name}
                </p>
              </div>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed bg-surface-sunken p-3 rounded-xl border border-line mb-4">
              {t('sessions.kickConfirmMsg')
                .replace('{user}', kickTarget.full_name || kickTarget.username)
                .replace('{device}', kickTarget.device_name || 'Terminal')
                .replace('{ip}', kickTarget.ip_address || '127.0.0.1')}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-content-secondary mb-1">
                {t('sessions.kickReasonPrompt')}
              </label>
              <input
                type="text"
                placeholder={t('sessions.kickReasonPlaceholder')}
                value={kickReason}
                onChange={(e) => setKickReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30 text-content placeholder:text-content-subtle"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setKickTarget(null)}
                disabled={isKicking}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover border border-line transition-all cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Batal'}
              </button>
              <button
                type="button"
                onClick={handleExecuteKick}
                disabled={isKicking}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-md shadow-rose-600/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isKicking ? (isEn ? 'Kicking…' : 'Memutuskan…') : t('sessions.kickBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

