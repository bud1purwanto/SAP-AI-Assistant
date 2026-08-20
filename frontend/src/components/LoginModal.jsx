import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Lock, LogIn, User, UserCheck, X } from 'lucide-react';
import { api } from '../lib/api';

const LoginModal = ({ isOpen, onLoginSuccess, onGuestContinue, customMessage, onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const usernameRef = useRef(null);

  // Tutup dengan Esc dan pindahkan fokus ke field pertama saat dialog dibuka.
  useEffect(() => {
    if (!isOpen) return undefined;
    usernameRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await api.login(username, password);
      // access_token diteruskan ke pemanggil untuk disimpan bersama profil user.
      onLoginSuccess({
        access_token: data.access_token,
        username: data.username,
        full_name: data.full_name || '',
        role: data.role,
        assistant_persona: data.assistant_persona,
      });
    } catch (err) {
      setError(err.message || 'Login gagal. Periksa username dan password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div className="bg-surface-raised rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md overflow-hidden border border-line relative my-auto">

        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 p-1.5 rounded-full transition-all z-10"
            aria-label="Tutup dialog login"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        <div className="bg-accent px-5 py-4 sm:py-6 text-center text-accent-fg">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2 border border-white/20">
            <Lock className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
          </div>
          <h2 id="login-title" className="text-base sm:text-lg font-bold font-display leading-tight">SAP AI Co-Pilot Login</h2>
          <p className="text-[11px] sm:text-xs opacity-90 mt-1 max-w-xs mx-auto leading-normal">
            Masuk untuk mengakses layanan Enterprise SAP & Knowledge Base tanpa batas prompt
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          {customMessage && (
            <div className="flex items-center gap-2 p-2.5 sm:p-3 bg-warning-soft border border-warning/40 rounded-xl text-warning text-xs font-medium leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{customMessage}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 p-2.5 sm:p-3 bg-danger-soft border border-danger/40 rounded-xl text-danger text-xs font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
              Username SAP
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-content-subtle" aria-hidden="true" />
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-sunken border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-content focus:border-accent transition-all font-mono"
                placeholder="Masukkan username SAP"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-3 text-content-subtle" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-sunken border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-content focus:border-accent transition-all font-mono"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-accent-fg font-bold py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-70 text-xs sm:text-sm"
          >
            <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>{isLoading ? 'Memverifikasi…' : 'Masuk Aplikasi'}</span>
          </button>

          {onGuestContinue && (
            <div className="pt-2 text-center border-t border-line mt-4">
              <button
                type="button"
                onClick={onGuestContinue}
                className="inline-flex items-center gap-1.5 text-xs text-content-muted hover:text-content font-medium py-1.5 px-3 rounded-xl hover:bg-surface-hover transition-all"
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Lanjutkan sebagai Guest</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
