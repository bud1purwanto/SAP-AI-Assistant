import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  User,
  Monitor,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PowerOff,
  KeyRound,
  Filter,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

export default function AdminSecurityLogs() {
  const { t, isEn } = useLanguage();

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usernameFilter, setUsernameFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.adminSecurityLogs({
        username: usernameFilter,
        eventType: eventTypeFilter,
        limit: 150,
      });
      if (res) {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
      }
      setError('');
    } catch (err) {
      if (!isSilent) setError(err.message || 'Gagal memuat log audit keamanan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [usernameFilter, eventTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getEventBadge = (eventType, status) => {
    switch (eventType) {
      case 'LOGIN_SUCCESS':
        return {
          icon: CheckCircle2,
          label: isEn ? 'Login Success' : 'Login Sukses',
          color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'LOGIN_FAILED':
        return {
          icon: XCircle,
          label: isEn ? 'Login Failed' : 'Login Gagal',
          color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        };
      case 'LOGIN_BLOCKED':
        return {
          icon: ShieldAlert,
          label: isEn ? 'Login Blocked (Brute-force)' : 'Diblokir (Brute-force)',
          color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        };
      case 'SESSION_KICKED_NEW_LOGIN':
        return {
          icon: PowerOff,
          label: isEn ? 'Kicked (Single Session)' : 'Diputus (Sesi Ganda)',
          color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
      case 'SESSION_KICKED_BY_ADMIN':
        return {
          icon: ShieldAlert,
          label: isEn ? 'Kicked by Admin' : 'Diputus Administrator',
          color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        };
      case 'FORCE_LOGOUT_ALL':
        return {
          icon: ShieldAlert,
          label: isEn ? 'Force Logout All' : 'Putus Semua Sesi',
          color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        };
      case 'LOGOUT':
        return {
          icon: PowerOff,
          label: isEn ? 'Logout' : 'Keluar (Logout)',
          color: 'bg-surface-sunken text-content-muted border-line',
        };
      default:
        return {
          icon: AlertTriangle,
          label: eventType,
          color: 'bg-surface-sunken text-content-secondary border-line',
        };
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner Alert */}
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs sm:text-sm animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Bar: Search & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-content-subtle" />
            <input
              type="text"
              placeholder={t('securityLogs.searchPlaceholder')}
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full text-content placeholder:text-content-subtle transition-all"
            />
          </div>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 text-content cursor-pointer transition-all shrink-0"
          >
            <option value="">{t('securityLogs.filterEventAll')}</option>
            <option value="LOGIN_SUCCESS">{isEn ? 'Login Success' : 'Login Sukses'}</option>
            <option value="LOGIN_FAILED">{isEn ? 'Login Failed' : 'Login Gagal'}</option>
            <option value="LOGIN_BLOCKED">{isEn ? 'Login Blocked' : 'Login Diblokir'}</option>
            <option value="SESSION_KICKED_NEW_LOGIN">{isEn ? 'Kicked (New Login)' : 'Diputus (Login Baru)'}</option>
            <option value="SESSION_KICKED_BY_ADMIN">{isEn ? 'Kicked by Admin' : 'Diputus Admin'}</option>
            <option value="LOGOUT">{isEn ? 'Logout' : 'Logout'}</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-content-muted">
            {isEn ? `Total: ${total} events` : `Total: ${total} aktivitas`}
          </span>
          <button
            type="button"
            onClick={() => fetchLogs()}
            disabled={refreshing}
            className="p-2 text-content-muted hover:text-content bg-surface-sunken hover:bg-surface-hover border border-line rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title={t('admin.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="border border-line rounded-2xl overflow-hidden shadow-xs bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-surface-sunken/70 border-b border-line text-content-muted text-[10px] sm:text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
              <tr>
                <th className="px-4 py-3">{isEn ? 'Timestamp' : 'Waktu'}</th>
                <th className="px-4 py-3">{isEn ? 'Event Type' : 'Aktivitas'}</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">{t('sessions.terminalHardware')}</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">{isEn ? 'Details' : 'Keterangan'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-content-secondary">
              {loading && logs.length === 0 ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="h-4 w-28 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-32 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-20 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-28 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-24 bg-line rounded" /></td>
                    <td className="px-4 py-3.5"><div className="h-4 w-44 bg-line rounded" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-content-muted text-xs sm:text-sm">
                    {t('securityLogs.empty')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getEventBadge(log.event_type, log.status);
                  const BadgeIcon = badge.icon;
                  const logDate = log.timestamp ? new Date(log.timestamp) : null;

                  return (
                    <tr key={log.id} className="hover:bg-surface-hover/50 transition-colors">
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-content text-xs">
                            {logDate ? logDate.toLocaleTimeString() : 'N/A'}
                          </span>
                          <span className="text-[10px] text-content-subtle">
                            {logDate ? logDate.toLocaleDateString() : ''}
                          </span>
                        </div>
                      </td>

                      {/* Event Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color}`}>
                          <BadgeIcon className="w-3 h-3 shrink-0" />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3 font-semibold text-content text-xs whitespace-nowrap">
                        @{log.username}
                      </td>

                      {/* Device & OS */}
                      <td className="px-4 py-3">
                        <div className="min-w-0 max-w-[180px]">
                          <div className="font-medium text-content text-xs truncate">
                            {log.device_name || 'Terminal'}
                          </div>
                          <div className="text-[10px] text-content-muted truncate">
                            {log.browser ? `${log.browser} • ${log.os || ''}` : log.device_type || 'desktop'}
                          </div>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="px-4 py-3 font-mono text-[11px] text-content-secondary whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-content-subtle" />
                          <span>{log.ip_address || '127.0.0.1'}</span>
                        </div>
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3 text-xs text-content-secondary max-w-xs truncate" title={log.details}>
                        {log.details || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

