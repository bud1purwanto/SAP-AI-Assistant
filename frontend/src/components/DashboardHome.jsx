import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Server,
  Database,
  BookOpen,
  Mail,
  Lock,
  Check,
  ChevronDown,
  Clock,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const aliasOf = (srv) => srv?.alias || srv?.aliases?.[0] || srv?.name?.toLowerCase()?.replace(/\s+/g, '-') || srv?.sid?.toLowerCase() || 'default';

export default function DashboardHome({
  user,
  onStartChat,
  onSelectPrompt,
  recentSessions = [],
  connectorConfig = { enabled: ['sap', 'rag'] },
  onConnectorToggle,
  onServerChange,
  activeServer = '',
  sapSubServers = [],
  sqlSubServers = [],
  mcpStatus = null,
  connectorAccess,
  lookupMcpAccessTarget,
  mcpAccessTargets = [],
  onRequestAccess,
  onLoadSession,
}) {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSapDropdownOpen, setIsSapDropdownOpen] = useState(false);
  const [isSqlDropdownOpen, setIsSqlDropdownOpen] = useState(false);

  const sapDropdownRef = useRef(null);
  const sqlDropdownRef = useRef(null);

  // Tutup dropdown jika pengguna mengklik di luar area dropdown (click-outside)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sapDropdownRef.current && !sapDropdownRef.current.contains(e.target)) {
        setIsSapDropdownOpen(false);
      }
      if (sqlDropdownRef.current && !sqlDropdownRef.current.contains(e.target)) {
        setIsSqlDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const firstName = user?.full_name
    ? String(user.full_name).trim().split(' ')[0]
    : user?.username && user.username !== 'Guest'
    ? user.username
    : 'Budi';

  // Format timestamp singkat (contoh "14:10")
  const formatTime = (dateStr) => {
    if (!dateStr) return '14:10';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '14:10';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '14:10';
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      if (onSelectPrompt) {
        onSelectPrompt(searchQuery.trim());
      } else if (onStartChat) {
        onStartChat(searchQuery.trim());
      }
    } else if (onStartChat) {
      onStartChat();
    }
  };

  // Target Server Aktif
  const activeSystem = activeServer.startsWith('sql:') ? 'sql' : activeServer.startsWith('sap:') ? 'sap' : '';
  const activeInstanceAlias = activeServer.includes(':') ? activeServer.split(':')[1] : activeServer;

  const currentSapServer = activeSystem === 'sap'
    ? sapSubServers.find((s) => aliasOf(s) === activeInstanceAlias)
    : null;
  const currentSqlServer = activeSystem === 'sql'
    ? sqlSubServers.find((s) => aliasOf(s) === activeInstanceAlias || s.name === activeInstanceAlias)
    : null;

  const recentChatList = Array.isArray(recentSessions) ? recentSessions.slice(0, 5) : [];

  const isSapEnabled = connectorConfig.enabled.includes('sap');
  const isRagEnabled = connectorConfig.enabled.includes('rag');
  const isSqlEnabled = connectorConfig.enabled.includes('sql');
  const isEmailEnabled = connectorConfig.enabled.includes('email');

  // Cek otorisasi akses per konektor
  const sapAccess = connectorAccess ? connectorAccess('sap') : { approvedTarget: true };
  const ragAccess = connectorAccess ? connectorAccess('rag') : { approvedTarget: true };
  const sqlAccess = connectorAccess ? connectorAccess('sql') : { approvedTarget: true };
  const emailAccess = connectorAccess ? connectorAccess('email') : { approvedTarget: true };

  const isSapLocked = !sapAccess?.approvedTarget;
  const isRagLocked = !ragAccess?.approvedTarget;
  const isSqlLocked = !sqlAccess?.approvedTarget;
  const isEmailLocked = !emailAccess?.approvedTarget;

  // Helper untuk mengecek apakah server tertentu di-approve
  const getServerAccess = (srv) => {
    if (!lookupMcpAccessTarget) return { isLocked: false, isPending: false, isRejected: false, target: null };
    const entry = lookupMcpAccessTarget(srv);
    const isLocked = !entry || entry.accessState !== 'approved';
    const isPending = entry?.accessState === 'pending';
    const isRejected = entry?.accessState === 'rejected';
    return { isLocked, isPending, isRejected, target: entry };
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-surface overscroll-contain relative">
      <div 
        className="w-full max-w-xl lg:max-w-5xl mx-auto flex flex-col lg:!pb-12 px-3 sm:px-6 lg:px-8 animate-fadeIn"
        style={{
          paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.75rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)',
        }}
      >
        
        {/* 1. Header Dome Melengkung persis Mockup (Lebih luas & rapi di Desktop) */}
        <div className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-[#EEF5FF] dark:bg-slate-800/90 border border-blue-100 dark:border-slate-700/80 p-5 sm:p-7 lg:p-8 shadow-xs mb-5 sm:mb-6">
          {/* Motif Garis Lingkaran Halus */}
          <div className="absolute -right-8 -top-8 w-48 h-48 lg:w-64 lg:h-64 rounded-full border border-blue-200/50 dark:border-slate-700/50 pointer-events-none" />
          <div className="absolute -right-2 -top-2 w-32 h-32 lg:w-44 lg:h-44 rounded-full border border-blue-200/40 dark:border-slate-700/40 pointer-events-none" />
          <div className="absolute -left-6 -bottom-6 w-36 h-36 lg:w-48 lg:h-48 rounded-full border border-blue-200/30 dark:border-slate-700/30 pointer-events-none" />

          {/* Top greeting + Robot Mascot */}
          <div className="flex items-start justify-between gap-4 relative z-10 mb-4 sm:mb-6">
            <div className="min-w-0 pr-2">
              <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 block tracking-tight">
                {language === 'en' ? 'Welcome,' : 'Selamat Datang,'}
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight leading-tight mt-0.5">
                {language === 'en' ? `Hello, ${firstName}!` : `Halo, ${firstName}!`}
              </h2>
              <p className="text-xs sm:text-sm lg:text-base text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                {language === 'en' ? 'Any module you want to verify today?' : 'Ada modul yang ingin Anda verifikasi?'}
              </p>
            </div>

            {/* Robot Avatar Widget persis Mockup */}
            <div className="shrink-0 relative w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-white dark:bg-slate-900 rounded-[22px] lg:rounded-[26px] shadow-sm border border-blue-100/80 dark:border-slate-700 flex flex-col items-center justify-center p-1.5 lg:p-2 transition-transform hover:scale-105">
              {/* Green Online Dot */}
              <span className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 absolute -top-0.5 -right-0.5 shadow-2xs" title="Online" />
              
              {/* Robot Visor */}
              <div className="w-10 h-7 sm:w-11 sm:h-7.5 lg:w-14 lg:h-9 bg-[#141C2E] rounded-xl lg:rounded-2xl flex items-center justify-center gap-2 lg:gap-2.5 shadow-inner">
                <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]" />
                <span className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]" />
              </div>
              <div className="w-3.5 lg:w-5 h-0.5 lg:h-1 bg-slate-300 dark:bg-slate-600 rounded-full mt-1 opacity-70" />
            </div>
          </div>

          {/* Search Bar persis Mockup */}
          <form onSubmit={handleSearchSubmit} className="relative z-10 w-full max-w-2xl">
            <div className="relative flex items-center bg-white dark:bg-slate-900 rounded-full px-4 sm:px-5 py-2.5 sm:py-3.5 shadow-xs border border-blue-100/80 dark:border-slate-700 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 dark:text-slate-500 shrink-0 mr-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'en' ? 'Search SOP, Material, PO...' : 'Cari SOP, Material, PO...'}
                className="w-full bg-transparent text-xs sm:text-sm lg:text-base text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none pr-12 min-w-0"
              />
              <div className="absolute right-2.5 sm:right-3.5 flex items-center">
                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700 font-mono tracking-wider">
                  ⌘K
                </span>
              </div>
            </div>
          </form>
        </div>

        {/* Desktop 2-Column Split: Kiri = MCP Connectors, Kanan = Recent History & Start Assistant */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          
          {/* SISI KIRI (Col 7 di Desktop): Layanan MCP */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                {language === 'en' ? 'MCP Connectors' : 'Layanan MCP Terkoneksi'}
              </h3>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                {language === 'en' ? 'Active Target Hub' : 'Pilihan Target Server'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
            
            {/* Card 1: SAP ERP Live + Dropdown Server Terintegrasi */}
            <div className={`flex flex-col justify-between p-3.5 sm:p-4 rounded-[22px] sm:rounded-[26px] border transition-all ${
              isSapDropdownOpen ? 'relative z-30 shadow-md ring-2 ring-blue-400/30' : 'relative z-10'
            } ${
              isSapLocked
                ? 'bg-slate-50/90 dark:bg-slate-800/60 border-amber-200/60 dark:border-amber-900/40'
                : isSapEnabled
                ? 'bg-[#F2F7FF] dark:bg-slate-800/90 border-blue-200 dark:border-blue-700/60 shadow-xs'
                : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 shadow-2xs border border-blue-100/60 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-lg">📦</span>
                    {isSapLocked && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs" title={t('mcp.statusLocked')}>
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  
                  {/* Toggle Aktifkan SAP / Request Access */}
                  {isSapLocked ? (
                    <button
                      type="button"
                      onClick={() => onRequestAccess && onRequestAccess(sapAccess?.requestableTarget || { serverType: 'sap', name: 'SAP ERP' })}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                      title={t('mcp.requestAccess')}
                    >
                      <Lock className="w-2.5 h-2.5" />
                      <span>{t('mcp.statusLocked')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnectorToggle && onConnectorToggle('sap')}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isSapEnabled
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                      title={isSapEnabled ? 'Nonaktifkan SAP' : 'Aktifkan SAP'}
                    >
                      {isSapEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    SAP ERP Live
                  </h4>
                  {isSapLocked && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 leading-none">
                      {t('mcp.statusLocked')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {language === 'en' ? 'Stock, PR/PO, Vendor' : 'Stok Plant, PR/PO, Vendor'}
                </p>
              </div>

              {/* Selector Server SAP dengan Dropdown Langsung Terhubung ke Chat */}
              <div ref={sapDropdownRef} className="mt-3 pt-2 border-t border-blue-100/60 dark:border-slate-700/60 relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSapDropdownOpen(!isSapDropdownOpen);
                    setIsSqlDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                    currentSapServer
                      ? 'bg-white dark:bg-slate-900 border-blue-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                      : 'bg-white/90 dark:bg-slate-900/90 border-dashed border-blue-300 dark:border-blue-600/60 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    {currentSapServer ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{currentSapServer.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-400/80 shrink-0 animate-pulse" />
                        <span className="truncate italic font-medium">
                          {language === 'en' ? 'Select SAP Server' : 'Pilih Server SAP'}
                        </span>
                      </>
                    )}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isSapDropdownOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {isSapDropdownOpen && sapSubServers.length > 0 && (
                  <div className="absolute left-0 bottom-full mb-1.5 w-full min-w-[220px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-blue-200 dark:border-slate-700 p-1.5 z-50 animate-fadeIn max-h-56 overflow-y-auto ring-1 ring-black/5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
                      <span>PILIH SERVER SAP</span>
                      {activeServer && activeServer.startsWith('sap:') && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onServerChange) onServerChange('');
                            setIsSapDropdownOpen(false);
                          }}
                          className="text-[9px] font-bold text-rose-500 hover:text-rose-600 transition-colors lowercase cursor-pointer"
                        >
                          {language === 'en' ? 'unselect' : 'lepas'}
                        </button>
                      )}
                    </div>
                    {/* Opsi Tanpa Server */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onServerChange) onServerChange('');
                        setIsSapDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition-colors cursor-pointer mb-1 border-b border-slate-100 dark:border-slate-700/50 pb-1.5 ${
                        !currentSapServer
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate italic flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span>{language === 'en' ? 'None (Select SAP Server)' : 'Belum Dipilih (Pilih Server SAP)'}</span>
                      </span>
                      {!currentSapServer && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                    </button>
                    {sapSubServers.map((srv) => {
                      const srvAlias = aliasOf(srv);
                      const isSelected = activeServer === `sap:${srvAlias}`;
                      const { isLocked: srvLocked, isPending: srvPending, target: srvTarget } = getServerAccess(srv);
                      return (
                        <button
                          key={srv.number || srvAlias}
                          type="button"
                          onClick={() => {
                            if (srvLocked) {
                              if (onRequestAccess && srvTarget) {
                                onRequestAccess({
                                  connectionId: srvTarget.connectionId,
                                  name: srv.name,
                                  serverType: 'sap',
                                });
                              }
                              return;
                            }
                            if (onServerChange) onServerChange(`sap:${srvAlias}`);
                            setIsSapDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition-colors cursor-pointer ${
                            srvLocked
                              ? 'opacity-70 text-slate-400 hover:bg-amber-500/10'
                              : isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <span className="truncate">{srv.name}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {srvLocked && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded">
                                <Lock className="w-2.5 h-2.5" />
                                {srvPending ? t('mcp.statusPending') : t('mcp.statusLocked')}
                              </span>
                            )}
                            {isSelected && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Dokumen SOP (RAG Knowledge) */}
            <div
              onClick={() => {
                if (isRagLocked) {
                  if (onRequestAccess) {
                    onRequestAccess(ragAccess?.requestableTarget || { serverType: 'rag', name: 'RAG Knowledge' });
                  }
                  return;
                }
                if (onConnectorToggle) onConnectorToggle('rag');
              }}
              className={`relative z-10 flex flex-col justify-between p-3.5 sm:p-4 rounded-[22px] sm:rounded-[26px] border transition-all cursor-pointer ${
                isRagLocked
                  ? 'bg-slate-50/90 dark:bg-slate-800/60 border-amber-200/60 dark:border-amber-900/40'
                  : isRagEnabled
                  ? 'bg-[#F2F7FF] dark:bg-slate-800/90 border-blue-200 dark:border-blue-700/60 shadow-xs'
                  : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 shadow-2xs border border-blue-100/60 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-lg">📑</span>
                    {isRagLocked && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs" title={t('mcp.statusLocked')}>
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  
                  {isRagLocked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Lock className="w-2.5 h-2.5" />
                      <span>{t('mcp.statusLocked')}</span>
                    </span>
                  ) : (
                    <span
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-colors ${
                        isRagEnabled
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isRagEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    {language === 'en' ? 'SOP Documents' : 'Dokumen SOP'}
                  </h4>
                  {isRagLocked && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 leading-none">
                      {t('mcp.statusLocked')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {language === 'en' ? 'RAG Knowledge Base' : 'RAG Knowledge Base & Kebijakan'}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-blue-100/60 dark:border-slate-700/60 flex items-center justify-between">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isRagLocked
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                  {language === 'en' ? 'Knowledge Base' : 'Basis Pengetahuan'}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {isRagLocked ? (language === 'en' ? 'Locked' : 'Terkunci') : (language === 'en' ? 'Active' : 'Aktif')}
                </span>
              </div>
            </div>

            {/* Card 3: SQL Database + Dropdown Server Terintegrasi */}
            <div className={`flex flex-col justify-between p-3.5 sm:p-4 rounded-[22px] sm:rounded-[26px] border transition-all ${
              isSqlDropdownOpen ? 'relative z-30 shadow-md ring-2 ring-blue-400/30' : 'relative z-10'
            } ${
              isSqlLocked
                ? 'bg-slate-50/90 dark:bg-slate-800/60 border-amber-200/60 dark:border-amber-900/40'
                : isSqlEnabled
                ? 'bg-[#F2F7FF] dark:bg-slate-800/90 border-blue-200 dark:border-blue-700/60 shadow-xs'
                : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 shadow-2xs border border-blue-100/60 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-lg">📊</span>
                    {isSqlLocked && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs" title={t('mcp.statusLocked')}>
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  
                  {/* Toggle Aktifkan SQL / Request Access */}
                  {isSqlLocked ? (
                    <button
                      type="button"
                      onClick={() => onRequestAccess && onRequestAccess(sqlAccess?.requestableTarget || { serverType: 'sql', name: 'SQL Database' })}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                      title={t('mcp.requestAccess')}
                    >
                      <Lock className="w-2.5 h-2.5" />
                      <span>{t('mcp.statusLocked')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnectorToggle && onConnectorToggle('sql')}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        isSqlEnabled
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                      title={isSqlEnabled ? 'Nonaktifkan SQL' : 'Aktifkan SQL'}
                    >
                      {isSqlEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    SQL Database
                  </h4>
                  {isSqlLocked && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 leading-none">
                      {t('mcp.statusLocked')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {language === 'en' ? 'Live Analytics Engine' : 'Analisis Data & Query SQL'}
                </p>
              </div>

              {/* Selector Server SQL dengan Dropdown Langsung Terhubung ke Chat */}
              <div ref={sqlDropdownRef} className="mt-3 pt-2 border-t border-blue-100/60 dark:border-slate-700/60 relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsSqlDropdownOpen(!isSqlDropdownOpen);
                    setIsSapDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                    currentSqlServer
                      ? 'bg-white dark:bg-slate-900 border-blue-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                      : 'bg-white/90 dark:bg-slate-900/90 border-dashed border-blue-300 dark:border-blue-600/60 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                  }`}
                >
                  <span className="truncate flex items-center gap-1.5">
                    {currentSqlServer ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{currentSqlServer.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-blue-400/80 shrink-0 animate-pulse" />
                        <span className="truncate italic font-medium">
                          {language === 'en' ? 'Select SQL Database' : 'Pilih Database SQL'}
                        </span>
                      </>
                    )}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isSqlDropdownOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {isSqlDropdownOpen && sqlSubServers.length > 0 && (
                  <div className="absolute left-0 bottom-full mb-1.5 w-full min-w-[220px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-blue-200 dark:border-slate-700 p-1.5 z-50 animate-fadeIn max-h-56 overflow-y-auto ring-1 ring-black/5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
                      <span>PILIH DATABASE SQL</span>
                      {activeServer && activeServer.startsWith('sql:') && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onServerChange) onServerChange('');
                            setIsSqlDropdownOpen(false);
                          }}
                          className="text-[9px] font-bold text-rose-500 hover:text-rose-600 transition-colors lowercase cursor-pointer"
                        >
                          {language === 'en' ? 'unselect' : 'lepas'}
                        </button>
                      )}
                    </div>
                    {/* Opsi Tanpa Database */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onServerChange) onServerChange('');
                        setIsSqlDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition-colors cursor-pointer mb-1 border-b border-slate-100 dark:border-slate-700/50 pb-1.5 ${
                        !currentSqlServer
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate italic flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span>{language === 'en' ? 'None (Select SQL Database)' : 'Belum Dipilih (Pilih Database SQL)'}</span>
                      </span>
                      {!currentSqlServer && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                    </button>
                    {sqlSubServers.map((srv) => {
                      const srvName = srv.name || aliasOf(srv);
                      const isSelected = activeServer === `sql:${srvName}`;
                      const { isLocked: srvLocked, isPending: srvPending, target: srvTarget } = getServerAccess(srv);
                      return (
                        <button
                          key={srv.number || srvName}
                          type="button"
                          onClick={() => {
                            if (srvLocked) {
                              if (onRequestAccess && srvTarget) {
                                onRequestAccess({
                                  connectionId: srvTarget.connectionId,
                                  name: srv.name,
                                  serverType: 'sql',
                                });
                              }
                              return;
                            }
                            if (onServerChange) onServerChange(`sql:${srvName}`);
                            setIsSqlDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-[11px] font-medium transition-colors cursor-pointer ${
                            srvLocked
                              ? 'opacity-70 text-slate-400 hover:bg-amber-500/10'
                              : isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <span className="truncate">{srv.name}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {srvLocked && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded">
                                <Lock className="w-2.5 h-2.5" />
                                {srvPending ? t('mcp.statusPending') : t('mcp.statusLocked')}
                              </span>
                            )}
                            {isSelected && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Email Assistant */}
            <div
              onClick={() => {
                if (isEmailLocked) {
                  if (onRequestAccess) {
                    onRequestAccess(emailAccess?.requestableTarget || { serverType: 'email', name: 'Email Gateway' });
                  }
                  return;
                }
                if (onConnectorToggle) onConnectorToggle('email');
              }}
              className={`relative z-10 flex flex-col justify-between p-3.5 sm:p-4 rounded-[22px] sm:rounded-[26px] border transition-all cursor-pointer ${
                isEmailLocked
                  ? 'bg-slate-50/90 dark:bg-slate-800/60 border-amber-200/60 dark:border-amber-900/40'
                  : isEmailEnabled
                  ? 'bg-[#F2F7FF] dark:bg-slate-800/90 border-blue-200 dark:border-blue-700/60 shadow-xs'
                  : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 shadow-2xs border border-blue-100/60 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-lg">📬</span>
                    {isEmailLocked && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs" title={t('mcp.statusLocked')}>
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  
                  {isEmailLocked ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Lock className="w-2.5 h-2.5" />
                      <span>{t('mcp.statusLocked')}</span>
                    </span>
                  ) : (
                    <span
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-colors ${
                        isEmailEnabled
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'border-2 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isEmailEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Email Assistant
                  </h4>
                  {isEmailLocked && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 leading-none">
                      {t('mcp.statusLocked')}
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                  {language === 'en' ? 'Enterprise Mail Services' : 'Layanan Surel & Notifikasi'}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-blue-100/60 dark:border-slate-700/60 flex items-center justify-between">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isEmailLocked
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                }`}>
                  IMAP/SMTP
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {isEmailLocked ? (language === 'en' ? 'Locked' : 'Terkunci') : (language === 'en' ? 'Ready' : 'Siap Pakai')}
                </span>
              </div>
            </div>

            {/* Close grid-cols-2 for MCP cards */}
            </div>

            {/* Quick Helper Tips di Desktop Kiri Bawah */}
            <div className="hidden lg:flex items-center gap-3 p-4 rounded-2xl bg-blue-50/50 dark:bg-slate-800/40 border border-blue-100/60 dark:border-slate-700/60 mt-4">
              <span className="text-xl">💡</span>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {language === 'en' ? 'Quick Tip: ' : 'Tips Cepat: '}
                </span>
                {language === 'en'
                  ? 'Switch servers directly from the card dropdown or search topics using the search bar above.'
                  : 'Ganti target server langsung dari dropdown kartu atau cari topik melalui kolom pencarian di atas.'}
              </div>
            </div>
          </div>

          {/* SISI KANAN (Col 5 di Desktop): Recent Chat History & Start Chat Assistant */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* 3. Riwayat Chat Terkini (Recent Chat History Card) */}
            <div className="rounded-[24px] sm:rounded-[28px] bg-[#F8FAFC] dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 h-full flex flex-col">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-0.5 flex items-center justify-between">
                <span>{language === 'en' ? 'RECENT CHAT HISTORY' : 'RIWAYAT CHAT TERAKHIR'}</span>
                <Clock className="w-3.5 h-3.5 text-slate-400" />
              </div>

              <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 flex-1 flex flex-col justify-between">
                {recentChatList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 italic">
                    {language === 'en' ? 'No recent chat history yet' : 'Belum ada riwayat percakapan'}
                  </div>
                ) : (
                  recentChatList.map((item, idx) => {
                    const sessionId = item.session_id || item.id;
                    return (
                      <div
                        key={sessionId || idx}
                        onClick={() => {
                          const targetSid = item.session_id || item.id;
                          if (onLoadSession && targetSid) {
                            onLoadSession(targetSid);
                          } else if (onStartChat) {
                            onStartChat();
                          }
                        }}
                        className="py-3 flex items-center justify-between gap-3 group cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-700/40 rounded-xl px-2.5 -mx-1.5 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500 shrink-0">
                          {item.timeDisplay || formatTime(item.updated_at || item.created_at)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 4. Tombol Aksi Utama di Desktop: Mulai Chat Assistant 💬 (Menuju ke Chat Sekarang) */}
            <div className="hidden lg:flex flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onStartChat) onStartChat();
                }}
                className="w-full inline-flex items-center justify-center gap-2.5 py-4 px-6 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] text-white font-bold text-sm sm:text-base shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 transition-all cursor-pointer"
              >
                <span>{language === 'en' ? 'Start Chat Assistant' : 'Mulai Chat Assistant'}</span>
                <span className="text-lg">💬</span>
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
                {language === 'en'
                  ? 'Click to open interactive conversation mode'
                  : 'Klik untuk masuk langsung ke ruang percakapan asisten'}
              </p>
            </div>
          </div>

        </div>

      </div>

      {/* Floating Action Button untuk Mobile: Start Chat Assistant 💬 */}
      <div 
        className="lg:hidden fixed inset-x-3 sm:inset-x-6 z-40 pointer-events-none"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => {
            if (onStartChat) onStartChat();
          }}
          className="pointer-events-auto w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white font-bold text-sm shadow-xl shadow-blue-600/30 border border-white/20 transition-all cursor-pointer backdrop-blur-xs"
        >
          <span>{language === 'en' ? 'Start Chat Assistant' : 'Mulai Chat Assistant'}</span>
          <span className="text-base">💬</span>
        </button>
      </div>
    </div>
  );
}
