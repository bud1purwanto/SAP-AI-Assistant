import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SettingsModal from './SettingsModal';
import { 
  Bot, UserCircle, Settings, Trash2, Sun, Moon, LogOut, Shield, 
  Plus, MessageSquare, Menu, X, AlertTriangle, LogIn, ChevronRight,
  Server, Cpu, Database, ChevronDown, RefreshCw
} from 'lucide-react';

const ChatLayout = ({ 
  messages, 
  isThinking, 
  isLoadingSession = false,
  onSendMessage, 
  onClearChat, 
  theme, 
  onToggleTheme, 
  user, 
  onLogout,
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  guestUsedToday,
  onOpenLogin,
  selectedServer = 'sap',
  onSelectServer,
  mcpServers = {},
  onRefreshMcpServers
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isServerDropdownOpen, setIsServerDropdownOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const isLoggedIn = user?.username && user?.username !== 'Guest';

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-200">
      
      {/* Sidebar Histori Chat */}
      <aside 
        className={`fixed md:relative z-30 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 ${
          isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full md:w-0 md:translate-x-0 overflow-hidden border-none'
        }`}
      >
        {/* Top Sidebar Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all active:scale-[0.98] text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
          
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guest Warning / Info Banner */}
        {!isLoggedIn && (
          <div className="mx-3 mt-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-xs mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Guest Mode</span>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
              Batas 1 prompt harian. Login untuk menyimpan histori chat ke PostgreSQL.
            </p>
            <button
              onClick={onOpenLogin}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login Sekarang</span>
            </button>
          </div>
        )}

        {/* Daftar Chat Sessions */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Riwayat Percakapan
          </div>

          {isLoggedIn ? (
            sessions.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                Belum ada percakapan tersimpan.
              </div>
            ) : (
              sessions.map((s) => {
                const isActive = s.session_id === activeSessionId;
                return (
                  <div
                    key={s.session_id}
                    onClick={() => onSelectSession(s.session_id)}
                    className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                    <span className="truncate flex-1">{s.title || 'Percakapan Baru'}</span>
                    
                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.session_id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      title="Hapus percakapan ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )
          ) : (
            <div className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 italic">
              Histori percakapan dinonaktifkan di Guest Mode.
            </div>
          )}
        </div>

        {/* Sidebar Footer User Info */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          {isLoggedIn ? (
            <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <UserCircle className="w-8 h-8 text-blue-500 shrink-0" />
                <div className="truncate">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{user.username}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">{user.role}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all"
            >
              <LogIn className="w-4 h-4 text-blue-500" />
              <span>Login Akun SAP</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-50 dark:bg-slate-950">
        
        {/* Header Bar */}
        <header className="bg-white/80 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Toggle Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="bg-blue-600 p-2 rounded-xl text-white">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight">Enterprise SAP Assistant</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Integrated with SAP ECC 6.0 & RAG
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* SAP Server Selector Dropdown - RAG selalu aktif otomatis */}
            <div className="relative">
              <button
                onClick={() => setIsServerDropdownOpen(!isServerDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 transition-all"
                title="Pilih SAP Server"
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {selectedServer === 'sap'
                    ? 'SAP ECC 6.0 (Default)'
                    : selectedServer.startsWith('sap:')
                      ? `SAP: ${selectedServer.split(':')[1]}`
                      : 'SAP ECC 6.0'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </button>

              {isServerDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsServerDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-30">
                    {/* Dropdown header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pilih SAP Server</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Database className="w-3 h-3 text-purple-400" />
                            RAG Knowledge Base selalu aktif
                          </span>
                        </p>
                      </div>
                      {onRefreshMcpServers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRefreshMcpServers(); }}
                          className="text-slate-400 hover:text-blue-500 transition-colors p-1"
                          title="Refresh Status Server"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* SAP Default option */}
                    <button
                      onClick={() => { if (onSelectServer) onSelectServer('sap'); setIsServerDropdownOpen(false); }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                        selectedServer === 'sap'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Cpu className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold">SAP ECC 6.0 (Default)</p>
                          <p className="text-[10px] text-slate-400">Server SAP aktif saat ini</p>
                        </div>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${mcpServers.sap?.online !== false ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    </button>

                    {/* SAP Sub-servers */}
                    {mcpServers.sap?.sub_servers && mcpServers.sap.sub_servers.length > 0 && (
                      <>
                        <div className="px-3 pt-2 pb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pilih Environment SAP</span>
                        </div>
                        <div className="space-y-0.5">
                          {mcpServers.sap.sub_servers.map((subSrv, idx) => {
                            const alias = subSrv.aliases?.[0] || subSrv.name;
                            const targetKey = `sap:${alias}`;
                            const isSelected = selectedServer === targetKey;
                            return (
                              <button
                                key={idx}
                                onClick={() => { if (onSelectServer) onSelectServer(targetKey); setIsServerDropdownOpen(false); }}
                                className={`w-full flex items-center justify-between p-2 px-3 rounded-xl text-left transition-all ${
                                  isSelected
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <div className="truncate">
                                    <p className="text-xs font-medium truncate">{subSrv.name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{alias} · {subSrv.environment || 'SAP'}</p>
                                  </div>
                                </div>
                                {subSrv.active && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full font-bold shrink-0 ml-1">
                                    Active
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* RAG status (read-only, always on) */}
                    <div className="mt-2 mx-1 p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center gap-2">
                      <Database className="w-4 h-4 text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Manufacturing RAG</p>
                        <p className="text-[10px] text-purple-500 dark:text-purple-400">Knowledge Base · Selalu Aktif</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${mcpServers.rag?.online !== false ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Theme Toggle Button */}
            <button 
              onClick={onToggleTheme}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600" />
              )}
            </button>

            {/* Clear Chat Button */}
            {messages.length > 0 && (
              <button 
                onClick={onClearChat}
                className="p-2 text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors"
                title="Hapus Layar Chat"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            
            {/* Settings Button */}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Settings & Persona"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Chat Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-4xl w-full mx-auto transition-opacity duration-200">
          {isLoadingSession ? (
            /* Smooth Loading Skeleton saat ganti riwayat chat */
            <div className="space-y-6 py-4 animate-pulse">
              {/* User Skeleton Item */}
              <div className="flex justify-end items-start gap-3 my-2">
                <div className="flex flex-col items-end w-2/3">
                  <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded mb-2"></div>
                  <div className="h-14 w-full bg-blue-400/20 dark:bg-blue-900/30 rounded-2xl rounded-tr-none border border-blue-300/30"></div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
              </div>

              {/* AI Skeleton Item */}
              <div className="flex items-start gap-3 my-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                <div className="flex flex-col w-3/4 space-y-2">
                  <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  <div className="p-4 rounded-2xl rounded-tl-none bg-slate-200/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                    <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded w-5/6"></div>
                    <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded w-full"></div>
                    <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded w-4/6"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-4 my-auto min-h-[50vh]">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-lg">
                <Bot className="w-8 h-8" />
              </div>
              <div className="text-center max-w-md">
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Halo{user?.username && user.username !== 'Guest' ? `, ${user.username}` : ''}! Apa yang bisa saya bantu?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tanyakan informasi SAP ECC 6.0, kode ABAP, atau data dari basis pengetahuan RAG Enterprise.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, index) => (
                <ChatMessage key={index} message={msg} />
              ))}
            </div>
          )}
          
          {isThinking && (
            <div className="flex items-start gap-3 my-4 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 mb-1 ml-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  <span>SAP AI Assistant sedang menganalisis data...</span>
                </div>
                <div className="relative px-5 py-3 rounded-2xl shadow-sm text-[15px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none flex gap-1.5 items-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* Input Bar */}
        <div className="shrink-0 max-w-4xl w-full mx-auto px-4 pb-4">
          <ChatInput onSendMessage={onSendMessage} disabled={isThinking} />
        </div>

      </div>
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        user={user}
      />
    </div>
  );
};

export default ChatLayout;