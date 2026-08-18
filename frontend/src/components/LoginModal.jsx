import React, { useState } from 'react';
import { Lock, User, KeyRound, LogIn, AlertCircle, X, UserCheck, Sparkles, ShieldCheck } from 'lucide-react';

const LoginModal = ({ isOpen, onLoginSuccess, onGuestContinue, customMessage, onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onLoginSuccess({
          username: data.username,
          role: data.role,
          assistant_persona: data.assistant_persona
        });
      } else {
        setError(data.detail || 'Login gagal. Periksa username dan password.');
      }
    } catch (err) {
      setError('Gagal terhubung ke backend server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200/80 dark:border-zinc-800 animate-in zoom-in-95 duration-200 relative">
        
        {/* Close Button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 p-2 rounded-full transition-all z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header with Indigo Gradient & Badge */}
        <div className="bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 px-6 py-8 text-center text-white relative">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg border border-white/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold font-display">SAP AI Co-Pilot Login</h2>
          <p className="text-xs text-indigo-100 mt-1 max-w-xs mx-auto">
            Masuk untuk mengakses layanan Enterprise SAP & Knowledge Base tanpa batas prompt
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {customMessage && (
            <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-amber-700 dark:text-amber-300 text-xs font-medium leading-relaxed">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{customMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
              Username SAP
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input 
                type="text" 
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                placeholder="Masukkan username SAP"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white font-bold py-3 px-4 rounded-2xl shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-70 text-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>{isLoading ? 'Memverifikasi...' : 'Masuk Aplikasi'}</span>
          </button>

          {/* Guest Continue Option */}
          {onGuestContinue && (
            <div className="pt-2 text-center border-t border-slate-100 dark:border-zinc-800 mt-4">
              <button
                type="button"
                onClick={onGuestContinue}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 font-medium py-1.5 px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Lanjutkan sebagai Guest (1 prompt/hari)</span>
              </button>
            </div>
          )}
        </form>

      </div>
    </div>
  );
};

export default LoginModal;