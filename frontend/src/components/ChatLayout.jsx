import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import LoginModal from './LoginModal';
import SettingsModal from './SettingsModal';
import AdminDashboard from './AdminDashboard';
import { 
  Bot, Settings, Moon, Sun, Database, Server, RefreshCw, MessageSquare, 
  Trash2, Plus, LogIn, LogOut, User, Sparkles, ChevronRight, ShieldAlert,
  ShieldCheck, Search, BarChart2, Layers, Cpu
} from 'lucide-react';

const ChatLayout = () => {
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeServer, setActiveServer] = useState('sap:sandbox-new');
  const [sapSubServers, setSapSubServers] = useState([]);
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end'
      });
    }
  };

  // Auth state
  const [user, setUser] = useState({ username: 'Guest', role: 'guest' });
  const [promptCount, setPromptCount] = useState(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [customLoginMsg, setCustomLoginMsg] = useState('');

  // Initial setup: theme & load user
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const fetchServers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/mcp/servers');
      if (res.ok) {
        const data = await res.json();
        if (data?.sap?.sub_servers && Array.isArray(data.sap.sub_servers)) {
          setSapSubServers(data.sap.sub_servers);
          const activeOne = data.sap.sub_servers.find(s => s.active);
          if (activeOne) {
            const preferredAlias = activeOne.aliases?.[0] || activeOne.name.toLowerCase().replace(/\s+/g, '-');
            setActiveServer(`sap:${preferredAlias}`);
          }
        }
      }
    } catch (e) {
      console.error("Gagal mengambil data server MCP:", e);
    }
  };

  // Load user & fetch MCP server list on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('sap_assistant_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
      } catch (e) {}
    }
    const today = new Date().toISOString().slice(0, 10);
    const savedDate = localStorage.getItem('guest_prompt_date');
    if (savedDate === today) {
      const count = parseInt(localStorage.getItem('guest_prompt_count') || '0', 10);
      setPromptCount(count);
    } else {
      localStorage.setItem('guest_prompt_date', today);
      localStorage.setItem('guest_prompt_count', '0');
      setPromptCount(0);
    }

    fetchServers();
  }, []);

  // Auto-scroll ke bawah saat ada pesan baru atau loading state berubah
  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isLoading]);

  // Fetch session history when user changes
  useEffect(() => {
    fetchSessions();
  }, [user]);

  const fetchSessions = async (keepCurrentId = false) => {
    if (!user || user.role === 'guest') {
      setSessions([]);
      setIsSessionsLoading(false);
      setCurrentSessionId('guest-session');
      setMessages([
        {
          role: 'assistant',
          content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
        }
      ]);
      return;
    }

    setIsSessionsLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sessions', {
        headers: { 'X-User-Name': user?.username || 'Guest' }
      });
      const data = await res.json();
      setSessions(data || []);
      
      if (data && data.length > 0) {
        if (!keepCurrentId || !currentSessionId) {
          const firstId = data[0].session_id;
          loadSession(firstId);
        }
      } else {
        // Belum ada session di database
        setCurrentSessionId(null);
        setMessages([
          {
            role: 'assistant',
            content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
          }
        ]);
      }
    } catch (err) {
      console.error("Gagal mengambil daftar session:", err);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const loadSession = async (sessionId) => {
    if (!sessionId) return;
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/history/${sessionId}`, {
        headers: { 'X-User-Name': user?.username || 'Guest' }
      });
      const data = await res.json();
      if (!data || data.length === 0) {
        setMessages([
          {
            role: 'assistant',
            content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
          }
        ]);
      } else {
        const formatted = data.map(m => {
          let parsedSources = [];
          if (m.sources) {
            try {
              parsedSources = typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources;
            } catch (e) {
              parsedSources = [];
            }
          }
          return {
            role: m.role,
            content: m.content,
            sources: parsedSources
          };
        });
        setMessages(formatted);
      }
    } catch (err) {
      console.error("Gagal memuat percakapan:", err);
    }
  };

  const createNewSession = async () => {
    if (user.role === 'guest') {
      setCurrentSessionId('guest-session-' + Date.now());
      setMessages([
        {
          role: 'assistant',
          content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
        }
      ]);
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/sessions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Name': user?.username || 'Guest'
        },
        body: JSON.stringify({ title: 'Percakapan Baru' })
      });
      const data = await res.json();
      if (data && data.session_id) {
        setSessions(prev => [data, ...prev]);
        setCurrentSessionId(data.session_id);
        setMessages([
          {
            role: 'assistant',
            content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
          }
        ]);
      }
    } catch (err) {
      console.error("Gagal membuat sesi baru:", err);
    }
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await fetch(`http://127.0.0.1:8000/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'X-User-Name': user?.username || 'Guest' }
      });
      const remaining = sessions.filter(s => s.session_id !== sessionId);
      setSessions(remaining);
      if (currentSessionId === sessionId) {
        if (remaining.length > 0) {
          loadSession(remaining[0].session_id);
        } else {
          setCurrentSessionId(null);
          setMessages([
            {
              role: 'assistant',
              content: 'Halo! Saya **SAP AI Assistant**. Ada yang bisa saya bantu terkait SAP ECC atau Knowledge Base hari ini?'
            }
          ]);
        }
      }
    } catch (err) {
      console.error("Gagal menghapus session:", err);
    }
  };

  const handleSendMessage = async (text) => {
    if (user.role === 'guest' && promptCount >= 1) {
      setCustomLoginMsg('Batas limit akun Guest tercapai (1 prompt/hari). Silakan login dengan akun SAP untuk akses tanpa batas.');
      setIsLoginModalOpen(true);
      return;
    }

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setIsLoading(true);

    if (user.role === 'guest') {
      const newCount = promptCount + 1;
      setPromptCount(newCount);
      localStorage.setItem('guest_prompt_count', newCount.toString());
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Name': user?.username || 'Guest'
        },
        body: JSON.stringify({
          message: text,
          session_id: currentSessionId,
          active_server: activeServer
        })
      });

      const data = await res.json();
      setMessages([...newMessages, {
        role: 'assistant',
        content: data.reply,
        sources: data.sources || []
      }]);
      
      if (data.session_id) {
        setCurrentSessionId(data.session_id);
      }
      
      // Refresh list session tanpa me-reset chat aktif
      if (user.role !== 'guest') {
        const sessRes = await fetch('http://127.0.0.1:8000/api/sessions', {
          headers: { 'X-User-Name': user?.username || 'Guest' }
        });
        const sessData = await sessRes.json();
        setSessions(sessData || []);
      }
    } catch (err) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: '⚠️ Maaf, terjadi kesalahan saat menghubungi server backend SAP Assistant.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    localStorage.setItem('sap_assistant_user', JSON.stringify(userData));
    setIsLoginModalOpen(false);
  };

  const handleLogout = () => {
    setUser({ username: 'Guest', role: 'guest' });
    localStorage.removeItem('sap_assistant_user');
    setPromptCount(0);
    setSessions([]);
    createNewSession();
  };

  const isLimitReached = user.role === 'guest' && promptCount >= 1;

  // Suggestion chips templates
  const suggestions = [
    { title: "Cek Stock Material", query: "Cek stock material 100-100 di plant 1000", icon: Layers },
    { title: "Status Purchase Order", query: "Cek status PO nomor 4500000001", icon: Search },
    { title: "Panduan T-Code ME21N", query: "Jelaskan langkah-langkah membuat Purchase Order di ME21N", icon: BarChart2 },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors duration-200">
      
      {/* ================= SIDEBAR ================= */}
      <aside className="w-72 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-r border-slate-200/80 dark:border-zinc-800/80 flex flex-col z-20 shrink-0">
        
        {/* Header App Branding */}
        <div className="p-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white font-bold text-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight font-display text-slate-900 dark:text-white">SAP AI Co-Pilot</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-400 uppercase tracking-wider">ECC & RAG Ready</span>
              </div>
            </div>
          </div>
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-xs font-bold shadow-sm transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Chat Baru</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5 py-1">
          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            Riwayat Percakapan
          </div>

          {isSessionsLoading ? (
            <div className="space-y-2 p-2">
              <div className="h-9 bg-slate-200/70 dark:bg-zinc-800/60 rounded-xl animate-pulse"></div>
              <div className="h-9 bg-slate-200/70 dark:bg-zinc-800/60 rounded-xl animate-pulse w-4/5"></div>
              <div className="h-9 bg-slate-200/70 dark:bg-zinc-800/60 rounded-xl animate-pulse w-3/4"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Belum ada percakapan
            </div>
          ) : (
            sessions.map(session => {
              const sid = session.session_id || session.id;
              const isActive = sid === currentSessionId;
              return (
                <div
                  key={sid}
                  onClick={() => loadSession(sid)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                    isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200/60 dark:border-indigo-800/50 shadow-xs' 
                      : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100/80 dark:hover:bg-zinc-800/50 hover:text-slate-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className="truncate">{session.title || 'Percakapan SAP'}</span>
                  </div>
                  
                  <button 
                    onClick={(e) => deleteSession(e, sid)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded-lg transition-opacity"
                    title="Hapus percakapan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* User Account / Profile Box in Sidebar Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40">
          {/* Tombol Super Admin Dashboard jika user adalah superadmin */}
          {user?.role === 'superadmin' && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500/10 to-indigo-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all mb-2 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <span>Admin Dashboard</span>
              </div>
              <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">SUPER</span>
            </button>
          )}
          <div className="flex items-center justify-between bg-white dark:bg-zinc-800/60 p-2.5 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-slate-800 dark:text-zinc-200">{user.username}</div>
                <div className="text-[10px] text-slate-400 capitalize">{user.role || 'Guest'}</div>
              </div>
            </div>
            
            {user.role === 'guest' ? (
              <button 
                onClick={() => { setCustomLoginMsg(''); setIsLoginModalOpen(true); }}
                className="p-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Login SAP"
              >
                <LogIn className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </aside>

      {/* ================= MAIN CHAT AREA ================= */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-zinc-950 relative overflow-hidden">
        
        {/* Top Floating Glass Header */}
        <header className="h-14 bg-white/75 dark:bg-zinc-900/75 backdrop-blur-xl border-b border-slate-200/70 dark:border-zinc-800/70 px-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 font-mono">TARGET SAP:</span>
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 p-0.5 rounded-xl border border-slate-200/60 dark:border-zinc-700/60">
              {sapSubServers && sapSubServers.length > 0 ? (
                <div className="flex items-center gap-1">
                  <select
                    value={activeServer}
                    onChange={(e) => setActiveServer(e.target.value)}
                    className="bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-bold py-1 px-3 rounded-lg border border-slate-200/80 dark:border-zinc-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {sapSubServers.map((srv) => {
                      const alias = srv.aliases?.[0] || srv.name.toLowerCase().replace(/\s+/g, '-');
                      const val = `sap:${alias}`;
                      return (
                        <option key={srv.number} value={val}>
                          {srv.number}. {srv.name} ({srv.sid}) {srv.production_warning ? '⚠️ PROD' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <button 
                    onClick={() => setActiveServer('sap')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeServer === 'sap' || activeServer === 'ALL'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs' 
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                    title="Gunakan server SAP default"
                  >
                    Default
                  </button>
                </div>
              ) : (
                <div className="flex items-center">
                  <button 
                    onClick={() => setActiveServer('sap:sandbox-new')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeServer.includes('sandbox-new')
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs' 
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    Sandbox New (TRS)
                  </button>
                  <button 
                    onClick={() => setActiveServer('sap:dev')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeServer.includes('dev')
                        ? 'bg-white dark:bg-zinc-700 text-teal-600 dark:text-teal-300 shadow-xs' 
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    Dev AIX (TRD)
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 transition-all"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Guest Quota Banner Alert if limit reached */}
        {isLimitReached && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Limit prompt akun Guest telah habis untuk hari ini. Masuk dengan akun SAP untuk terus bertanya.</span>
            </div>
            <button 
              onClick={() => setIsLoginModalOpen(true)}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg transition-all"
            >
              Login Sekarang
            </button>
          </div>
        )}

        {/* Message Content Scroll Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-4">
            
            {messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))}

            {/* AI Thinking Animation Indicator */}
            {isLoading && (
              <div className="flex items-start gap-3.5 my-4 animate-in fade-in duration-200">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-indigo-500 p-[1.5px] shadow-sm mt-1">
                  <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center text-emerald-400">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                  </div>
                </div>
                <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 rounded-3xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 font-mono">
                    Menghubungi SAP MCP Server & RAG Engine...
                  </span>
                </div>
              </div>
            )}

            {/* Quick Action Suggestion Chips for Empty or Fresh State */}
            {messages.length <= 1 && !isLoading && (
              <div className="pt-8 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center p-3 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400 mb-3">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-zinc-200 font-display">Pilih Rekomendasi Pertanyaan</h3>
                  <p className="text-xs text-slate-400 mt-1">Klik salah satu template di bawah untuk memulai pencarian cepat</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {suggestions.map((item, idx) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(item.query)}
                        className="flex flex-col text-left p-4 rounded-2xl bg-white/70 dark:bg-zinc-900/70 hover:bg-white dark:hover:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-500/50 shadow-xs hover:shadow-md transition-all group active:scale-[0.98]"
                      >
                        <div className="p-2 w-fit rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/60 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-3">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.title}</span>
                        <span className="text-[11px] text-slate-400 mt-1 line-clamp-2">{item.query}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Anchor element untuk auto-scroll ke bawah */}
            <div ref={messagesEndRef} className="h-1" />

          </div>
        </div>

        {/* Input Bar Island */}
        <ChatInput 
          onSendMessage={handleSendMessage} 
          isLoading={isLoading} 
          isLimitReached={isLimitReached}
          onPromptLimitHit={() => {
            setCustomLoginMsg('Batas limit akun Guest tercapai (1 prompt/hari). Silakan login dengan akun SAP untuk akses tanpa batas.');
            setIsLoginModalOpen(true);
          }}
        />

      </main>

      {/* Modals */}
      <LoginModal 
        isOpen={isLoginModalOpen}
        onLoginSuccess={handleLoginSuccess}
        onGuestContinue={() => setIsLoginModalOpen(false)}
        customMessage={customLoginMsg}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />

      <AdminDashboard
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        user={user}
        onRefreshMcpServers={fetchServers}
      />

    </div>
  );
};

export default ChatLayout;