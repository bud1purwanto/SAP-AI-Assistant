import React, { useState, useEffect } from 'react';
import { AlertCircle, Bot, CheckCircle2, Cpu, Database, Globe, KeyRound, Lock, Mail, Save, Server, Shield, ShieldCheck, Sliders, X } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const SettingsModal = ({ isOpen, onClose, user }) => {
  const { language, setLanguage, t, languages } = useLanguage();
  const [activeTab, setActiveTab] = useState('persona');
  const [config, setConfig] = useState({
    mcp_sap_config_json: '',
    mcp_rag_config_json: '',
    mcp_email_config_json: '',
    assistant_persona: '',
    full_name: '',
    global_assistant_persona: '',
    nine_router_enabled: true,
    nine_router_base_url: 'http://192.168.88.83:20128/v1',
    nine_router_model: 'ag/gemini-3.7-flash-medium',
    nine_router_api_key: '',
    openrouter_enabled: false,
    openrouter_model: 'openrouter/auto',
    openrouter_fallback_model: 'openrouter/free',
    openrouter_api_key: ''
  });
  const [userRole, setUserRole] = useState(user?.role || 'user');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Password Change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passMessage, setPassMessage] = useState({ type: '', text: '' });
  const [isChangingPass, setIsChangingPass] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentRole = user?.role || 'user';
      setUserRole(currentRole);
      setActiveTab(prev => (currentRole !== 'superadmin' && (prev === 'router' || prev === 'mcp')) ? 'persona' : prev);

      if (user?.username && user?.role !== 'guest') {
        api.getConfig()
          .then(data => {
            setConfig({
              mcp_sap_config_json: data.mcp_sap_config_json || '',
              mcp_rag_config_json: data.mcp_rag_config_json || '',
              mcp_email_config_json: data.mcp_email_config_json || '',
              assistant_persona: data.assistant_persona || '',
              full_name: data.full_name || '',
              global_assistant_persona: data.global_assistant_persona || '',
              nine_router_enabled: data.nine_router_enabled ?? true,
              nine_router_base_url: data.nine_router_base_url || 'http://192.168.88.83:20128/v1',
              nine_router_model: data.nine_router_model || 'ag/gemini-3.7-flash-medium',
              nine_router_api_key: data.nine_router_api_key || '',
              openrouter_enabled: data.openrouter_enabled ?? false,
              openrouter_model: data.openrouter_model || 'openrouter/auto',
              openrouter_fallback_model: data.openrouter_fallback_model || 'openrouter/free',
              openrouter_api_key: data.openrouter_api_key || ''
            });
            const fetchedRole = data.role || currentRole;
            setUserRole(fetchedRole);
            setActiveTab(prev => (fetchedRole !== 'superadmin' && (prev === 'router' || prev === 'mcp')) ? 'persona' : prev);
          })
          .catch(err => console.error("Failed to load config", err));
      }
    }
  }, [isOpen, user]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      // Persona organisasi dikelola terpisah di Admin Dashboard; dari sini
      // hanya profil dan preferensi pribadi yang dikirim.
      const { global_assistant_persona: _ignored, ...payload } = config;
      await api.saveConfig(payload);
      setSaveStatus('success');
      setTimeout(() => onClose(), 1000);
    } catch {
      setSaveStatus('error');
    }
    setIsSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPassMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setPassMessage({ type: 'error', text: 'Konfirmasi password tidak cocok.' });
      return;
    }

    // Ambang ini harus sejalan dengan validasi di backend.
    if (newPassword.length < 8) {
      setPassMessage({ type: 'error', text: 'Password baru minimal 8 karakter.' });
      return;
    }

    setIsChangingPass(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPassMessage({ type: 'success', text: 'Password berhasil diperbarui!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassMessage({ type: 'error', text: err.message || 'Gagal mengubah password.' });
    } finally {
      setIsChangingPass(false);
    }
  };

  if (!isOpen) return null;

  const isSuperadmin = userRole === 'superadmin';
  const isLoggedIn = user?.username && user?.username !== 'Guest';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe overflow-y-auto overscroll-contain">
      <div className="bg-surface-raised rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-line animate-in zoom-in-95 duration-200 modal-panel my-auto flex flex-col">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-line">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-content font-display truncate">
                {t('settings.title')}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] sm:text-xs text-content-muted truncate">User: <strong className="text-content-secondary">{user?.username || 'Guest'}</strong></span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
                  isSuperadmin 
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                }`}>
                  <Shield className="w-3 h-3" />
                  {isSuperadmin ? 'Superadmin' : (isLoggedIn ? 'User' : 'Guest')}
                </span>
              </div>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 sm:p-2 text-content-muted hover:text-content rounded-full hover:bg-surface-hover transition-colors shrink-0 cursor-pointer" aria-label="Tutup Pengaturan">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-line px-3 sm:px-6 pt-2 gap-1.5 sm:gap-2 bg-surface overflow-x-auto">
          <button
            onClick={() => setActiveTab('persona')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'persona'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{t('settings.tabPersona')}</span>
          </button>

          <button
            onClick={() => setActiveTab('language')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'language'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('settings.tabLanguage')}</span>
          </button>

          {isSuperadmin && (
            <button
              onClick={() => setActiveTab('router')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'router'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{t('settings.tabRouter')}</span>
            </button>
          )}

          {isSuperadmin && (
            <button
            onClick={() => setActiveTab('mcp')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{t('settings.tabMcp')}</span>
          </button>
          )}

          {isLoggedIn && (
            <button
              onClick={() => setActiveTab('security')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'security'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-content-muted hover:text-content'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t('settings.tabSecurity')}</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* TAB 1: Persona */}
          {(activeTab === 'persona' || (!isSuperadmin && activeTab !== 'security')) && (
            <div className="space-y-6">
              <div>
                <label htmlFor="profile-fullname" className="block text-sm font-bold text-content mb-1.5">
                  Nama Lengkap
                </label>
                <p className="text-xs text-content-muted mb-2.5">
                  Ditampilkan pada profil Anda dan pada daftar pengguna di dashboard admin.
                </p>
                <input
                  id="profile-fullname"
                  type="text"
                  disabled={!isLoggedIn}
                  value={config.full_name}
                  onChange={e => setConfig({ ...config, full_name: e.target.value })}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-sm text-content outline-none transition-all disabled:opacity-60"
                  placeholder={isLoggedIn ? 'misal: Andi Wijaya' : 'Login untuk mengubah profil Anda.'}
                />
              </div>

              {/* Persona organisasi ditampilkan baca-saja agar pengguna paham
                  dasar perilaku asisten sebelum menambahkan preferensinya. */}
              {config.global_assistant_persona && (
                <div className="bg-surface-sunken border border-line rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-content mb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
                    Persona Organisasi (diatur admin)
                  </div>
                  <p className="text-xs text-content-muted whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {config.global_assistant_persona}
                  </p>
                  <p className="text-[11px] text-content-subtle mt-2">
                    Aturan ini menjadi dasar untuk semua pengguna. Preferensi Anda di bawah
                    diterapkan di atasnya.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="personal-persona" className="block text-sm font-bold text-content mb-1.5">
                  🎭 {t('settings.personalPersona')}
                </label>
                <p className="text-xs text-content-muted mb-2.5 leading-relaxed">
                  Sesuaikan gaya jawaban, format, bahasa, atau instruksi khusus untuk asisten AI Anda
                  sendiri. Untuk gaya penulisan, preferensi ini menang atas persona organisasi;
                  aturan keakuratan data dan keamanan tetap mengikuti organisasi.
                </p>
                <textarea
                  id="personal-persona"
                  disabled={!isLoggedIn}
                  value={config.assistant_persona}
                  onChange={e => setConfig({ ...config, assistant_persona: e.target.value })}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-3 text-sm text-content outline-none transition-all resize-y min-h-[140px] disabled:opacity-60"
                  placeholder={isLoggedIn
                    ? t('settings.personalPersonaPlaceholder')
                    : 'Login untuk mengkustomisasi persona asisten Anda.'}
                />
              </div>
            </div>
          )}

          {/* TAB: Language / Bahasa */}
          {activeTab === 'language' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-content mb-1.5">
                  🌐 {t('settings.languageSelect')}
                </label>
                <p className="text-xs text-content-muted mb-4 leading-relaxed">
                  {t('settings.languageDesc')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {languages.map((langItem) => {
                    const isSelected = language === langItem.code;
                    return (
                      <button
                        key={langItem.code}
                        type="button"
                        onClick={() => setLanguage(langItem.code)}
                        className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 shadow-xs ring-2 ring-indigo-500/20'
                            : 'bg-surface-sunken border-line hover:border-indigo-300 dark:hover:border-indigo-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl" role="img" aria-label={langItem.name}>
                            {langItem.flag}
                          </span>
                          <div>
                            <span className="block text-sm font-bold text-content">
                              {langItem.name}
                            </span>
                            <span className="block text-[11px] text-content-muted uppercase tracking-wider font-mono">
                              {langItem.code}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-surface-sunken border border-line rounded-2xl p-4 text-xs text-content-secondary leading-relaxed">
                <p className="font-semibold text-content mb-1">
                  💡 Standar Multibahasa (Multilanguage Standard):
                </p>
                <p className="text-content-muted">
                  Aplikasi ini dirancang mendukung multibahasa penuh. Teks antarmuka, tombol, peringatan kuota, dan format diagram secara otomatis menyesuaikan dengan bahasa yang Anda pilih di atas.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: AI Provider & Router */}
          {activeTab === 'router' && isSuperadmin && (
            <div className="space-y-6">
              
              {/* 9Router Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                config.nine_router_enabled 
                  ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/50' 
                  : 'bg-surface-sunken border-line opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-content">9Router (Local Gateway / Primary)</h4>
                      <span className="text-[10px] text-content-muted">Endpoint gateway AI lokal berkecepatan tinggi</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig({...config, nine_router_enabled: !config.nine_router_enabled})}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.nine_router_enabled
                        ? 'bg-indigo-600 text-white'
                        : 'bg-surface-sunken text-content-muted'
                    }`}
                  >
                    {config.nine_router_enabled ? 'Aktif (Primary)' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1">Base URL</label>
                    <input 
                      type="text"
                      value={config.nine_router_base_url}
                      onChange={e => setConfig({...config, nine_router_base_url: e.target.value})}
                      className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
                      placeholder="http://192.168.88.83:20128/v1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">Model Name</label>
                      <input 
                        type="text"
                        value={config.nine_router_model}
                        onChange={e => setConfig({...config, nine_router_model: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
                        placeholder="ag/gemini-3.7-flash-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">API Key (Opsional)</label>
                      <input 
                        type="password"
                        value={config.nine_router_api_key}
                        onChange={e => setConfig({...config, nine_router_api_key: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
                        placeholder="Kosongkan jika tanpa auth"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* OpenRouter Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                config.openrouter_enabled 
                  ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/50' 
                  : 'bg-surface-sunken border-line opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-purple-600 text-white rounded-lg">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-content">OpenRouter (Cloud Failover / Gateway)</h4>
                      <span className="text-[10px] text-content-muted">Penyedia model AI multi-cloud (Gemini, Claude, GPT-4o, dll)</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig({...config, openrouter_enabled: !config.openrouter_enabled})}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.openrouter_enabled
                        ? 'bg-purple-600 text-white'
                        : 'bg-surface-sunken text-content-muted'
                    }`}
                  >
                    {config.openrouter_enabled ? 'Aktif (Failover)' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1">OpenRouter API Key</label>
                    <input 
                      type="password"
                      value={config.openrouter_api_key}
                      onChange={e => setConfig({...config, openrouter_api_key: e.target.value})}
                      className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                      placeholder="sk-or-v1-..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">Primary Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_model}
                        onChange={e => setConfig({...config, openrouter_model: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                        placeholder="openrouter/auto"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">Fallback Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_fallback_model}
                        onChange={e => setConfig({...config, openrouter_fallback_model: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                        placeholder="openrouter/free"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: MCP Config */}
          {activeTab === 'mcp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-content-muted flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  Konfigurasi MCP Server JSON
                </span>
                {!isSuperadmin && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-1 font-medium">
                    <Lock className="w-3 h-3" /> Hanya Superadmin
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-content-secondary mb-1.5">
                    MCP SAP Remote Endpoint (SSE / JSON-RPC)
                  </label>
                  <textarea 
                    disabled={!isSuperadmin}
                    value={config.mcp_sap_config_json}
                    onChange={e => setConfig({...config, mcp_sap_config_json: e.target.value})}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-xs text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder='{\n  "mcpServers": {\n    "sap-leader-remote": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-content-secondary mb-1.5">
                    MCP RAG Remote Endpoint (SSE / JSON-RPC)
                  </label>
                  <textarea 
                    disabled={!isSuperadmin}
                    value={config.mcp_rag_config_json}
                    onChange={e => setConfig({...config, mcp_rag_config_json: e.target.value})}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-xs text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder='{\n  "mcpServers": {\n    "manufacturing-rag": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-content-secondary mb-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-500" />
                    MCP Email Remote Endpoint (SSE / JSON-RPC)
                  </label>
                  <textarea 
                    disabled={!isSuperadmin}
                    value={config.mcp_email_config_json}
                    onChange={e => setConfig({...config, mcp_email_config_json: e.target.value})}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-xs text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder='{\n  "mcpServers": {\n    "email-mcp": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Security & Password */}
          {activeTab === 'security' && isLoggedIn && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passMessage.text && (
                <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                  passMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                }`}>
                  {passMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{passMessage.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">Password Lama</label>
                <input 
                  type="password"
                  required
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-3.5 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Masukkan password saat ini"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">Password Baru</label>
                  <input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-3.5 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Minimal 4 karakter"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">Konfirmasi Password</label>
                  <input 
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-3.5 py-2.5 text-sm text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Ulangi password baru"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isChangingPass ? 'Memproses...' : 'Perbarui Password'}</span>
              </button>
            </form>
          )}

        </div>

        {/* Footer Modal */}
        <div className="px-6 py-4 bg-surface border-t border-line flex items-center justify-between">
          <div className="text-xs font-medium">
            {saveStatus === 'success' && <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('settings.saved')}</span>}
            {saveStatus === 'error' && <span className="text-rose-600 dark:text-rose-400 font-bold">{t('settings.saveError')}</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-content-muted hover:text-content transition-colors"
            >
              {t('common.close')}
            </button>
            {isLoggedIn && (
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-tr from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-70"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? t('settings.saving') : t('settings.save')}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;