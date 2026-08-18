import React, { useState, useEffect } from 'react';
import { X, Save, Database, Shield, Lock, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose, user }) => {
  const [config, setConfig] = useState({
    mcp_sap_config_json: '',
    mcp_rag_config_json: '',
    assistant_persona: ''
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
      fetch('http://127.0.0.1:8000/api/config', {
        headers: { 'X-User-Name': user.username }
      })
        .then(res => res.json())
        .then(data => {
          setConfig({
            mcp_sap_config_json: data.mcp_sap_config_json || '',
            mcp_rag_config_json: data.mcp_rag_config_json || '',
            assistant_persona: data.assistant_persona || ''
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
      const res = await fetch('http://127.0.0.1:8000/api/config', {
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
      const res = await fetch('http://127.0.0.1:8000/api/change-password', {
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
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Settings & Account
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">User: <strong className="text-slate-700 dark:text-slate-200">{user?.username || 'Guest'}</strong></span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                isSuperadmin 
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}>
                <Shield className="w-3 h-3" />
                {isSuperadmin ? 'Superadmin' : (isLoggedIn ? 'User' : 'Guest')}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Assistant Persona (Bisa diubah oleh user login) */}
          {isLoggedIn && (
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <span className="text-xl">🎭</span>
                Personal Assistant Persona ({user?.username})
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Instruksi khusus dan preferensi respons asisten untuk akun Anda.
              </p>
              <textarea 
                value={config.assistant_persona}
                onChange={e => setConfig({...config, assistant_persona: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y min-h-[80px]"
                placeholder="Contoh: Selalu jawab dengan singkat, lugas, dan sertakan contoh kode ABAP jika relevan."
              />
            </div>
          )}

          {/* Form Ubah Password (Khusus User Login) */}
          {isLoggedIn && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-3">
                <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                Ubah Password Akun
              </h3>

              <form onSubmit={handleChangePassword} className="space-y-3">
                {passMessage.text && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    passMessage.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                  }`}>
                    {passMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{passMessage.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password Lama</label>
                  <input 
                    type="password"
                    required
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Masukkan password lama"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Password Baru</label>
                    <input 
                      type="password"
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Password baru"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Konfirmasi Password</label>
                    <input 
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="Ulangi password baru"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {isChangingPass ? 'Memproses...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}

          {/* MCP Settings (Khusus Superadmin) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Konfigurasi MCP Server (System Level)
              </h3>
              {!isSuperadmin && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Managed by Superadmin
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <Database className="w-4 h-4 text-blue-500" />
                  MCP SAP Configuration (JSON)
                </label>
                <textarea 
                  disabled={!isSuperadmin}
                  value={config.mcp_sap_config_json}
                  onChange={e => setConfig({...config, mcp_sap_config_json: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder='{\n  "mcpServers": {\n    "sap-leader-remote": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <Database className="w-4 h-4 text-emerald-500" />
                  MCP RAG Configuration (JSON)
                </label>
                <textarea 
                  disabled={!isSuperadmin}
                  value={config.mcp_rag_config_json}
                  onChange={e => setConfig({...config, mcp_rag_config_json: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono resize-y min-h-[90px] disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder='{\n  "mcpServers": {\n    "manufacturing-rag": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
                />
              </div>
            </div>
          </div>

        </div>

        {/* Footer Modal */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-sm font-medium">
            {saveStatus === 'success' && <span className="text-emerald-600 dark:text-emerald-400">Pengaturan berhasil disimpan!</span>}
            {saveStatus === 'error' && <span className="text-rose-600 dark:text-rose-400">Gagal menyimpan pengaturan.</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Tutup
            </button>
            {isLoggedIn && (
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-70"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Persona & Server'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;