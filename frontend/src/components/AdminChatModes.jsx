import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Server,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import { renderModeIcon } from './ModeSelector';

const ALL_ROLES = [
  { role: 'superadmin', label: 'Super Admin', desc: 'Full System & Configuration Access' },
  { role: 'abaper', label: 'ABAPer', desc: 'Technical & ABAP Development' },
  { role: 'functional', label: 'Functional', desc: 'Business Consultant Modules' },
  { role: 'user', label: 'Standard User', desc: 'General End-User Access' },
  { role: 'guest', label: 'Guest', desc: 'Public / Unregistered User' },
];

const INITIAL_FORM = {
  code: '',
  name: '',
  description: '',
  icon: 'zap',
  provider: '9router',
  model: 'ag/gemini-3.7-flash-medium',
  fallback_provider: 'openrouter',
  fallback_model: 'openrouter/free',
  max_iterations: 15,
  enabled: true,
  is_default: false,
  sort_order: 0,
};

const formatProviderLabel = (p) => {
  const clean = (p || '').toLowerCase().trim();
  if (clean === 'nine_router' || clean === '9router') return '9Router';
  if (clean === 'openrouter') return 'OpenRouter';
  if (clean === 'ollama') return 'Ollama';
  if (clean === 'vllm') return 'vLLM';
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Auto';
};

export default function AdminChatModes({
  onRefreshModes,
  setActionSuccess,
  setActionError,
  setConfirmModal,
}) {
  const { t, language } = useLanguage();
  const [modesList, setModesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(true);
  const [roleMatrix, setRoleMatrix] = useState([]);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingMode, setEditingMode] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // AI Providers Gateway Config State
  const [nineRouterEnabled, setNineRouterEnabled] = useState(true);
  const [nineRouterBaseUrl, setNineRouterBaseUrl] = useState('http://192.168.88.83:20128/v1');
  const [nineRouterModel, setNineRouterModel] = useState('ag/gemini-3.7-flash-medium');
  const [nineRouterApiKey, setNineRouterApiKey] = useState('');

  const [openrouterEnabled, setOpenrouterEnabled] = useState(false);
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState('openrouter/auto');
  const [openrouterFallbackModel, setOpenrouterFallbackModel] = useState('openrouter/free');
  const [savingProviders, setSavingProviders] = useState(false);

  const [newForm, setNewForm] = useState(INITIAL_FORM);
  const [editForm, setEditForm] = useState(INITIAL_FORM);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [modesRes, rolesRes, configRes] = await Promise.all([
        api.adminModes(),
        api.adminRoleModes(),
        api.getConfig(),
      ]);
      setModesList(modesRes?.modes || []);
      setMasterEnabled(Boolean(modesRes?.chat_modes_enabled));
      setRoleMatrix(rolesRes?.matrix || []);

      if (configRes) {
        setNineRouterEnabled(configRes.nine_router_enabled !== undefined ? configRes.nine_router_enabled : true);
        setNineRouterBaseUrl(configRes.nine_router_base_url || 'http://192.168.88.83:20128/v1');
        setNineRouterModel(configRes.nine_router_model || 'ag/gemini-3.7-flash-medium');
        setNineRouterApiKey(configRes.nine_router_api_key || '');
        setOpenrouterEnabled(configRes.openrouter_enabled !== undefined ? configRes.openrouter_enabled : false);
        setOpenrouterApiKey(configRes.openrouter_api_key || '');
        setOpenrouterModel(configRes.openrouter_model || 'openrouter/auto');
        setOpenrouterFallbackModel(configRes.openrouter_fallback_model || 'openrouter/free');
        setSuggestionsEnabled(configRes.ai_suggestions_enabled !== undefined ? configRes.ai_suggestions_enabled : true);
      }

      if (onRefreshModes) onRefreshModes();
    } catch (err) {
      console.error('Gagal load chat modes & config:', err);
      if (setActionError) setActionError(err.message || 'Failed to load chat modes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProviders = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingProviders(true);
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.saveConfig({
        nine_router_enabled: nineRouterEnabled,
        nine_router_base_url: nineRouterBaseUrl,
        nine_router_model: nineRouterModel,
        nine_router_api_key: nineRouterApiKey,
        openrouter_enabled: openrouterEnabled,
        openrouter_api_key: openrouterApiKey,
        openrouter_model: openrouterModel,
        openrouter_fallback_model: openrouterFallbackModel,
      });
      if (setActionSuccess) {
        setActionSuccess(
          language === 'en'
            ? 'AI Provider gateway configuration saved!'
            : 'Konfigurasi gateway AI Provider berhasil disimpan!'
        );
      }
    } catch (err) {
      if (setActionError) setActionError(err.message);
    } finally {
      setSavingProviders(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleMaster = async (enabled) => {
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.adminToggleModesMaster(enabled);
      setMasterEnabled(enabled);
      if (setActionSuccess) {
        setActionSuccess(
          enabled
            ? (language === 'en' ? 'Chat Modes feature enabled globally.' : 'Fitur Mode Chat diaktifkan secara global.')
            : (language === 'en' ? 'Chat Modes feature disabled globally (single default mode active).' : 'Fitur Mode Chat dinonaktifkan secara global.')
        );
      }
      if (onRefreshModes) onRefreshModes();
    } catch (err) {
      if (setActionError) setActionError(err.message);
    }
  };

  const handleToggleSuggestions = async (enabled) => {
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.saveConfig({ ai_suggestions_enabled: enabled });
      setSuggestionsEnabled(enabled);
      if (setActionSuccess) {
        setActionSuccess(
          enabled
            ? (language === 'en' ? 'AI Dynamic Suggestions & Placeholders enabled.' : 'Saran Percakapan & Placeholder Dinamis AI berhasil diaktifkan.')
            : (language === 'en' ? 'AI Dynamic Suggestions disabled (static suggestions used).' : 'Saran Percakapan & Placeholder Dinamis AI dinonaktifkan (menggunakan saran statis bawaan).')
        );
      }
    } catch (err) {
      if (setActionError) setActionError(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.adminCreateMode(newForm);
      if (setActionSuccess) {
        setActionSuccess(language === 'en' ? `Mode '${newForm.name}' created!` : `Mode '${newForm.name}' berhasil dibuat!`);
      }
      setNewForm(INITIAL_FORM);
      setIsAddOpen(false);
      fetchData();
    } catch (err) {
      if (setActionError) setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id, e) => {
    e.preventDefault();
    setIsSaving(true);
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.adminUpdateMode(id, editForm);
      if (setActionSuccess) {
        setActionSuccess(language === 'en' ? `Mode '${editForm.name}' updated!` : `Mode '${editForm.name}' berhasil diupdate!`);
      }
      setEditingMode(null);
      fetchData();
    } catch (err) {
      if (setActionError) setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (mode) => {
    if (!setConfirmModal) return;
    setConfirmModal({
      isOpen: true,
      variant: 'danger',
      title: language === 'en' ? 'Delete Chat Mode' : 'Hapus Mode Chat',
      message: language === 'en'
        ? `Are you sure you want to delete chat mode "${mode.name}" (${mode.code})?`
        : `Apakah Anda yakin ingin menghapus mode chat "${mode.name}" (${mode.code})?`,
      confirmText: language === 'en' ? 'Delete' : 'Hapus',
      cancelText: language === 'en' ? 'Cancel' : 'Batal',
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, isLoading: true }));
        if (setActionError) setActionError('');
        if (setActionSuccess) setActionSuccess('');
        try {
          await api.adminDeleteMode(mode.id);
          if (setActionSuccess) {
            setActionSuccess(language === 'en' ? `Mode '${mode.name}' deleted!` : `Mode '${mode.name}' berhasil dihapus!`);
          }
          fetchData();
          setConfirmModal((m) => ({ ...m, isOpen: false, isLoading: false }));
        } catch (err) {
          if (setActionError) setActionError(err.message);
          setConfirmModal((m) => ({ ...m, isLoading: false }));
        }
      },
    });
  };

  const handleSetDefault = async (mode) => {
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.adminSetDefaultMode(mode.id);
      if (setActionSuccess) {
        setActionSuccess(language === 'en' ? `Mode '${mode.name}' is now default!` : `Mode '${mode.name}' dijadikan default!`);
      }
      fetchData();
    } catch (err) {
      if (setActionError) setActionError(err.message);
    }
  };

  const handleToggleEnabled = async (mode) => {
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');
    try {
      await api.adminUpdateMode(mode.id, { enabled: !mode.enabled });
      fetchData();
    } catch (err) {
      if (setActionError) setActionError(err.message);
    }
  };

  const handleMoveMode = async (index, direction) => {
    if (setActionError) setActionError('');
    if (setActionSuccess) setActionSuccess('');

    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= modesList.length) return;

    const newModes = [...modesList];
    const temp = newModes[index];
    newModes[index] = newModes[targetIndex];
    newModes[targetIndex] = temp;

    setModesList(newModes);

    try {
      const modeIds = newModes.map((m) => m.id);
      await api.adminReorderModes(modeIds);
      if (setActionSuccess) {
        setActionSuccess(language === 'en' ? 'Mode order updated successfully!' : 'Urutan mode berhasil disimpan!');
      }
    } catch (err) {
      if (setActionError) setActionError(err.message);
      fetchData();
    }
  };

  const handleToggleRoleAccess = async (role, modeCode, currentAllowed) => {
    const nextAllowed = !currentAllowed;
    setRoleMatrix((prev) => {
      const exists = prev.some((row) => row.role === role && row.mode_code === modeCode);
      if (exists) {
        return prev.map((row) =>
          row.role === role && row.mode_code === modeCode
            ? { ...row, allowed: nextAllowed }
            : row
        );
      }
      return [...prev, { role, mode_code: modeCode, allowed: nextAllowed }];
    });
    try {
      await api.adminUpdateRoleMode({
        role,
        mode_code: modeCode,
        allowed: nextAllowed,
      });
      if (onRefreshModes) onRefreshModes();
    } catch (err) {
      if (setActionError) setActionError(err.message);
      fetchData();
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-500" />
            {language === 'en' ? 'AI Provider & LLM Configuration' : 'Konfigurasi AI Provider & LLM'}
          </h3>
          <p className="text-xs text-content-muted mt-0.5">
            {language === 'en'
              ? 'Configure AI model gateways, model routing, chat modes, and role access permissions.'
              : 'Konfigurasi gateway provider AI, perutean model LLM, mode chat, dan hak akses per peran.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-content-muted hover:text-content bg-surface-sunken/80 border border-line hover:border-line-strong hover:bg-surface-hover transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-sm shadow-indigo-500/25 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'Add Mode' : 'Tambah Mode'}</span>
          </button>
        </div>
      </div>

      {/* AI Provider Gateway Settings (9Router & OpenRouter) */}
      <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-line/80">
          <div>
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-2 font-display">
              <Server className="w-4 h-4 text-accent" />
              {language === 'en' ? 'AI Model Provider Gateways' : 'Gateway Provider AI (Utama & Cadangan)'}
            </h4>
            <p className="text-xs text-content-muted mt-0.5">
              {language === 'en'
                ? 'Configure local 9Router cluster gateway or cloud OpenRouter failover provider.'
                : 'Konfigurasi gateway kluster lokal 9Router dan failover cloud OpenRouter.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveProviders}
            disabled={savingProviders}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingProviders ? (language === 'en' ? 'Saving...' : 'Menyimpan...') : (language === 'en' ? 'Save Providers' : 'Simpan Provider')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Card 1: 9Router (Local Gateway) */}
          <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            nineRouterEnabled 
              ? 'border-indigo-500/40 bg-surface shadow-xs hover:border-indigo-500/60' 
              : 'border-line/70 bg-surface opacity-60'
          } space-y-3.5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold shadow-2xs">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-content">
                    9Router (Local Gateway)
                  </h5>
                  <span className="text-[10px] text-indigo-400 font-medium">
                    {language === 'en' ? 'Primary Priority / Internal Network' : 'Prioritas Utama / Internal Network'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNineRouterEnabled(!nineRouterEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-all cursor-pointer ${
                  nineRouterEnabled ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-xs shadow-indigo-500/30' : 'bg-line'
                }`}
                aria-label="Toggle 9Router"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  nineRouterEnabled ? 'left-5.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-content-muted mb-1">
                  Base URL
                </label>
                <input 
                  type="text"
                  value={nineRouterBaseUrl}
                  onChange={(e) => setNineRouterBaseUrl(e.target.value)}
                  disabled={!nineRouterEnabled}
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none disabled:opacity-50 text-content font-mono transition-all"
                  placeholder="http://192.168.88.83:20128/v1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-content-muted mb-1">
                    Model Name
                  </label>
                  <input 
                    type="text"
                    value={nineRouterModel}
                    onChange={(e) => setNineRouterModel(e.target.value)}
                    disabled={!nineRouterEnabled}
                    className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none disabled:opacity-50 text-content font-mono transition-all"
                    placeholder="ag/gemini-3.7-flash-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-content-muted mb-1">
                    {language === 'en' ? 'API Key (Optional)' : 'API Key (Opsional)'}
                  </label>
                  <input 
                    type="password"
                    value={nineRouterApiKey}
                    onChange={(e) => setNineRouterApiKey(e.target.value)}
                    disabled={!nineRouterEnabled}
                    className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none disabled:opacity-50 text-content transition-all"
                    placeholder={language === 'en' ? 'Leave empty if unauthenticated' : 'Kosongkan jika tanpa auth'}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: OpenRouter (Cloud Gateway) */}
          <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
            openrouterEnabled 
              ? 'border-emerald-500/40 bg-surface shadow-xs hover:border-emerald-500/60' 
              : 'border-line/70 bg-surface opacity-60'
          } space-y-3.5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center font-bold shadow-2xs">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-content">
                    OpenRouter (Cloud AI)
                  </h5>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {language === 'en' ? 'Cloud Failover / Alternative' : 'Cloud Failover / Alternatif'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenrouterEnabled(!openrouterEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-all cursor-pointer ${
                  openrouterEnabled ? 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-xs shadow-emerald-500/30' : 'bg-line'
                }`}
                aria-label="Toggle OpenRouter"
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  openrouterEnabled ? 'left-5.5' : 'left-0.5'
                }`} />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-content-muted mb-1">
                  API Key
                </label>
                <input 
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  disabled={!openrouterEnabled}
                  className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-50 text-content transition-all"
                  placeholder="sk-or-v1-..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-content-muted mb-1">
                    Primary Model
                  </label>
                  <input 
                    type="text"
                    value={openrouterModel}
                    onChange={(e) => setOpenrouterModel(e.target.value)}
                    disabled={!openrouterEnabled}
                    className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-50 text-content font-mono transition-all"
                    placeholder="openrouter/auto"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-content-muted mb-1">
                    Fallback Model
                  </label>
                  <input 
                    type="text"
                    value={openrouterFallbackModel}
                    onChange={(e) => setOpenrouterFallbackModel(e.target.value)}
                    disabled={!openrouterEnabled}
                    className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-emerald-500/30 outline-none disabled:opacity-50 text-content font-mono transition-all"
                    placeholder="openrouter/free"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Grid: Chat Modes Master Switch & AI Suggestions Switch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {/* Master Toggle */}
        <div className="p-4 sm:p-5 rounded-2xl border border-line/80 bg-surface shadow-xs flex items-start sm:items-center justify-between gap-4 hover:border-line transition-all">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                masterEnabled ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25 shadow-2xs' : 'bg-surface-sunken text-content-subtle border-line'
              }`}
            >
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-content flex items-center gap-2 flex-wrap">
                <span>{language === 'en' ? 'Chat Modes (Master)' : 'Fitur Mode Chat (Master)'}</span>
                <span
                  className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                    masterEnabled
                      ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 font-bold'
                      : 'bg-surface-sunken text-content-subtle border-line/60'
                  }`}
                >
                  {masterEnabled
                    ? (language === 'en' ? 'Active' : 'Aktif')
                    : (language === 'en' ? 'Disabled' : 'Nonaktif')}
                </span>
              </h4>
              <p className="text-xs text-content-muted mt-0.5 line-clamp-2">
                {language === 'en'
                  ? 'When disabled, all users use standard default mode without dropdown selector.'
                  : 'Bila dimatikan, seluruh pengguna menggunakan mode default tanpa popover pilihan.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleToggleMaster(!masterEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-all cursor-pointer ${
              masterEnabled ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-xs shadow-indigo-500/30' : 'bg-line'
            }`}
            aria-label="Toggle Master Chat Modes"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              masterEnabled ? 'left-5.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* AI Dynamic Suggestions & Placeholders Toggle */}
        <div className="p-4 sm:p-5 rounded-2xl border border-line/80 bg-surface shadow-xs flex items-start sm:items-center justify-between gap-4 hover:border-line transition-all">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                suggestionsEnabled ? 'bg-purple-500/15 text-purple-400 border-purple-500/25 shadow-2xs' : 'bg-surface-sunken text-content-subtle border-line'
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-content flex items-center gap-2 flex-wrap">
                <span>{language === 'en' ? 'AI Suggestions & Ideas' : 'Saran Percakapan AI'}</span>
                <span
                  className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                    suggestionsEnabled
                      ? 'bg-purple-500/15 text-purple-400 border-purple-500/30 font-bold'
                      : 'bg-surface-sunken text-content-subtle border-line/60'
                  }`}
                >
                  {suggestionsEnabled
                    ? (language === 'en' ? 'Active' : 'Aktif')
                    : (language === 'en' ? 'Disabled' : 'Nonaktif')}
                </span>
              </h4>
              <p className="text-xs text-content-muted mt-0.5 line-clamp-2">
                {language === 'en'
                  ? 'Personalized prompt cards & placeholder ideas based on role & chat history. If off, uses static defaults.'
                  : 'Saran pertanyaan & ide kolom ketik dari role & riwayat chat. Bila nonaktif, memakai saran statis.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleToggleSuggestions(!suggestionsEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-all cursor-pointer ${
              suggestionsEnabled ? 'bg-gradient-to-r from-purple-500 to-indigo-600 shadow-xs shadow-purple-500/30' : 'bg-line'
            }`}
            aria-label="Toggle AI Suggestions"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              suggestionsEnabled ? 'left-5.5' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Modes Grid */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-2 font-display">
            <Sliders className="w-4 h-4 text-accent" />
            {language === 'en' ? 'Configured Modes' : 'Daftar Mode Percakapan'} ({modesList.length})
          </h4>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === 'en' ? 'Search modes...' : 'Cari mode...'}
            className="text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none w-full sm:w-64 text-content placeholder:text-content-subtle transition-all"
          />
        </div>

        {modesList.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-line/80 rounded-2xl bg-surface">
            <Sliders className="w-8 h-8 mx-auto mb-2 text-content-subtle opacity-40" />
            <p className="text-xs text-content-muted">
              {language === 'en' ? 'No chat modes configured yet.' : 'Belum ada mode percakapan.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {modesList
              .filter(
                (m) =>
                  !search ||
                  m.name?.toLowerCase().includes(search.toLowerCase()) ||
                  m.code?.toLowerCase().includes(search.toLowerCase()) ||
                  m.description?.toLowerCase().includes(search.toLowerCase())
              )
              .map((mode) => {
                const realIndex = modesList.findIndex((m) => m.id === mode.id);
                return (
                <div
                  key={mode.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                    mode.enabled
                      ? 'bg-surface border-line/80 hover:border-indigo-500/40 shadow-xs'
                      : 'bg-surface-sunken/40 border-line/60 opacity-60'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                          {renderModeIcon(mode.icon, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="font-bold text-xs sm:text-sm text-content truncate font-display">
                              {mode.name}
                            </h5>
                            {mode.is_default && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold shrink-0">
                                ★ {language === 'en' ? 'Default' : 'Default'}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-content-subtle block truncate">
                            #{mode.code}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(mode)}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-all cursor-pointer ${
                          mode.enabled ? 'bg-gradient-to-r from-indigo-500 to-violet-600 shadow-xs shadow-indigo-500/30' : 'bg-line'
                        }`}
                        aria-label={`Toggle ${mode.name}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          mode.enabled ? 'left-4.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    {mode.description && (
                      <p className="text-xs text-content-muted line-clamp-2 leading-relaxed">
                        {mode.description}
                      </p>
                    )}

                    {/* Mode Specs Badges */}
                    <div className="pt-1.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Iterations Badge */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 font-mono">
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>{mode.max_iterations || 15} iters</span>
                        </span>

                        {/* Primary Provider & Model Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium border truncate max-w-[210px] ${
                            (mode.provider || '').toLowerCase().includes('nine') || (mode.provider || '').toLowerCase().includes('9')
                              ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          }`}
                          title={`${formatProviderLabel(mode.provider)}: ${mode.model || 'auto'}`}
                        >
                          <Server className="w-3 h-3 shrink-0" />
                          <span className="font-bold">{formatProviderLabel(mode.provider)}</span>
                          <span className="opacity-40">•</span>
                          <span className="font-mono truncate">
                            {mode.model || 'auto'}
                          </span>
                        </span>
                      </div>

                      {/* Fallback info if configured */}
                      {mode.fallback_model && (
                        <div
                          className="flex items-center gap-1 text-[10px] text-content-subtle truncate max-w-full"
                          title={`Fallback: ${formatProviderLabel(mode.fallback_provider)} • ${mode.fallback_model}`}
                        >
                          <span className="opacity-70 font-sans">↳ Fallback:</span>
                          <span className="font-semibold text-content-secondary">{formatProviderLabel(mode.fallback_provider)}</span>
                          <span className="opacity-40">•</span>
                          <span className="font-mono truncate max-w-[140px]">
                            {mode.fallback_model}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-line/70">
                    <div>
                      {!mode.is_default && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(mode)}
                          className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{language === 'en' ? 'Set Default' : 'Jadikan Default'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Tombol Geser Posisi Urutan */}
                      <div className="flex items-center border border-line rounded-lg bg-surface-sunken/60 mr-1 p-0.5">
                        <button
                          type="button"
                          disabled={realIndex <= 0}
                          onClick={() => handleMoveMode(realIndex, 'left')}
                          className="p-1 rounded text-content-subtle hover:text-accent hover:bg-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title={language === 'en' ? 'Move earlier (left)' : 'Geser ke kiri / urutan sebelumnya'}
                          aria-label={language === 'en' ? 'Move left' : 'Geser kiri'}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span
                          className="text-[10px] font-mono font-bold text-content-subtle px-1 select-none"
                          title={language === 'en' ? `Position #${realIndex + 1}` : `Urutan ke-${realIndex + 1}`}
                        >
                          {realIndex + 1}
                        </span>
                        <button
                          type="button"
                          disabled={realIndex >= modesList.length - 1}
                          onClick={() => handleMoveMode(realIndex, 'right')}
                          className="p-1 rounded text-content-subtle hover:text-accent hover:bg-surface disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title={language === 'en' ? 'Move later (right)' : 'Geser ke kanan / urutan setelahnya'}
                          aria-label={language === 'en' ? 'Move right' : 'Geser kanan'}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingMode(mode);
                          setEditForm({
                            code: mode.code || '',
                            name: mode.name || '',
                            description: mode.description || '',
                            icon: mode.icon || 'zap',
                            provider: mode.provider || '9router',
                            model: mode.model || 'ag/gemini-3.7-flash-medium',
                            fallback_provider: mode.fallback_provider || 'openrouter',
                            fallback_model: mode.fallback_model || 'openrouter/free',
                            max_iterations: mode.max_iterations || 15,
                            enabled: Boolean(mode.enabled),
                            is_default: Boolean(mode.is_default),
                            sort_order: mode.sort_order || 0,
                          });
                        }}
                        className="p-1.5 rounded-lg text-content-subtle hover:text-accent hover:bg-surface-raised transition-colors cursor-pointer"
                        title={t('common.edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={mode.is_default}
                        onClick={() => handleDelete(mode)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          mode.is_default
                            ? 'text-content-subtle opacity-20 cursor-not-allowed'
                            : 'text-content-subtle hover:text-rose-500 hover:bg-surface-raised cursor-pointer'
                        }`}
                        title={mode.is_default ? (language === 'en' ? 'Default mode cannot be deleted' : 'Mode default tidak dapat dihapus') : t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Role Access Matrix */}
      <div className="p-5 sm:p-6 rounded-2xl border border-line/80 bg-surface shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-content flex items-center gap-2 font-display">
              <Lock className="w-4 h-4 text-accent" />
              {language === 'en' ? 'Role Access Matrix (Permissions)' : 'Matrix Hak Akses Per Peran'}
            </h4>
            <p className="text-xs text-content-muted mt-0.5">
              {language === 'en'
                ? 'Check/uncheck to permit roles to use each mode. Locked modes will be disabled in the composer.'
                : 'Centang untuk mengizinkan role menggunakan mode chat. Mode yang terkunci akan tampil disable dengan gembok.'}
            </p>
          </div>
          <span className="text-[11px] font-mono text-content-muted bg-surface-sunken px-2.5 py-1 rounded-lg border border-line/60">
            {modesList.length} Modes × {ALL_ROLES.length} Roles
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar border border-line/80 rounded-2xl bg-surface shadow-2xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-sunken/70 border-b border-line/80 text-content-muted uppercase text-[10px] tracking-wider font-bold">
              <tr>
                <th className="py-3 px-4 min-w-[140px] sticky left-0 bg-surface-sunken z-10">Role</th>
                {modesList.map((m) => (
                  <th key={m.code} className="py-3 px-3 text-center min-w-[110px]">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{renderModeIcon(m.icon, 'w-3.5 h-3.5')}</span>
                      <span className="truncate max-w-[90px]">{m.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {ALL_ROLES.map(({ role, label }) => (
                <tr key={role} className="hover:bg-surface-hover/70 transition-colors">
                  <td className="py-3 px-4 sticky left-0 bg-surface z-10 border-r border-line/60">
                    <span className="font-semibold text-content block text-xs">{label}</span>
                    <span className="text-[10px] text-content-subtle font-mono block">{role}</span>
                  </td>
                  {modesList.map((mode) => {
                    const match = roleMatrix.find(
                      (rm) => rm.role === role && rm.mode_code === mode.code
                    );
                    const isAllowed = match
                      ? Boolean(match.allowed)
                      : role === 'superadmin';

                    return (
                      <td key={mode.code} className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRoleAccess(role, mode.code, isAllowed)}
                          className={`inline-flex items-center justify-center p-2 rounded-xl border transition-all cursor-pointer ${
                            isAllowed
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                              : 'bg-surface-sunken border-line/60 text-content-subtle hover:bg-surface-hover opacity-40'
                          }`}
                          title={`${label} → ${mode.name}: ${isAllowed ? 'Allowed' : 'Forbidden'}`}
                        >
                          {isAllowed ? <Check className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn overflow-y-auto"
          style={{
            paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
            paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
          }}
        >
          <div
            className="bg-surface-raised border border-line/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden modal-panel my-auto flex flex-col"
            style={{
              maxHeight: 'calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 2.5rem)'
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line/80 bg-surface">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-accent" />
                <h4 className="font-bold text-sm text-content font-display">
                  {language === 'en' ? 'Add New Chat Mode' : 'Tambah Mode Chat Baru'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="p-1 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Kode Mode *</label>
                  <input
                    type="text"
                    required
                    value={newForm.code}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                      })
                    }
                    placeholder="e.g. expert_sap"
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none font-mono text-content transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Nama Mode *</label>
                  <input
                    type="text"
                    required
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="e.g. Expert SAP"
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">Deskripsi</label>
                <input
                  type="text"
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  placeholder="e.g. Maximum reasoning & SAP tools"
                  className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Ikon</label>
                  <select
                    value={newForm.icon}
                    onChange={(e) => setNewForm({ ...newForm, icon: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none cursor-pointer text-content transition-all"
                  >
                    {['zap', 'gauge', 'brain', 'sparkles', 'cpu', 'bot', 'sliders', 'wrench', 'search'].map((ic) => (
                      <option key={ic} value={ic}>{ic.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Maksimal Iterasi (1-50) *</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={newForm.max_iterations}
                    onChange={(e) => setNewForm({ ...newForm, max_iterations: parseInt(e.target.value, 10) || 15 })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none font-mono text-content transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Provider *</label>
                  <select
                    value={newForm.provider}
                    onChange={(e) => setNewForm({ ...newForm, provider: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none cursor-pointer text-content transition-all"
                  >
                    <option value="9router">9Router (Local Gateway)</option>
                    <option value="openrouter">OpenRouter (Cloud)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Model *</label>
                  <input
                    type="text"
                    required
                    value={newForm.model}
                    onChange={(e) => setNewForm({ ...newForm, model: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none font-mono text-content transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-content">
                  <input
                    type="checkbox"
                    checked={newForm.enabled}
                    onChange={(e) => setNewForm({ ...newForm, enabled: e.target.checked })}
                    className="rounded border-line text-indigo-600 focus:ring-accent/30 cursor-pointer"
                  />
                  <span>{language === 'en' ? 'Enabled' : 'Aktif'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-content">
                  <input
                    type="checkbox"
                    checked={newForm.is_default}
                    onChange={(e) => setNewForm({ ...newForm, is_default: e.target.checked })}
                    className="rounded border-line text-indigo-600 focus:ring-accent/30 cursor-pointer"
                  />
                  <span>{language === 'en' ? 'Set as Default' : 'Jadikan Default'}</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line/80">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('common.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn overflow-y-auto"
          style={{
            paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
            paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
          }}
        >
          <div
            className="bg-surface-raised border border-line/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden modal-panel my-auto flex flex-col"
            style={{
              maxHeight: 'calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 2.5rem)'
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-line/80 bg-surface">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-accent" />
                <h4 className="font-bold text-sm text-content font-display">
                  {language === 'en' ? 'Edit Chat Mode' : 'Edit Mode Chat'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingMode(null)}
                className="p-1 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => handleUpdate(editingMode.id, e)} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Kode Mode *</label>
                  <input
                    type="text"
                    required
                    value={editForm.code}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                      })
                    }
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none font-mono text-content transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Nama Mode *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">Deskripsi</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent/40 outline-none text-content transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Ikon</label>
                  <select
                    value={editForm.icon}
                    onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none cursor-pointer text-content transition-all"
                  >
                    {['zap', 'gauge', 'brain', 'sparkles', 'cpu', 'bot', 'sliders', 'wrench', 'search'].map((ic) => (
                      <option key={ic} value={ic}>{ic.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Maksimal Iterasi (1-50) *</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={editForm.max_iterations}
                    onChange={(e) => setEditForm({ ...editForm, max_iterations: parseInt(e.target.value, 10) || 15 })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none font-mono text-content transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Provider *</label>
                  <select
                    value={editForm.provider}
                    onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none cursor-pointer text-content transition-all"
                  >
                    <option value="9router">9Router (Local Gateway)</option>
                    <option value="openrouter">OpenRouter (Cloud)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-content-muted mb-1">Model *</label>
                  <input
                    type="text"
                    required
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    className="w-full text-xs px-3.5 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 outline-none font-mono text-content transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-content">
                  <input
                    type="checkbox"
                    checked={editForm.enabled}
                    onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                    className="rounded border-line text-indigo-600 focus:ring-accent/30 cursor-pointer"
                  />
                  <span>{language === 'en' ? 'Enabled' : 'Aktif'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-content">
                  <input
                    type="checkbox"
                    checked={editForm.is_default}
                    onChange={(e) => setEditForm({ ...editForm, is_default: e.target.checked })}
                    className="rounded border-line text-indigo-600 focus:ring-accent/30 cursor-pointer"
                  />
                  <span>{language === 'en' ? 'Set as Default' : 'Jadikan Default'}</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line/80">
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="px-4 py-2 text-xs font-semibold text-content-muted hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl shadow-sm shadow-indigo-500/25 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('common.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
