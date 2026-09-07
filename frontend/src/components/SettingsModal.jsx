import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  Bot, 
  CheckCircle2, 
  Cpu, 
  Database, 
  Eye, 
  EyeOff, 
  Globe, 
  KeyRound, 
  Lock, 
  Save, 
  Server, 
  ShieldCheck, 
  Sparkles, 
  Trash2, 
  User as UserIcon, 
  X 
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const SettingsModal = ({ isOpen, onClose, user, initialTab = 'persona' }) => {
  const { language, setLanguage, t, languages } = useLanguage();
  const [activeTab, setActiveTab] = useState(initialTab || 'persona');
  const [config, setConfig] = useState({
    mcp_sap_config_json: '',
    mcp_rag_config_json: '',
    mcp_sql_config_json: '',
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
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passMessage, setPassMessage] = useState({ type: '', text: '' });
  const [isChangingPass, setIsChangingPass] = useState(false);

  // SAP Per-user credentials state
  const [sapCreds, setSapCreds] = useState([]);
  const [loadingSapCreds, setLoadingSapCreds] = useState(false);
  const [sapTarget, setSapTarget] = useState('dev');
  const [sapUser, setSapUser] = useState('');
  const [sapPass, setSapPass] = useState('');
  const [showSapPass, setShowSapPass] = useState(false);
  const [sapClient, setSapClient] = useState('100');
  const [sapCredMsg, setSapCredMsg] = useState({ type: '', text: '' });
  const [savingSapCred, setSavingSapCred] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const currentRole = user?.role || 'user';
      setUserRole(currentRole);
      setSaveStatus('');
      setPassMessage({ type: '', text: '' });
      setSapCredMsg({ type: '', text: '' });

      if (user?.username && user?.role !== 'guest') {
        api.getConfig()
          .then(data => {
            setConfig({
              mcp_sap_config_json: data.mcp_sap_config_json || '',
              mcp_rag_config_json: data.mcp_rag_config_json || '',
              mcp_sql_config_json: data.mcp_sql_config_json || data.mcp_email_config_json || '',
              mcp_email_config_json: data.mcp_sql_config_json || data.mcp_email_config_json || '',
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
          })
          .catch(err => console.error("Failed to load config", err));

        setLoadingSapCreds(true);
        api.mySapCredentials()
          .then(data => setSapCreds(Array.isArray(data) ? data : []))
          .catch(err => console.error('Failed to load SAP credentials', err))
          .finally(() => setLoadingSapCreds(false));
      }
    }
  }, [isOpen, initialTab, user]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const { global_assistant_persona: _ignored, ...payload } = config;
      await api.saveConfig(payload);
      setSaveStatus('success');
      setTimeout(() => onClose(), 800);
    } catch {
      setSaveStatus('error');
    }
    setIsSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPassMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setPassMessage({ 
        type: 'error', 
        text: language === 'en' ? 'New passwords do not match.' : 'Konfirmasi password tidak cocok.' 
      });
      return;
    }

    if (newPassword.length < 8) {
      setPassMessage({ 
        type: 'error', 
        text: language === 'en' ? 'New password must be at least 8 characters.' : 'Password baru minimal 8 karakter.' 
      });
      return;
    }

    setIsChangingPass(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPassMessage({ type: 'success', text: t('security.success') });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setPassMessage({ type: 'error', text: err.message || t('security.failed') });
    } finally {
      setIsChangingPass(false);
    }
  };

  if (!isOpen) return null;

  const isSuperadmin = userRole === 'superadmin';
  const isLoggedIn = user?.username && user?.username !== 'Guest' && user?.role !== 'guest';

  // Dynamic header configuration based on active tab
  const getTabHeader = () => {
    switch (activeTab) {
      case 'persona':
        return {
          icon: <Sparkles className="w-5 h-5 text-white" />,
          gradient: 'from-indigo-500 via-indigo-600 to-purple-600 shadow-indigo-500/25',
          title: t('settings.tabPersona'),
          subtitle: language === 'en' 
            ? 'Customize your display name and AI assistant response persona' 
            : 'Sesuaikan nama tampilan dan gaya respons asisten AI Anda',
          maxWidth: 'max-w-lg'
        };
      case 'security':
        return {
          icon: <KeyRound className="w-5 h-5 text-white" />,
          gradient: 'from-amber-500 via-orange-500 to-rose-600 shadow-amber-500/25',
          title: t('settings.tabSecurity'),
          subtitle: language === 'en'
            ? 'Update your account login password securely'
            : 'Perbarui kata sandi masuk akun Anda secara aman',
          maxWidth: 'max-w-md'
        };
      case 'sapCreds':
        return {
          icon: <Server className="w-5 h-5 text-white" />,
          gradient: 'from-emerald-500 via-teal-500 to-cyan-600 shadow-emerald-500/25',
          title: t('settings.tabSap') || 'Akun SAP (Login)',
          subtitle: language === 'en'
            ? 'Personal SAP RFC credentials for transaction execution'
            : 'Kredensial SAP RFC pribadi untuk transaksi dan query SAP',
          maxWidth: 'max-w-lg'
        };
      case 'language':
        return {
          icon: <Globe className="w-5 h-5 text-white" />,
          gradient: 'from-blue-500 via-indigo-500 to-purple-600 shadow-blue-500/25',
          title: t('settings.tabLanguage') || 'Bahasa / Language',
          subtitle: language === 'en'
            ? 'Select your interface and communication language'
            : 'Pilih bahasa antarmuka dan komunikasi aplikasi',
          maxWidth: 'max-w-md'
        };
      case 'router':
        return {
          icon: <Cpu className="w-5 h-5 text-white" />,
          gradient: 'from-violet-500 via-purple-600 to-indigo-600 shadow-violet-500/25',
          title: 'AI Provider & Gateway',
          subtitle: 'Konfigurasi model AI lokal & endpoint 9Router (Superadmin)',
          maxWidth: 'max-w-xl'
        };
      case 'mcp':
        return {
          icon: <Database className="w-5 h-5 text-white" />,
          gradient: 'from-cyan-500 via-blue-600 to-indigo-600 shadow-cyan-500/25',
          title: 'Koneksi MCP Remote',
          subtitle: 'Konfigurasi server Model Context Protocol eksternal (Superadmin)',
          maxWidth: 'max-w-xl'
        };
      default:
        return {
          icon: <Bot className="w-5 h-5 text-white" />,
          gradient: 'from-indigo-500 to-purple-600 shadow-indigo-500/25',
          title: t('settings.title'),
          subtitle: 'Pengaturan akun dan preferensi',
          maxWidth: 'max-w-lg'
        };
    }
  };

  const headerInfo = getTabHeader();

  // Persona quick suggestion presets
  const personaPresets = [
    {
      label: '� Format Tabel & Ringkas',
      text: 'Sajikan hasil dalam format tabel yang ringkas dan rapi terlebih dahulu, lalu berikan penjelasan singkat.'
    },
    {
      label: '⚡ Singkat & To-The-Point',
      text: 'Berikan jawaban langsung to-the-point tanpa basa-basi berlebih.'
    },
    {
      label: '🔍 Sertakan T-Code & Tabel SAP',
      text: 'Sertakan selalu Transaction Code (T-Code) SAP dan nama tabel relevan (seperti VBAK, EKKO, MARA) pada setiap penjelasan.'
    }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
      style={{
        paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
        paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-surface-raised rounded-3xl shadow-2xl w-full ${headerInfo.maxWidth} overflow-hidden border border-line/80 animate-in zoom-in-95 duration-200 modal-panel my-auto flex flex-col`}
        style={{
          maxHeight: 'calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 2.5rem)'
        }}
      >
        
        {/* Header Modal - Focused & Gorgeous */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-line/80 bg-surface/40">
          <div className="flex items-center gap-3.5 min-w-0 pr-2">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${headerInfo.gradient} shadow-md flex items-center justify-center shrink-0`}>
              {headerInfo.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-content font-display truncate">
                {headerInfo.title}
              </h2>
              <p className="text-[11px] sm:text-xs text-content-muted truncate mt-0.5">
                {headerInfo.subtitle}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-content-muted hover:text-content hover:bg-surface-hover/80 transition-all shrink-0 cursor-pointer" 
            aria-label={t('settings.closeAria')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* ========================================================= */}
          {/* 1. DEDICATED VIEW: PERSONA & PROFIL                       */}
          {/* ========================================================= */}
          {activeTab === 'persona' && (
            <div className="space-y-5">
              <div>
                <label htmlFor="profile-fullname" className="flex items-center gap-1.5 text-xs font-bold text-content uppercase tracking-wider mb-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{t('settings.fullName')}</span>
                </label>
                <input
                  id="profile-fullname"
                  type="text"
                  disabled={!isLoggedIn}
                  value={config.full_name}
                  onChange={e => setConfig({ ...config, full_name: e.target.value })}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-sm text-content outline-none transition-all disabled:opacity-60 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder={isLoggedIn ? t('settings.fullNamePlaceholder') : t('settings.loginRequired')}
                />
                <p className="text-[11px] text-content-muted mt-1">
                  {t('settings.fullNameDesc')}
                </p>
              </div>

              <div>
                <label htmlFor="personal-persona" className="flex items-center gap-1.5 text-xs font-bold text-content uppercase tracking-wider mb-1.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{t('settings.personalPersona')}</span>
                </label>
                <textarea
                  id="personal-persona"
                  disabled={!isLoggedIn}
                  value={config.assistant_persona}
                  onChange={e => setConfig({ ...config, assistant_persona: e.target.value })}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-3 text-sm text-content outline-none transition-all resize-y min-h-[140px] disabled:opacity-60 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 leading-relaxed font-sans"
                  placeholder={isLoggedIn
                    ? (t('settings.personalPersonaPlaceholder') || 'misal: Ringkas dulu dalam tabel, lalu jelaskan alur prosesnya step-by-step.')
                    : t('settings.loginRequired')}
                />
                <p className="text-[11px] text-content-muted mt-1 leading-relaxed">
                  {t('settings.personalPersonaDesc')}
                </p>
              </div>

              {/* Quick Persona Chips */}
              {isLoggedIn && (
                <div className="pt-1 space-y-2">
                  <span className="text-[11px] font-semibold text-content-secondary flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Ide Preferensi Cepat (Klik untuk menambah):</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {personaPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setConfig(prev => ({
                            ...prev,
                            assistant_persona: prev.assistant_persona 
                              ? `${prev.assistant_persona.trim()}\n\n${preset.text}`
                              : preset.text
                          }));
                        }}
                        className="text-[11px] px-3 py-1.5 rounded-xl bg-surface border border-line hover:border-indigo-500/50 hover:bg-indigo-500/10 text-content-secondary hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer font-medium"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* 2. DEDICATED VIEW: KEAMANAN & KATA SANDI                  */}
          {/* ========================================================= */}
          {activeTab === 'security' && isLoggedIn && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passMessage.text && (
                <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
                  passMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                }`}>
                  {passMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="font-medium">{passMessage.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">
                  {t('security.oldPass')}
                </label>
                <div className="relative">
                  <input 
                    type={showOldPass ? "text" : "password"}
                    required
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 pr-11 text-sm text-content focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    placeholder={t('security.oldPassPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1 cursor-pointer"
                  >
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">
                  {t('security.newPass')}
                </label>
                <div className="relative">
                  <input 
                    type={showNewPass ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 pr-11 text-sm text-content focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    placeholder={t('security.newPassPlaceholder')}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">
                  {t('security.confirmPass')}
                </label>
                <div className="relative">
                  <input 
                    type={showConfirmPass ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 pr-11 text-sm text-content focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    placeholder={t('security.confirmPassPlaceholder')}
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1 cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <p className="text-[11px] text-content-muted flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Minimal 8 karakter. Sandi akan dienkripsi dengan aman.</span>
                </p>
              </div>

              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full mt-2 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-2xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{isChangingPass ? t('security.processing') : (language === 'en' ? 'Update Password' : 'Perbarui Kata Sandi')}</span>
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* 3. DEDICATED VIEW: AKUN SAP (LOGIN RFC)                   */}
          {/* ========================================================= */}
          {activeTab === 'sapCreds' && isLoggedIn && (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-content-secondary space-y-1">
                <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Kredensial SAP Pribadi (Terenkripsi AES)
                </p>
                <p className="text-[11px] text-content-muted leading-relaxed">
                  Masukkan akun SAP Anda untuk koneksi RFC. Password disimpan terenkripsi dengan aman dan hanya digunakan saat Anda menjalankan fungsi SAP.
                </p>
              </div>

              {sapCredMsg.text && (
                <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
                  sapCredMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                }`}>
                  {sapCredMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="font-medium">{sapCredMsg.text}</span>
                </div>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                setSavingSapCred(true);
                setSapCredMsg({ type: '', text: '' });
                try {
                  await api.saveMySapCredential({
                    target: sapTarget,
                    sap_user: sapUser,
                    sap_password: sapPass,
                    sap_client: sapClient || '100'
                  });
                  setSapCredMsg({ 
                    type: 'success', 
                    text: `Kredensial SAP '${sapTarget}' berhasil disimpan.` 
                  });
                  setSapPass('');
                  const updated = await api.mySapCredentials();
                  setSapCreds(Array.isArray(updated) ? updated : []);
                } catch (err) {
                  setSapCredMsg({ type: 'error', text: err.message || 'Gagal menyimpan kredensial SAP.' });
                } finally {
                  setSavingSapCred(false);
                }
              }} className="space-y-3.5 bg-surface-sunken p-4 rounded-2xl border border-line">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">Target Sistem SAP</label>
                    <input
                      type="text"
                      required
                      value={sapTarget}
                      onChange={e => setSapTarget(e.target.value)}
                      placeholder="misal: dev, prd, qa"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">Client SAP (Mandant)</label>
                    <input
                      type="text"
                      value={sapClient}
                      onChange={e => setSapClient(e.target.value)}
                      placeholder="misal: 100, 130"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">SAP Username</label>
                    <input
                      type="text"
                      required
                      value={sapUser}
                      onChange={e => setSapUser(e.target.value)}
                      placeholder="Username SAP"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">SAP Password</label>
                    <div className="relative">
                      <input
                        type={showSapPass ? "text" : "password"}
                        required
                        value={sapPass}
                        onChange={e => setSapPass(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 pr-9 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSapPass(!showSapPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-0.5 cursor-pointer"
                      >
                        {showSapPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSapCred}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingSapCred ? 'Menyimpan...' : 'Simpan Kredensial SAP'}</span>
                </button>
              </form>

              {/* Daftar Kredensial Tersimpan */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold text-content-secondary uppercase tracking-wider">Target SAP Tersimpan</h4>
                {loadingSapCreds ? (
                  <p className="text-xs text-content-muted">Memuat kredensial tersimpan...</p>
                ) : sapCreds.length === 0 ? (
                  <p className="text-xs text-content-muted italic">Belum ada kredensial target SAP khusus yang disimpan.</p>
                ) : (
                  <div className="space-y-1.5">
                    {sapCreds.map((c) => (
                      <div key={c.target} className="flex items-center justify-between p-3 bg-surface-sunken border border-line rounded-2xl text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Server className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-bold text-content uppercase tracking-wider">{c.target}</span>
                            <span className="text-content-muted ml-2">({c.sap_user || '—'}, Client {c.sap_client || '—'})</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Hapus kredensial tersimpan untuk target '${c.target}'?`)) return;
                            try {
                              await api.deleteMySapCredential(c.target);
                              setSapCreds(prev => prev.filter(x => x.target !== c.target));
                            } catch (err) {
                              alert(err.message || 'Gagal menghapus');
                            }
                          }}
                          className="text-xs text-rose-500 hover:text-rose-600 font-bold p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Hapus kredensial ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 4. DEDICATED VIEW: BAHASA / LANGUAGE                      */}
          {/* ========================================================= */}
          {activeTab === 'language' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {languages.map((langItem) => {
                  const isSelected = language === langItem.code;
                  return (
                    <button
                      key={langItem.code}
                      type="button"
                      onClick={() => {
                        setLanguage(langItem.code);
                        setTimeout(() => onClose(), 400);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-500/10 border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                          : 'bg-surface-sunken border-line hover:border-indigo-500/50'
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

              <div className="bg-surface-sunken border border-line rounded-2xl p-4 text-xs text-content-secondary leading-relaxed">
                <p className="font-semibold text-content mb-1">
                  💡 {t('settings.languageNoteTitle')}
                </p>
                <p className="text-content-muted">
                  {t('settings.languageNoteDesc')}
                </p>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 5. SUPERADMIN: AI ROUTER & PROVIDER                       */}
          {/* ========================================================= */}
          {activeTab === 'router' && isSuperadmin && (
            <div className="space-y-5">
              {/* 9Router Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                config.nine_router_enabled 
                  ? 'bg-indigo-500/10 border-indigo-500/30' 
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
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
                      className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
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
                        className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
                        placeholder="ag/gemini-3.7-flash-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">API Key (Opsional)</label>
                      <input 
                        type="password"
                        value={config.nine_router_api_key}
                        onChange={e => setConfig({...config, nine_router_api_key: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-indigo-500"
                        placeholder="Kosongkan jika tanpa auth"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* OpenRouter Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                config.openrouter_enabled 
                  ? 'bg-purple-500/10 border-purple-500/30' 
                  : 'bg-surface-sunken border-line opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-purple-600 text-white rounded-lg">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-content">OpenRouter (Cloud / Fallback)</h4>
                      <span className="text-[10px] text-content-muted">Penyedia model multi-LLM cloud</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig({...config, openrouter_enabled: !config.openrouter_enabled})}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      config.openrouter_enabled
                        ? 'bg-purple-600 text-white'
                        : 'bg-surface-sunken text-content-muted'
                    }`}
                  >
                    {config.openrouter_enabled ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">Primary Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_model}
                        onChange={e => setConfig({...config, openrouter_model: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                        placeholder="openrouter/auto"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-content-secondary mb-1">Fallback Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_fallback_model}
                        onChange={e => setConfig({...config, openrouter_fallback_model: e.target.value})}
                        className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                        placeholder="openrouter/free"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1">API Key</label>
                    <input 
                      type="password"
                      value={config.openrouter_api_key}
                      onChange={e => setConfig({...config, openrouter_api_key: e.target.value})}
                      className="w-full bg-surface-raised border border-line rounded-xl px-3.5 py-2 text-xs font-mono text-content focus:outline-none focus:border-purple-500"
                      placeholder="sk-or-v1-..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 6. SUPERADMIN: MCP CONNECTIONS                            */}
          {/* ========================================================= */}
          {activeTab === 'mcp' && isSuperadmin && (
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-content-secondary mb-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-500" />
                  <span>MCP SAP RFC Config (JSON)</span>
                </label>
                <textarea 
                  value={config.mcp_sap_config_json}
                  onChange={e => setConfig({...config, mcp_sap_config_json: e.target.value})}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-xs text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px]"
                  placeholder='{"mcpServers": {"sap-mcp": {"type": "http", "url": "http://127.0.0.1:8001/mcp"}}}'
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-content-secondary mb-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  <span>MCP SQL Remote Endpoint (JSON)</span>
                </label>
                <textarea 
                  value={config.mcp_sql_config_json || config.mcp_email_config_json}
                  onChange={e => setConfig({...config, mcp_sql_config_json: e.target.value, mcp_email_config_json: e.target.value})}
                  className="w-full bg-surface-sunken border border-line rounded-2xl px-4 py-2.5 text-xs text-content focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px]"
                  placeholder='{"mcpServers": {"sql-mcp": {"type": "http", "url": "http://192.168.1.162:8093/mcp"}}}'
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer Modal - Clean & Contextual */}
        <div className="px-5 sm:px-6 py-4 bg-surface/60 border-t border-line/80 flex items-center justify-between">
          <div className="text-xs font-medium min-w-0">
            {saveStatus === 'success' && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('settings.saved')}</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{t('settings.saveError')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-content-muted hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {t('common.close')}
            </button>

            {/* Tombol Simpan Perubahan hanya tampil untuk persona atau router/mcp */}
            {isLoggedIn && (activeTab === 'persona' || (isSuperadmin && (activeTab === 'router' || activeTab === 'mcp'))) && (
              <button 
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-5 py-2 rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-70 cursor-pointer"
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