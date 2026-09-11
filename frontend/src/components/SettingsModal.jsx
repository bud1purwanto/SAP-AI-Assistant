import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity,
  AlertCircle, 
  Bot, 
  CheckCircle2, 
  ChevronDown,
  Cpu, 
  Database, 
  Edit2,
  Eye, 
  EyeOff, 
  Globe, 
  KeyRound, 
  Loader2,
  Lock, 
  Save, 
  Server, 
  ShieldCheck, 
  Sparkles, 
  Trash2, 
  User as UserIcon, 
  X,
  XCircle
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
  const [availableSapServers, setAvailableSapServers] = useState([]);
  const [loadingSapServers, setLoadingSapServers] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [testingSap, setTestingSap] = useState(false);
  const [testingTarget, setTestingTarget] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);
  const targetDropdownRef = useRef(null);
  const sapBannerRef = useRef(null);

  const [sapTarget, setSapTarget] = useState('');
  const [sapUser, setSapUser] = useState('');
  const [sapPass, setSapPass] = useState('');
  const [showSapPass, setShowSapPass] = useState(false);
  const [sapClient, setSapClient] = useState('100');
  const [sapCredMsg, setSapCredMsg] = useState({ type: '', text: '' });
  const [savingSapCred, setSavingSapCred] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target)) {
        setIsTargetDropdownOpen(false);
      }
    };
    if (isTargetDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTargetDropdownOpen]);

  const loadSapServers = useCallback(async () => {
    setLoadingSapServers(true);
    try {
      const res = await api.availableSapServers();
      const list = Array.isArray(res?.servers) ? res.servers : [];
      setAvailableSapServers(list);
    } catch (err) {
      console.error('Failed to load available SAP servers', err);
    } finally {
      setLoadingSapServers(false);
    }
  }, []);

  useEffect(() => {
    if (testResult && sapBannerRef.current) {
      sapBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [testResult]);

  useEffect(() => {
    if (isOpen) {
      setIsTargetDropdownOpen(false);
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const currentRole = user?.role || 'user';
      setUserRole(currentRole);
      setSaveStatus('');
      setPassMessage({ type: '', text: '' });
      setSapCredMsg({ type: '', text: '' });
      setTestResult(null);
      setIsEditMode(false);
      setEditingTarget(null);
      setTestingTarget(null);

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

        loadSapServers();
        setLoadingSapCreds(true);
        api.mySapCredentials()
          .then(data => setSapCreds(Array.isArray(data) ? data : []))
          .catch(err => console.error('Failed to load SAP credentials', err))
          .finally(() => setLoadingSapCreds(false));
      }
    }
  }, [isOpen, initialTab, user, loadSapServers]);

  useEffect(() => {
    if (!isEditMode && availableSapServers.length > 0) {
      const savedList = sapCreds.map(c => (c.target || '').toLowerCase());
      const currentExists = availableSapServers.some(s => s.alias === sapTarget || s.name === sapTarget);
      const isAlreadySaved = savedList.includes((sapTarget || '').toLowerCase());
      if (!currentExists || isAlreadySaved || !sapTarget) {
        const firstAvailable = availableSapServers.find(s => s.is_allowed && !savedList.includes((s.alias || '').toLowerCase()))
          || availableSapServers.find(s => s.is_allowed)
          || availableSapServers[0];
        if (firstAvailable) {
          const tKey = firstAvailable.alias || firstAvailable.name;
          setSapTarget(tKey);
          if (firstAvailable.client) {
            setSapClient(firstAvailable.client);
          }
        }
      }
    }
  }, [availableSapServers, sapCreds, isEditMode]);

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

  const handleStartEdit = (cred) => {
    setIsEditMode(true);
    setEditingTarget(cred.target);
    setSapTarget(cred.target);
    setSapUser(cred.sap_user || '');
    setSapPass('');
    setSapClient(cred.sap_client || '100');
    setSapCredMsg({ type: '', text: '' });
    setTestResult(null);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingTarget(null);
    setSapPass('');
    setSapCredMsg({ type: '', text: '' });
    setTestResult(null);
    const savedList = sapCreds.map(c => (c.target || '').toLowerCase());
    const firstAvailable = availableSapServers.find(s => s.is_allowed && !savedList.includes((s.alias || '').toLowerCase()))
      || availableSapServers.find(s => s.is_allowed)
      || availableSapServers[0];
    if (firstAvailable) {
      setSapTarget(firstAvailable.alias || firstAvailable.name);
      if (firstAvailable.client) setSapClient(firstAvailable.client);
    }
  };

  const handleTestConnection = async () => {
    if (!sapTarget) return;
    setTestingSap(true);
    setTestResult(null);
    try {
      const res = await api.testSapConnection({
        target: sapTarget,
        sap_user: sapUser || undefined,
        sap_password: sapPass || undefined,
        sap_client: sapClient || undefined
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || t('settings.sapTestFailed')
      });
    } finally {
      setTestingSap(false);
    }
  };

  const handleTestSavedCredential = async (c) => {
    if (!c?.target) return;
    setTestingTarget(c.target);
    setTestResult(null);
    try {
      const isCurrentlyEditing = isEditMode && editingTarget === c.target;
      const res = await api.testSapConnection({
        target: c.target,
        sap_user: (isCurrentlyEditing && sapUser ? sapUser : c.sap_user) || undefined,
        sap_password: (isCurrentlyEditing && sapPass ? sapPass : undefined),
        sap_client: (isCurrentlyEditing && sapClient ? sapClient : c.sap_client) || undefined
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || t('settings.sapTestFailed')
      });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleSaveSapCredential = async (e) => {
    e.preventDefault();
    setSavingSapCred(true);
    setSapCredMsg({ type: '', text: '' });
    try {
      await api.saveMySapCredential({
        target: sapTarget,
        sap_user: sapUser,
        sap_password: sapPass || undefined,
        sap_client: sapClient || '100',
        is_update: isEditMode
      });
      const successMsg = isEditMode
        ? (t('settings.sapUpdatedSuccess', { target: sapTarget }) || `Kredensial SAP '${sapTarget}' berhasil diperbarui.`)
        : (t('settings.sapSavedSuccess', { target: sapTarget }) || `Kredensial SAP '${sapTarget}' berhasil disimpan.`);
      setSapCredMsg({ type: 'success', text: successMsg });
      setSapPass('');
      setIsEditMode(false);
      setEditingTarget(null);
      setTestResult(null);

      const updated = await api.mySapCredentials();
      setSapCreds(Array.isArray(updated) ? updated : []);
      await loadSapServers();
    } catch (err) {
      setSapCredMsg({ 
        type: 'error', 
        text: err.message || t('settings.sapSaveFailed') 
      });
    } finally {
      setSavingSapCred(false);
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
      className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 overflow-y-auto overscroll-contain transition-opacity duration-200 animate-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="min-h-full flex items-center justify-center p-3 sm:p-4 text-center"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={`bg-surface-raised/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl w-full ${headerInfo.maxWidth} overflow-hidden border border-line/80 relative my-auto flex flex-col text-left transition-opacity duration-200 animate-modal-content`}
          style={{
            maxHeight: 'min(92vh, calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 1.5rem))'
          }}
        >
        {/* Ambient Top Glow Blobs */}
        <div className="absolute -top-24 -left-24 w-56 h-56 bg-accent/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top glowing hairline accent */}
        <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />
        
        {/* Header Modal - Focused & Gorgeous */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-line/80 bg-surface/40 relative z-10">
          <div className="flex items-center gap-3.5 min-w-0 pr-2">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr ${headerInfo.gradient} shadow-lg border border-white/20 flex items-center justify-center shrink-0`}>
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
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-content-muted hover:text-content bg-surface-sunken/80 hover:bg-surface-hover border border-line/50 transition-all duration-200 shrink-0 cursor-pointer hover:rotate-90" 
            aria-label={t('settings.closeAria')}
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                  {t('settings.sapAESTitle')}
                </p>
                <p className="text-[11px] text-content-muted leading-relaxed">
                  {t('settings.sapAESDesc')}
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

              {testResult && (
                <div ref={sapBannerRef} className={`p-3.5 rounded-2xl text-xs flex items-start justify-between gap-2.5 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                }`}>
                  <div className="flex items-start gap-2.5">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-semibold">{testResult.message}</p>
                      {testResult.server_info && (
                        <p className="text-[11px] opacity-80 font-mono">
                          {testResult.server_info.active_server && `Server: ${testResult.server_info.active_server}`}
                          {testResult.server_info.sid && ` • SID: ${testResult.server_info.sid}`}
                          {testResult.server_info.client && ` • Client: ${testResult.server_info.client}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestResult(null)}
                    className="text-content-muted hover:text-content p-0.5 cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveSapCredential} className="space-y-3.5 bg-surface-sunken p-4 rounded-2xl border border-line">
                {isEditMode && (() => {
                  const editingServerObj = availableSapServers.find(
                    s => (s.alias || '').toLowerCase() === (editingTarget || '').toLowerCase()
                      || (s.name || '').toLowerCase() === (editingTarget || '').toLowerCase()
                      || (s.aliases && s.aliases.some(a => a.toLowerCase() === (editingTarget || '').toLowerCase()))
                  );
                  const editingServerName = editingServerObj?.name || editingTarget;
                  return (
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-line text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{language === 'en' ? `Editing: ${editingServerName}` : `Mode Edit: ${editingServerName}`}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-xs text-content-muted hover:text-content underline cursor-pointer"
                      >
                        {t('settings.sapBtnCancel')}
                      </button>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative z-20" ref={targetDropdownRef}>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
                      {t('settings.sapTargetSystem')}
                    </label>
                    <button
                      type="button"
                      disabled={isEditMode || loadingSapServers}
                      onClick={() => setIsTargetDropdownOpen(prev => !prev)}
                      className={`w-full flex items-center justify-between gap-2 bg-surface border rounded-xl px-3.5 py-2 text-xs text-left transition-all ${
                        isTargetDropdownOpen
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                          : 'border-line hover:border-emerald-500/50'
                      } ${isEditMode || loadingSapServers ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <Server className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate font-medium text-content">
                          {loadingSapServers
                            ? t('settings.sapLoadingServers')
                            : (availableSapServers.find(s => 
                                (s.alias || '').toLowerCase() === (sapTarget || '').toLowerCase() || 
                                (s.name || '').toLowerCase() === (sapTarget || '').toLowerCase() ||
                                (s.aliases && s.aliases.some(a => a.toLowerCase() === (sapTarget || '').toLowerCase()))
                              )?.name || sapTarget || t('settings.sapSelectTarget'))}
                        </span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-content-muted shrink-0 transition-transform duration-200 ${
                        isTargetDropdownOpen ? 'rotate-180 text-emerald-500' : ''
                      }`} />
                    </button>

                    {/* Custom Dropdown Popover */}
                    {isTargetDropdownOpen && (
                      <div className="absolute left-0 top-[calc(100%+4px)] w-full rounded-2xl bg-surface-raised/95 backdrop-blur-xl border border-line shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto custom-scrollbar">
                        {loadingSapServers ? (
                          <div className="p-3 text-xs text-content-muted flex items-center justify-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                            <span>{t('settings.sapLoadingServers')}</span>
                          </div>
                        ) : availableSapServers.length === 0 ? (
                          <div className="p-3 text-xs text-content-muted italic text-center">
                            {t('settings.sapSelectTarget')}
                          </div>
                        ) : (
                          <>
                            {/* 1. Server Tersedia untuk Anda */}
                            {availableSapServers.some(s => s.is_allowed) && (
                              <div className="mb-1">
                                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                                  {t('settings.sapAvailableForYou')}
                                </div>
                                <div className="space-y-0.5">
                                  {availableSapServers.filter(s => s.is_allowed).map(s => {
                                    const srvKey = s.alias || s.name;
                                    const isSelected = sapTarget === srvKey;
                                    const isConfigured = s.has_credential;
                                    const isCurrentEditing = isEditMode && editingTarget === srvKey;
                                    const isDisabled = isConfigured && !isCurrentEditing;

                                    return (
                                      <button
                                        key={srvKey}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => {
                                          setSapTarget(srvKey);
                                          if (s.client) setSapClient(s.client);
                                          setIsTargetDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors text-left ${
                                          isSelected
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                                            : isDisabled
                                            ? 'opacity-40 cursor-not-allowed text-content-muted'
                                            : 'text-content hover:bg-surface-hover cursor-pointer'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-emerald-500' : 'bg-transparent'}`} />
                                          <span className="truncate">{s.name || srvKey}</span>
                                        </div>
                                        {isConfigured && (
                                          <span className="text-[10px] text-content-muted font-normal shrink-0">
                                            {t('settings.sapAlreadyConfigured')}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 2. Server Terbatas (Tidak Ada Izin) */}
                            {availableSapServers.some(s => !s.is_allowed) && (
                              <div className="pt-1 border-t border-line/60">
                                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                                  {t('settings.sapRestrictedServers')}
                                </div>
                                <div className="space-y-0.5">
                                  {availableSapServers.filter(s => !s.is_allowed).map(s => {
                                    const srvKey = s.alias || s.name;
                                    return (
                                      <div
                                        key={srvKey}
                                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-content-muted opacity-50 cursor-not-allowed select-none"
                                        title={t('settings.sapNoAccess')}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <Lock className="w-3 h-3 text-content-subtle shrink-0" />
                                          <span className="truncate">{s.name || srvKey}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
                      {t('settings.sapClient')}
                    </label>
                    <input
                      type="text"
                      value={sapClient}
                      onChange={e => setSapClient(e.target.value)}
                      placeholder="100, 130"
                      className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
                      {t('settings.sapUsername')}
                    </label>
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
                    <label className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
                      {t('settings.sapPassword')}
                    </label>
                    <div className="relative">
                      <input
                        type={showSapPass ? "text" : "password"}
                        required={!isEditMode}
                        value={sapPass}
                        onChange={e => setSapPass(e.target.value)}
                        placeholder={isEditMode ? t('settings.sapPassEditPlaceholder') : t('settings.sapPassPlaceholder')}
                        className="w-full bg-surface border border-line rounded-xl px-3.5 py-2 pr-9 text-xs text-content focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSapPass(!showSapPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-0.5 cursor-pointer"
                        title={showSapPass ? "Hide password" : "Show password"}
                      >
                        {showSapPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tombol Aksi Form */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingSap || !sapTarget || (!isEditMode && (!sapUser || !sapPass))}
                    className="w-full sm:w-auto sm:flex-1 h-10 px-3.5 bg-surface hover:bg-surface-sunken border border-line hover:border-emerald-500/50 text-content rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    {testingSap ? (
                      <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>{testingSap ? t('settings.sapTesting') : t('settings.sapBtnTest')}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingSapCred || !sapTarget || !sapUser || (!isEditMode && !sapPass)}
                    className="w-full sm:w-auto sm:flex-1 h-10 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {savingSapCred ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {savingSapCred 
                        ? (language === 'en' ? 'Saving...' : 'Menyimpan...') 
                        : (isEditMode ? t('settings.sapBtnUpdate') : t('settings.sapBtnSave'))}
                    </span>
                  </button>

                  {isEditMode && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="w-full sm:w-auto h-10 px-3.5 bg-surface hover:bg-surface-sunken border border-line text-content-muted hover:text-content rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{t('settings.sapBtnCancel')}</span>
                    </button>
                  )}
                </div>
              </form>

              {/* Daftar Kredensial Tersimpan */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold text-content-secondary uppercase tracking-wider">
                  {t('settings.sapSavedTargets')}
                </h4>
                {loadingSapCreds ? (
                  <p className="text-xs text-content-muted">{language === 'en' ? 'Loading saved credentials...' : 'Memuat kredensial tersimpan...'}</p>
                ) : sapCreds.length === 0 ? (
                  <p className="text-xs text-content-muted italic">{t('settings.sapNoCreds')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {sapCreds.map((c) => {
                      const isEditing = isEditMode && editingTarget === c.target;
                      const isTestingThis = testingTarget === c.target;
                      const serverObj = availableSapServers.find(
                        s => (s.alias || '').toLowerCase() === (c.target || '').toLowerCase()
                          || (s.name || '').toLowerCase() === (c.target || '').toLowerCase()
                          || (s.aliases && s.aliases.some(a => a.toLowerCase() === (c.target || '').toLowerCase()))
                      );
                      const serverDisplayName = serverObj?.name || c.target;
                      const sid = serverObj?.sid;
                      return (
                        <div 
                          key={c.target} 
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl text-xs gap-3 sm:gap-4 transition-all ${
                            isEditing 
                              ? 'bg-emerald-500/10 border-2 border-emerald-500 shadow-sm' 
                              : 'bg-surface-sunken border border-line hover:border-line-hover'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              isEditing 
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/40' 
                                : 'bg-surface text-emerald-500 border border-line'
                            }`}>
                              <Server className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-content text-xs sm:text-sm tracking-tight truncate">
                                  {serverDisplayName}
                                </span>
                                {sid && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-md bg-surface text-content-muted border border-line">
                                    {sid}
                                  </span>
                                )}
                                {isEditing && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 animate-pulse">
                                    {language === 'en' ? 'Editing' : 'Sedang Diedit'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center flex-wrap gap-1.5 text-xs text-content-muted">
                                <span className="font-mono text-content-secondary font-medium">{c.sap_user || '—'}</span>
                                <span className="text-content-subtle">•</span>
                                <span>Client <span className="font-mono text-content-secondary">{c.sap_client || '—'}</span></span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-52">
                            {/* Baris 1: Test Connection */}
                            <button
                              type="button"
                              disabled={isTestingThis || testingSap}
                              onClick={() => handleTestSavedCredential(c)}
                              className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-500/60 bg-surface/60 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={t('settings.sapBtnTest')}
                            >
                              {isTestingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                              ) : (
                                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              <span>{isTestingThis ? t('settings.sapTesting') : t('settings.sapBtnTest')}</span>
                            </button>

                            {/* Baris 2: Edit & Delete */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(c)}
                                className={`w-full text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer border ${
                                  isEditing 
                                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' 
                                    : 'text-content-secondary hover:text-content bg-surface/60 hover:bg-surface border-line hover:border-line-hover'
                                }`}
                                title={t('settings.sapEdit')}
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>{t('settings.sapEdit')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  const confirmPrompt = t('settings.sapDeleteConfirm', { target: serverDisplayName }) || `Hapus kredensial tersimpan untuk target '${serverDisplayName}'?`;
                                  if (!window.confirm(confirmPrompt)) return;
                                  try {
                                    await api.deleteMySapCredential(c.target);
                                    setSapCreds(prev => prev.filter(x => x.target !== c.target));
                                    if (isEditMode && editingTarget === c.target) {
                                      handleCancelEdit();
                                    }
                                    await loadSapServers();
                                  } catch (err) {
                                    alert(err.message || 'Gagal menghapus');
                                  }
                                }}
                                className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer text-rose-500 hover:text-rose-600 bg-surface/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-line hover:border-rose-300 dark:hover:border-rose-800"
                                title={t('settings.sapDelete')}
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{t('settings.sapDelete')}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-xs transition-colors active:scale-[0.98] disabled:opacity-70 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? t('settings.saving') : t('settings.save')}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
  );
};

export default SettingsModal;