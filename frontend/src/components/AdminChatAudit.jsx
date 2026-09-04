import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  MessageSquare,
  Users,
  Search,
  Download,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  Database,
  Hash,
  Terminal,
  ShieldCheck,
  Activity,
  Layers,
  RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import {
  getRoleBadgeStyle,
  getRoleLabel,
  getUserInitials
} from '../lib/roles';

export default function AdminChatAudit({ masterRoles: _masterRoles = [], usersList = [] }) {
  const { isEn } = useLanguage();

  // Sessions and Messages Data State
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // 'all' | 'today' | '7d' | '30d'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'most_messages' | 'least_messages'

  // In-session keyword search
  const [inSessionSearch, setInSessionSearch] = useState('');

  // UI Feedback States
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState(null);
  const [showSourcesMap, setShowSourcesMap] = useState({});

  // Map of username -> role from usersList
  const userRoleMap = useMemo(() => {
    const map = {};
    if (Array.isArray(usersList)) {
      usersList.forEach(u => {
        if (u.username) {
          map[u.username.toLowerCase()] = u.role || 'user';
        }
      });
    }
    return map;
  }, [usersList]);

  // Fetch all audit sessions
  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await api.adminSessions(300);
      setSessions(Array.isArray(data) ? data : []);
      // If a session was selected, re-select updated session if exists
      if (selectedSession) {
        const found = data.find(s => s.session_id === selectedSession.session_id);
        if (found) setSelectedSession(found);
      }
    } catch (err) {
      console.error("Gagal memuat audit sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Fetch messages for selected session
  const fetchMessages = async (sessionId) => {
    setLoadingMessages(true);
    setShowSourcesMap({});
    setInSessionSearch('');
    try {
      const data = await api.adminSessionMessages(sessionId);
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Gagal memuat pesan audit:", err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleSelectSession = (s) => {
    setSelectedSession(s);
    fetchMessages(s.session_id);
  };

  // Unique users list for dropdown filter
  const uniqueUsers = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => {
      if (s.username) set.add(s.username);
    });
    return Array.from(set).sort();
  }, [sessions]);

  // Executive Metric Calculations
  const metrics = useMemo(() => {
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((acc, s) => acc + (Number(s.message_count) || 0), 0);
    const uniqueUserCount = uniqueUsers.length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const activeToday = sessions.filter(s => {
      const updated = s.updated_at ? s.updated_at.slice(0, 10) : '';
      const created = s.created_at ? s.created_at.slice(0, 10) : '';
      return updated === todayStr || created === todayStr;
    }).length;

    const avgPerSession = totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : '0';

    return {
      totalSessions,
      totalMessages,
      uniqueUserCount,
      activeToday,
      avgPerSession,
    };
  }, [sessions, uniqueUsers]);

  // Date Filter Helper
  const isWithinDateRange = (dateStr, range) => {
    if (range === 'all' || !dateStr) return true;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return true;
    const now = new Date();

    if (range === 'today') {
      return date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    }
    if (range === '7d') {
      const diffMs = now - date;
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    }
    if (range === '30d') {
      const diffMs = now - date;
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  };

  // Filtered & Sorted Sessions
  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    // Search query filter (user, title, session_id)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        (s.username && s.username.toLowerCase().includes(q)) ||
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.session_id && s.session_id.toLowerCase().includes(q))
      );
    }

    // User filter
    if (selectedUserFilter !== 'all') {
      result = result.filter(s => s.username === selectedUserFilter);
    }

    // Date range filter
    if (dateRangeFilter !== 'all') {
      result = result.filter(s => isWithinDateRange(s.updated_at || s.created_at, dateRangeFilter));
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'oldest') {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeA - timeB;
      }
      if (sortBy === 'most_messages') {
        return (Number(b.message_count) || 0) - (Number(a.message_count) || 0);
      }
      if (sortBy === 'least_messages') {
        return (Number(a.message_count) || 0) - (Number(b.message_count) || 0);
      }
      return 0;
    });

    return result;
  }, [sessions, searchQuery, selectedUserFilter, dateRangeFilter, sortBy]);

  // Messages filtered by in-session search
  const filteredMessages = useMemo(() => {
    if (!inSessionSearch.trim()) return messages;
    const q = inSessionSearch.toLowerCase().trim();
    return messages.filter(m => (m.content && m.content.toLowerCase().includes(q)));
  }, [messages, inSessionSearch]);

  const hasActiveFilters = searchQuery !== '' || selectedUserFilter !== 'all' || dateRangeFilter !== 'all' || sortBy !== 'newest';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedUserFilter('all');
    setDateRangeFilter('all');
    setSortBy('newest');
  };

  // Copy Session ID
  const handleCopySessionId = (sid) => {
    navigator.clipboard.writeText(sid);
    setCopiedSessionId(true);
    setTimeout(() => setCopiedSessionId(false), 2000);
  };

  // Copy Message Content
  const handleCopyMessage = (msgId, content) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Copy Code Block Content
  const handleCopyCode = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  // Export Filtered Sessions to CSV
  const exportToCSV = () => {
    if (filteredSessions.length === 0) return;

    const headers = ['Session ID', 'Username', 'Role', 'Title', 'Message Count', 'Created At', 'Updated At'];
    const rows = filteredSessions.map(s => {
      const role = userRoleMap[s.username?.toLowerCase()] || 'user';
      return [
        `"${s.session_id || ''}"`,
        `"${(s.username || '').replace(/"/g, '""')}"`,
        `"${getRoleLabel(role, isEn)}"`,
        `"${(s.title || '').replace(/"/g, '""')}"`,
        s.message_count || 0,
        `"${s.created_at || ''}"`,
        `"${s.updated_at || ''}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `chat_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Markdown Transcript Text
  const buildTranscriptMarkdown = () => {
    if (!selectedSession || messages.length === 0) return '';
    const role = userRoleMap[selectedSession.username?.toLowerCase()] || 'user';
    const roleLabel = getRoleLabel(role, isEn);

    let md = `# Audit Log Percakapan: ${selectedSession.title || 'Untitled Session'}\n\n`;
    md += `- **ID Sesi**: \`${selectedSession.session_id}\`\n`;
    md += `- **Pengguna**: ${selectedSession.username} (${roleLabel})\n`;
    md += `- **Total Pesan**: ${messages.length}\n`;
    md += `- **Dibuat**: ${selectedSession.created_at || '-'}\n`;
    md += `- **Terakhir Aktif**: ${selectedSession.updated_at || '-'}\n\n`;
    md += `---\n\n`;

    messages.forEach((m, idx) => {
      const sender = m.role === 'user' ? `${selectedSession.username} (User)` : 'SAP AI Assistant';
      const time = m.created_at ? m.created_at.replace('T', ' ').slice(0, 19) : '';
      md += `### ${idx + 1}. [${sender}] - ${time}\n\n`;
      md += `${m.content}\n\n`;
      if (m.feedback) {
        md += `*Feedback: ${m.feedback}*\n\n`;
      }
      md += `---\n\n`;
    });

    return md;
  };

  // Copy Full Transcript as Markdown
  const handleCopyTranscript = () => {
    const md = buildTranscriptMarkdown();
    if (!md) return;
    navigator.clipboard.writeText(md);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Download Transcript as .md File
  const handleDownloadTranscript = () => {
    const md = buildTranscriptMarkdown();
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit_transcript_${selectedSession.session_id.slice(0, 12)}_${new Date().toISOString().slice(0, 10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format date helper for UI
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr.slice(0, 16);
      return d.toLocaleDateString(isEn ? 'en-US' : 'id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr.slice(0, 16);
    }
  };

  // Markdown Render Components
  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeText = String(children).replace(/\n$/, '');
      const codeKey = `${node?.position?.start?.line || ''}_${codeText.slice(0, 20)}`;

      if (!inline && (match || codeText.includes('\n'))) {
        return (
          <div className="my-3 rounded-xl border border-line overflow-hidden bg-surface-sunken/80 shadow-2xs font-mono text-xs">
            <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-line text-[11px] text-content-muted">
              <span className="flex items-center gap-1.5 font-semibold text-content-secondary uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-accent" />
                {match ? match[1] : 'code'}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(codeKey, codeText)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-surface-hover hover:text-content text-content-subtle transition-colors cursor-pointer"
              >
                {copiedCodeKey === codeKey ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">{isEn ? 'Copied' : 'Tersalin'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{isEn ? 'Copy' : 'Salin'}</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-[11.5px] leading-relaxed select-text font-mono text-content">
              <code>{children}</code>
            </pre>
          </div>
        );
      }
      return (
        <code className="px-1.5 py-0.5 rounded-md bg-surface-sunken text-accent font-mono text-[11.5px] border border-line/60" {...props}>
          {children}
        </code>
      );
    },
    table({ children }) {
      return (
        <div className="my-3 overflow-x-auto rounded-xl border border-line shadow-2xs">
          <table className="w-full text-left text-xs border-collapse divide-y divide-line">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-surface-sunken font-semibold text-content">{children}</thead>;
    },
    th({ children }) {
      return <th className="px-3 py-2 text-xs font-semibold border-b border-line">{children}</th>;
    },
    td({ children }) {
      return <td className="px-3 py-2 text-xs border-b border-line/40 text-content-secondary">{children}</td>;
    },
    ul({ children }) {
      return <ul className="list-disc list-inside space-y-1 my-2 text-content-secondary pl-1">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal list-inside space-y-1 my-2 text-content-secondary pl-1">{children}</ol>;
    },
    p({ children }) {
      return <p className="mb-2 last:mb-0 leading-relaxed text-content-secondary">{children}</p>;
    },
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-fadeIn">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-accent" />
              {isEn ? 'Chat Audit Logs' : 'Audit Log Percakapan'}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono font-medium">
              Enterprise Compliance
            </span>
          </div>
          <p className="text-xs text-content-muted mt-0.5">
            {isEn
              ? 'Comprehensive conversation inspection, compliance audit trail, and user prompt monitoring.'
              : 'Pantau riwayat percakapan dari seluruh user untuk keperluan audit kepatuhan, inspeksi prompt, dan troubleshooting.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={fetchSessions}
            disabled={loadingSessions}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-surface border border-line hover:bg-surface-hover text-content transition-all cursor-pointer disabled:opacity-50"
            title={isEn ? 'Refresh session list' : 'Segarkan daftar sesi'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin text-accent' : ''}`} />
            <span>{isEn ? 'Refresh' : 'Segarkan'}</span>
          </button>

          <button
            type="button"
            onClick={exportToCSV}
            disabled={filteredSessions.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-accent/15 border border-accent/30 hover:bg-accent/25 text-accent transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            title={isEn ? 'Export filtered sessions to CSV' : 'Ekspor sesi terfilter ke CSV'}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isEn ? 'Export CSV' : 'Ekspor CSV'}</span>
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="p-3.5 rounded-2xl bg-surface border border-line/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] text-content-muted font-medium truncate">
              {isEn ? 'Total Audited Sessions' : 'Total Sesi Diaudit'}
            </p>
            <h4 className="text-lg sm:text-xl font-bold font-mono text-content mt-0.5">
              {metrics.totalSessions}
            </h4>
            <p className="text-[10px] text-content-subtle mt-0.5">
              {isEn ? 'Stored in audit trail' : 'Tercatat dalam basis data'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <History className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-surface border border-line/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] text-content-muted font-medium truncate">
              {isEn ? 'Monitored Messages' : 'Total Pesan Dipantau'}
            </p>
            <h4 className="text-lg sm:text-xl font-bold font-mono text-content mt-0.5">
              {metrics.totalMessages.toLocaleString()}
            </h4>
            <p className="text-[10px] text-content-subtle mt-0.5">
              {isEn ? `~${metrics.avgPerSession} msgs / session` : `Rata-rata ~${metrics.avgPerSession} pesan/sesi`}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-surface border border-line/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] text-content-muted font-medium truncate">
              {isEn ? 'Audited Users' : 'Pengguna Terpantau'}
            </p>
            <h4 className="text-lg sm:text-xl font-bold font-mono text-content mt-0.5">
              {metrics.uniqueUserCount}
            </h4>
            <p className="text-[10px] text-content-subtle mt-0.5">
              {isEn ? 'Active distinct accounts' : 'Akun unik berinteraksi'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-surface border border-line/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[11px] text-content-muted font-medium truncate">
              {isEn ? 'Active Today' : 'Aktivitas Hari Ini'}
            </p>
            <h4 className="text-lg sm:text-xl font-bold font-mono text-content mt-0.5">
              {metrics.activeToday}
            </h4>
            <p className="text-[10px] text-content-subtle mt-0.5">
              {isEn ? 'Sessions in last 24h' : 'Sesi aktif 24 jam terakhir'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Multi-Filter Toolbar */}
      <div className="bg-surface p-3 rounded-2xl border border-line/80 shadow-2xs flex flex-wrap items-center gap-2.5 shrink-0">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] sm:min-w-[260px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-content-subtle" />
          <input
            type="text"
            placeholder={isEn ? 'Search user, title, session ID...' : 'Cari user, judul, ID sesi...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-7 py-1.5 text-xs bg-surface-sunken border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 w-full text-content placeholder:text-content-subtle transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-content-subtle hover:text-content cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* User filter dropdown */}
        <div className="flex items-center gap-1">
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-surface-sunken border border-line rounded-xl text-content focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all cursor-pointer max-w-[160px]"
          >
            <option value="all">{isEn ? 'All Users' : 'Semua User'}</option>
            {uniqueUsers.map((u) => {
              const role = userRoleMap[u.toLowerCase()] || 'user';
              return (
                <option key={u} value={u}>
                  {u} ({getRoleLabel(role, isEn)})
                </option>
              );
            })}
          </select>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-1">
          <select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-surface-sunken border border-line rounded-xl text-content focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all cursor-pointer"
          >
            <option value="all">{isEn ? 'All Time' : 'Semua Waktu'}</option>
            <option value="today">{isEn ? 'Today' : 'Hari Ini'}</option>
            <option value="7d">{isEn ? 'Last 7 Days' : '7 Hari Terakhir'}</option>
            <option value="30d">{isEn ? 'Last 30 Days' : '30 Hari Terakhir'}</option>
          </select>
        </div>

        {/* Sort by */}
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="py-1.5 px-2.5 text-xs bg-surface-sunken border border-line rounded-xl text-content focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all cursor-pointer"
          >
            <option value="newest">{isEn ? 'Newest Activity' : 'Terbaru (Aktivitas)'}</option>
            <option value="oldest">{isEn ? 'Oldest Created' : 'Terlama'}</option>
            <option value="most_messages">{isEn ? 'Most Messages' : 'Pesan Terbanyak'}</option>
            <option value="least_messages">{isEn ? 'Least Messages' : 'Pesan Tersedikit'}</option>
          </select>
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl bg-surface-sunken border border-line hover:bg-surface-hover text-rose-400 transition-all cursor-pointer"
            title={isEn ? 'Reset filters' : 'Reset filter'}
          >
            <X className="w-3 h-3" />
            <span>{isEn ? 'Reset' : 'Atur Ulang'}</span>
          </button>
        )}

        {/* Results counter */}
        <div className="ml-auto text-[11px] text-content-subtle font-mono hidden md:block">
          {isEn
            ? `Showing ${filteredSessions.length} of ${sessions.length} sessions`
            : `Menampilkan ${filteredSessions.length} dari ${sessions.length} sesi`}
        </div>
      </div>

      {/* 4. Split Master-Detail Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3.5 min-h-0">
        {/* Left Pane: Sessions List (4 cols on md, 5 cols on lg) */}
        <div
          className={`${
            selectedSession ? 'hidden md:flex' : 'flex'
          } md:col-span-5 lg:col-span-4 border border-line/80 rounded-2xl flex-col bg-surface shadow-xs overflow-hidden max-h-[62vh] md:max-h-[68vh]`}
        >
          {/* List Header */}
          <div className="px-3.5 py-2.5 border-b border-line bg-surface-sunken/40 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-content flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-accent" />
              {isEn ? 'Session List' : 'Daftar Percakapan'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-line text-content-muted">
              {filteredSessions.length} {isEn ? 'sessions' : 'sesi'}
            </span>
          </div>

          {/* Session Cards Scroll Container */}
          <div className="flex-1 overflow-y-auto divide-y divide-line/60 [scrollbar-width:thin]">
            {loadingSessions && sessions.length === 0 ? (
              <div className="p-3 space-y-3 animate-pulse">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="p-3 rounded-xl bg-surface-sunken/60 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-24 bg-surface-sunken rounded-md" />
                      <div className="h-3 w-14 bg-surface-sunken rounded-md" />
                    </div>
                    <div className="h-3.5 w-44 bg-surface-sunken/80 rounded-md" />
                    <div className="h-3 w-20 bg-surface-sunken/60 rounded-md" />
                  </div>
                ))}
              </div>
            ) : filteredSessions.length > 0 ? (
              filteredSessions.map((s) => {
                const isSelected = selectedSession?.session_id === s.session_id;
                const userRole = userRoleMap[s.username?.toLowerCase()] || 'user';
                const roleBadgeClass = getRoleBadgeStyle(userRole);
                const roleLabel = getRoleLabel(userRole, isEn);
                const initials = getUserInitials({ username: s.username });
                const isToday = (() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  return (s.updated_at || s.created_at || '').slice(0, 10) === todayStr;
                })();

                return (
                  <button
                    key={s.session_id}
                    onClick={() => handleSelectSession(s)}
                    className={`w-full text-left p-3 transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-accent/10 border-l-4 border-accent shadow-xs'
                        : 'hover:bg-surface-hover/70'
                    }`}
                  >
                    {/* Top Row: User avatar, Username, Role badge, and Date */}
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Avatar initials */}
                        <div className="w-6 h-6 rounded-lg bg-surface-sunken border border-line flex items-center justify-center text-[10px] font-bold text-accent shrink-0">
                          {initials}
                        </div>
                        <span className="font-bold text-xs text-content truncate">
                          {s.username}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium border truncate ${roleBadgeClass}`}>
                          {roleLabel}
                        </span>
                      </div>

                      <span className="text-[10px] text-content-subtle font-mono shrink-0">
                        {formatDateTime(s.updated_at || s.created_at)}
                      </span>
                    </div>

                    {/* Session Title */}
                    <p className="text-xs text-content-secondary line-clamp-2 leading-relaxed mb-2 font-medium">
                      {s.title || (isEn ? 'Untitled conversation' : 'Percakapan tanpa judul')}
                    </p>

                    {/* Bottom Row: Message count & ID badge */}
                    <div className="flex items-center justify-between gap-2 text-[10px] text-content-muted">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 font-mono bg-surface-sunken px-2 py-0.5 rounded-md border border-line/60">
                          <MessageSquare className="w-2.5 h-2.5 text-accent" />
                          {s.message_count || 0} {isEn ? 'msgs' : 'pesan'}
                        </span>
                        {isToday && (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {isEn ? 'Today' : 'Hari ini'}
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-[9px] text-content-subtle">
                        #{s.session_id.slice(-6)}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-2">
                <Search className="w-8 h-8 text-content-subtle mx-auto opacity-40" />
                <p className="text-xs font-semibold text-content">
                  {isEn ? 'No sessions found' : 'Tidak ada sesi ditemukan'}
                </p>
                <p className="text-[11px] text-content-muted">
                  {isEn
                    ? 'Try changing or resetting your search and filter criteria.'
                    : 'Coba ubah kata kunci pencarian atau reset filter yang sedang aktif.'}
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 text-xs rounded-xl bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 transition-all cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3 h-3" /> {isEn ? 'Reset Filters' : 'Reset Filter'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Deep Inspection & Transcript Workstation (7 cols on md, 8 cols on lg) */}
        <div
          className={`${
            !selectedSession ? 'hidden md:flex' : 'flex'
          } md:col-span-7 lg:col-span-8 border border-line/80 rounded-2xl flex-col bg-surface-sunken/40 shadow-xs overflow-hidden max-h-[62vh] md:max-h-[68vh]`}
        >
          {selectedSession ? (
            <>
              {/* Sticky Workspace Header */}
              <div className="p-3.5 sm:p-4 border-b border-line/80 bg-surface shrink-0 space-y-3">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="md:hidden flex items-center gap-1.5 text-xs font-bold text-accent hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {isEn ? 'Back to session list' : 'Kembali ke daftar sesi'}
                </button>

                {/* Session Title & Metadata Details */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-accent/15 text-accent border border-accent/30 font-semibold">
                        Audit Inspection
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-content-muted">
                        <span>User:</span>
                        <span className="font-bold text-content">{selectedSession.username}</span>
                        {(() => {
                          const role = userRoleMap[selectedSession.username?.toLowerCase()] || 'user';
                          return (
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${getRoleBadgeStyle(role)}`}>
                              {getRoleLabel(role, isEn)}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <h4 className="font-bold text-sm sm:text-base text-content font-display break-words">
                      {selectedSession.title || (isEn ? 'Untitled conversation' : 'Percakapan tanpa judul')}
                    </h4>

                    {/* Session ID copyable & Timestamps */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-content-subtle pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleCopySessionId(selectedSession.session_id)}
                        className="inline-flex items-center gap-1 font-mono bg-surface-sunken px-2 py-0.5 rounded-md border border-line text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                        title={isEn ? 'Click to copy session ID' : 'Klik untuk menyalin ID sesi'}
                      >
                        <Hash className="w-3 h-3 text-accent" />
                        <span className="max-w-[140px] sm:max-w-[200px] truncate">{selectedSession.session_id}</span>
                        {copiedSessionId ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-60" />
                        )}
                      </button>

                      <span>•</span>
                      <span>
                        {isEn ? 'Created:' : 'Dibuat:'} {formatDateTime(selectedSession.created_at)}
                      </span>
                      {selectedSession.updated_at && (
                        <>
                          <span>•</span>
                          <span>
                            {isEn ? 'Last Active:' : 'Terakhir:'} {formatDateTime(selectedSession.updated_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions: In-Session Search, Copy Transcript, Download .md */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start">
                    <button
                      type="button"
                      onClick={handleCopyTranscript}
                      disabled={loadingMessages || messages.length === 0}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl bg-surface-sunken border border-line hover:bg-surface-hover text-content transition-all cursor-pointer disabled:opacity-50"
                      title={isEn ? 'Copy full conversation transcript as Markdown' : 'Salin seluruh transkrip percakapan format Markdown'}
                    >
                      {copiedTranscript ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">{isEn ? 'Copied' : 'Tersalin'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-content-subtle" />
                          <span>{isEn ? 'Copy MD' : 'Salin MD'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadTranscript}
                      disabled={loadingMessages || messages.length === 0}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-xl bg-surface-sunken border border-line hover:bg-surface-hover text-content transition-all cursor-pointer disabled:opacity-50"
                      title={isEn ? 'Download conversation transcript (.md)' : 'Unduh transkrip percakapan (.md)'}
                    >
                      <Download className="w-3.5 h-3.5 text-content-subtle" />
                      <span>{isEn ? 'Export MD' : 'Unduh MD'}</span>
                    </button>
                  </div>
                </div>

                {/* In-Session Message Search Bar */}
                <div className="relative pt-1">
                  <Search className="w-3 h-3 absolute left-3 top-3 text-content-subtle" />
                  <input
                    type="text"
                    placeholder={isEn ? 'Filter keywords inside this conversation...' : 'Cari kata kunci dalam percakapan ini...'}
                    value={inSessionSearch}
                    onChange={(e) => setInSessionSearch(e.target.value)}
                    className="pl-8 pr-7 py-1 text-xs bg-surface-sunken border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 w-full text-content placeholder:text-content-subtle transition-all"
                  />
                  {inSessionSearch && (
                    <button
                      onClick={() => setInSessionSearch('')}
                      className="absolute right-2.5 top-2.5 text-content-subtle hover:text-content cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Message Transcript Stream */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 [scrollbar-width:thin]">
                {loadingMessages ? (
                  <div className="space-y-4 animate-pulse p-2">
                    <div className="flex justify-end">
                      <div className="h-14 w-2/3 bg-accent/15 rounded-2xl border border-accent/20" />
                    </div>
                    <div className="flex justify-start">
                      <div className="h-24 w-3/4 bg-surface rounded-2xl border border-line" />
                    </div>
                    <div className="flex justify-end">
                      <div className="h-10 w-1/2 bg-accent/15 rounded-2xl border border-accent/20" />
                    </div>
                    <div className="flex justify-start">
                      <div className="h-28 w-4/5 bg-surface rounded-2xl border border-line" />
                    </div>
                  </div>
                ) : filteredMessages.length > 0 ? (
                  filteredMessages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    const initials = getUserInitials({ username: selectedSession.username });
                    const role = userRoleMap[selectedSession.username?.toLowerCase()] || 'user';
                    const roleLabel = getRoleLabel(role, isEn);
                    const showSources = !!showSourcesMap[m.id || idx];

                    return (
                      <div
                        key={m.id || idx}
                        className={`rounded-2xl text-xs leading-relaxed transition-all shadow-2xs border ${
                          isUser
                            ? 'bg-indigo-500/10 border-indigo-500/25 p-3.5 sm:p-4 text-content'
                            : 'bg-surface border-line/90 p-4 sm:p-5 text-content shadow-xs'
                        }`}
                      >
                        {/* Bubble Header */}
                        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-line/60">
                          <div className="flex items-center gap-2.5">
                            {isUser ? (
                              <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0">
                                {initials}
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                                <Sparkles className="w-3.5 h-3.5" />
                              </div>
                            )}

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-content text-xs">
                                {isUser ? selectedSession.username : 'SAP AI Assistant'}
                              </span>
                              {isUser ? (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${getRoleBadgeStyle(role)}`}>
                                  {roleLabel}
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium bg-accent/10 border border-accent/25 text-accent">
                                  AI System
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Feedback indicator */}
                            {!isUser && (m.feedback === 'like' || m.feedback === 'up') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <ThumbsUp className="w-2.5 h-2.5" /> {isEn ? 'Helpful' : 'Membantu'}
                              </span>
                            )}
                            {!isUser && (m.feedback === 'dislike' || m.feedback === 'down') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <ThumbsDown className="w-2.5 h-2.5" /> {isEn ? 'Unhelpful' : 'Kurang Sesuai'}
                              </span>
                            )}

                            {/* Timestamp */}
                            <span className="text-[10px] text-content-subtle font-mono">
                              {formatDateTime(m.created_at)}
                            </span>

                            {/* Copy Message Content Button */}
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(m.id || idx, m.content)}
                              className="p-1 rounded-md hover:bg-surface-hover text-content-subtle hover:text-content transition-colors cursor-pointer"
                              title={isEn ? 'Copy message content' : 'Salin isi pesan'}
                            >
                              {copiedMsgId === (m.id || idx) ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Bubble Content Rendered as Markdown */}
                        <div className="select-text break-words">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>

                        {/* Collapsible RAG Sources / Citations */}
                        {m.sources && Array.isArray(m.sources) && m.sources.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-line/60">
                            <button
                              type="button"
                              onClick={() => {
                                setShowSourcesMap(prev => ({
                                  ...prev,
                                  [m.id || idx]: !prev[m.id || idx]
                                }));
                              }}
                              className="flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                            >
                              <Database className="w-3 h-3" />
                              <span>
                                {showSources
                                  ? (isEn ? 'Hide Knowledge Sources' : 'Sembunyikan Sumber RAG')
                                  : (isEn ? `View ${m.sources.length} Knowledge Sources` : `Lihat ${m.sources.length} Sumber RAG`)}
                              </span>
                              {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            {showSources && (
                              <div className="mt-2 space-y-2 pl-2 border-l-2 border-accent/40">
                                {m.sources.map((src, sIdx) => (
                                  <div key={sIdx} className="p-2 rounded-lg bg-surface-sunken border border-line text-[11px]">
                                    <div className="font-semibold text-content mb-0.5">
                                      {src.title || src.source || `Sumber #${sIdx + 1}`}
                                    </div>
                                    <p className="text-content-secondary line-clamp-2">{src.snippet || src.content || JSON.stringify(src)}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 space-y-2">
                    <Search className="w-8 h-8 text-content-subtle mx-auto opacity-40" />
                    <p className="text-xs text-content font-medium">
                      {inSessionSearch
                        ? (isEn ? 'No messages match your search term.' : 'Tidak ada pesan yang cocok dengan kata kunci pencarian.')
                        : (isEn ? 'No messages found in this session.' : 'Tidak ada pesan tercatat dalam sesi ini.')}
                    </p>
                    {inSessionSearch && (
                      <button
                        onClick={() => setInSessionSearch('')}
                        className="text-xs text-accent hover:underline font-semibold cursor-pointer"
                      >
                        {isEn ? 'Clear search' : 'Hapus pencarian'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Workstation Status Bar */}
              <div className="px-4 py-2 border-t border-line/80 bg-surface text-[10px] text-content-subtle flex items-center justify-between font-mono shrink-0">
                <span>
                  {isEn
                    ? `Showing ${filteredMessages.length} of ${messages.length} messages`
                    : `Menampilkan ${filteredMessages.length} dari ${messages.length} pesan`}
                </span>
                <span className="hidden sm:inline">
                  Audit Protocol: v2.4 • Read-Only
                </span>
              </div>
            </>
          ) : (
            /* Empty State: No Session Selected */
            <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4 my-auto">
              <div className="w-16 h-16 rounded-3xl bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shadow-sm">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h4 className="text-sm font-bold text-content font-display">
                  {isEn ? 'Select a Session to Inspect' : 'Pilih Sesi untuk Memulai Audit'}
                </h4>
                <p className="text-xs text-content-muted leading-relaxed">
                  {isEn
                    ? 'Choose any conversation session from the left column to inspect raw prompts, AI responses, citation sources, and compliance timestamps.'
                    : 'Pilih salah satu percakapan dari daftar di sebelah kiri untuk memeriksa transkrip percakapan lengkap, prompt pengguna, respons model AI, sitasi sumber RAG, dan log kepatuhan.'}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 text-[11px] text-content-subtle font-medium">
                <span className="px-2 py-1 rounded-md bg-surface border border-line">
                  {isEn ? '💡 Tip: Filter by user or date range' : '💡 Tip: Filter berdasarkan pengguna atau rentang tanggal'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
