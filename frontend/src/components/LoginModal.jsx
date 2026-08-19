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
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div className="bg-surface-raised rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-line relative">

        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 p-2 rounded-full transition-all z-10"
            aria-label="Tutup dialog login"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        <div className="bg-accent px-6 py-8 text-center text-accent-fg">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20">
            <Lock className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 id="login-title" className="text-xl font-bold font-display">SAP AI Co-Pilot Login</h2>
          <p className="text-xs opacity-90 mt-1 max-w-xs mx-auto">
            Masuk untuk mengakses layanan Enterprise SAP &amp; Knowledge Base tanpa batas prompt
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {customMessage && (
            <div className="flex items-center gap-2.5 p-3.5 bg-warning-soft border border-warning/40 rounded-2xl text-warning text-xs font-medium leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{customMessage}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 p-3 bg-danger-soft border border-danger/40 rounded-2xl text-danger text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">
              Username SAP
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3.5 text-content-subtle" aria-hidden="true" />
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-sunken border border-line rounded-2xl pl-10 pr-4 py-2.5 text-sm text-content focus:border-accent transition-all font-mono"
                placeholder="Masukkan username SAP"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-content-secondary mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-content-subtle" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-sunken border border-line rounded-2xl pl-10 pr-4 py-2.5 text-sm text-content focus:border-accent transition-all font-mono"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-accent-fg font-bold py-3 px-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 text-sm"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
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
