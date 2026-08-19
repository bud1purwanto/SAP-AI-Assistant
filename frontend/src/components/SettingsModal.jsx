import React, { useState, useEffect } from 'react';
import { 
  X, Save, Database, Shield, Lock, KeyRound, CheckCircle2, AlertCircle, 
  Bot, User, Sliders, Cpu, Globe, Server, Check, ToggleLeft, ToggleRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const SettingsModal = ({ isOpen, onClose, user }) => {
  const [activeTab, setActiveTab] = useState('persona');
  const [config, setConfig] = useState({
    mcp_sap_config_json: '',
    mcp_rag_config_json: '',
    assistant_persona: '',
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
    if (isOpen && user?.username && user?.username !== 'Guest') {
      fetch(`${API_BASE_URL}/api/config`, {
        headers: { 'X-User-Name': user.username }
      })
        .then(res => res.json())
        .then(data => {
          setConfig({
            mcp_sap_config_json: data.mcp_sap_config_json || '',
            mcp_rag_config_json: data.mcp_rag_config_json || '',
            assistant_persona: data.assistant_persona || '',
            nine_router_enabled: data.nine_router_enabled ?? true,
            nine_router_base_url: data.nine_router_base_url || 'http://192.168.88.83:20128/v1',
            nine_router_model: data.nine_router_model || 'ag/gemini-3.7-flash-medium',
            nine_router_api_key: data.nine_router_api_key || '',
            openrouter_enabled: data.openrouter_enabled ?? false,
            openrouter_model: data.openrouter_model || 'openrouter/auto',
            openrouter_fallback_model: data.openrouter_fallback_model || 'openrouter/free',
            openrouter_api_key: data.openrouter_api_key || ''
          });
          setUserRole(data.role || user.role || 'user');
        })
        .catch(err => console.error("Failed to load config", err));
    }
  }, [isOpen, user]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Name': user?.username || 'Guest'
        },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => onClose(), 1000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
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

    if (newPassword.length < 4) {
      setPassMessage({ type: 'error', text: 'Password baru minimal 4 karakter.' });
      return;
    }

    setIsChangingPass(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Name': user?.username
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        setPassMessage({ type: 'success', text: 'Password berhasil diperbarui!' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPassMessage({ type: 'error', text: data.detail || 'Gagal mengubah password.' });
      }
    } catch (err) {
      setPassMessage({ type: 'error', text: 'Gagal terhubung ke server backend.' });
    } finally {
      setIsChangingPass(false);
    }
  };

  if (!isOpen) return null;

  const isSuperadmin = userRole === 'superadmin';
  const isLoggedIn = user?.username && user?.username !== 'Guest';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200/80 dark:border-zinc-800 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Settings & Account
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 dark:text-zinc-400">User: <strong className="text-slate-700 dark:text-zinc-200">{user?.username || 'Guest'}</strong></span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
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

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-zinc-800 px-6 pt-2 gap-2 bg-slate-50/50 dark:bg-zinc-900/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('persona')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'persona'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Assistant Persona</span>
          </button>

          {isSuperadmin && (
            <button
              onClick={() => setActiveTab('router')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'router'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Provider & Router</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('mcp')}
            className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>MCP Config {isSuperadmin ? '' : '(Read Only)'}</span>
          </button>

          {isLoggedIn && (
            <button
              onClick={() => setActiveTab('security')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'security'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Password Akun</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* TAB 1: Persona */}
          {activeTab === 'persona' && (
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
                  🎭 Personal AI Assistant Prompt
                </label>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-3 leading-relaxed">
                  Sesuaikan gaya respon, preferensi format ABAP code, atau instruksi khusus untuk asisten AI Anda.
                </p>
                <textarea 
                  disabled={!isLoggedIn}
                  value={config.assistant_persona}
                  onChange={e => setConfig({...config, assistant_persona: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-y min-h-[140px] disabled:opacity-60"
                  placeholder={isLoggedIn ? "Contoh: Berikan ringkasan tabel SAP terlebih dahulu, lalu jelaskan alur prosesnya secara step-by-step." : "Login untuk mengkustomisasi persona asisten Anda."}
                />
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
                  : 'bg-slate-50/60 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-800 opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">9Router (Local Gateway / Primary)</h4>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400">Endpoint gateway AI lokal berkecepatan tinggi</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig({...config, nine_router_enabled: !config.nine_router_enabled})}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.nine_router_enabled
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                    }`}
                  >
                    {config.nine_router_enabled ? 'Aktif (Primary)' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Base URL</label>
                    <input 
                      type="text"
                      value={config.nine_router_base_url}
                      onChange={e => setConfig({...config, nine_router_base_url: e.target.value})}
                      className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                      placeholder="http://192.168.88.83:20128/v1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Model Name</label>
                      <input 
                        type="text"
                        value={config.nine_router_model}
                        onChange={e => setConfig({...config, nine_router_model: e.target.value})}
                        className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                        placeholder="ag/gemini-3.7-flash-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">API Key (Opsional)</label>
                      <input 
                        type="password"
                        value={config.nine_router_api_key}
                        onChange={e => setConfig({...config, nine_router_api_key: e.target.value})}
                        className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
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
                  : 'bg-slate-50/60 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-800 opacity-80'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-purple-600 text-white rounded-lg">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">OpenRouter (Cloud Failover / Gateway)</h4>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400">Penyedia model AI multi-cloud (Gemini, Claude, GPT-4o, dll)</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfig({...config, openrouter_enabled: !config.openrouter_enabled})}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.openrouter_enabled
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                    }`}
                  >
                    {config.openrouter_enabled ? 'Aktif (Failover)' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">OpenRouter API Key</label>
                    <input 
                      type="password"
                      value={config.openrouter_api_key}
                      onChange={e => setConfig({...config, openrouter_api_key: e.target.value})}
                      className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-purple-500"
                      placeholder="sk-or-v1-..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Primary Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_model}
                        onChange={e => setConfig({...config, openrouter_model: e.target.value})}
                        className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-purple-500"
                        placeholder="openrouter/auto"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">Fallback Model</label>
                      <input 
                        type="text"
                        value={config.openrouter_fallback_model}
                        onChange={e => setConfig({...config, openrouter_fallback_model: e.target.value})}
                        className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-purple-500"
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
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
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
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    MCP SAP Remote Endpoint (SSE / JSON-RPC)
                  </label>
                  <textarea 
                    disabled={!isSuperadmin}
                    value={config.mcp_sap_config_json}
                    onChange={e => setConfig({...config, mcp_sap_config_json: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder='{\n  "mcpServers": {\n    "sap-leader-remote": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    MCP RAG Remote Endpoint (SSE / JSON-RPC)
                  </label>
                  <textarea 
                    disabled={!isSuperadmin}
                    value={config.mcp_rag_config_json}
                    onChange={e => setConfig({...config, mcp_rag_config_json: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-2.5 text-xs text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder='{\n  "mcpServers": {\n    "manufacturing-rag": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
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
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">Password Lama</label>
                <input 
                  type="password"
                  required
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Masukkan password saat ini"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">Password Baru</label>
                  <input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Minimal 4 karakter"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">Konfirmasi Password</label>
                  <input 
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="text-xs font-medium">
            {saveStatus === 'success' && <span className="text-emerald-600 dark:text-emerald-400 font-bold">Pengaturan berhasil disimpan!</span>}
            {saveStatus === 'error' && <span className="text-rose-600 dark:text-rose-400 font-bold">Gagal menyimpan pengaturan.</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors"
            >
              Tutup
            </button>
            {isLoggedIn && (
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-gradient-to-tr from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-70"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;