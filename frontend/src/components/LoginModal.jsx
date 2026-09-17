import React, { useState, useEffect } from 'react';
import { LogIn, X, Lock, User, Loader2, Trash2 } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { api, saveSession } from '../lib/api';

const RECENT_ACCOUNTS_KEY = 'sap_recent_accounts';

const LoginModal = ({ isOpen, customMessage, onClose, onSuccess }) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentAccounts, setRecentAccounts] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPassword('');
      try {
        const stored = localStorage.getItem(RECENT_ACCOUNTS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setRecentAccounts(parsed);
            if (parsed.length > 0 && !username) {
              setUsername(parsed[0]);
            }
          }
        }
      } catch {
        /* ignore localStorage error */
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectRecent = (account) => {
    setUsername(account);
    setError('');
  };

  const handleRemoveRecent = (e, accountToRemove) => {
    e.stopPropagation();
    const updated = recentAccounts.filter((acc) => acc !== accountToRemove);
    setRecentAccounts(updated);
    try {
      localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    if (username === accountToRemove) {
      setUsername(updated[0] || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setError(t('login.failed') || 'Username dan password wajib diisi.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await api.login(cleanUser, password);
      if (res && res.status === 'success' && res.user) {
        saveSession(res.access_token, res.user);

        // Update recent accounts
        try {
          const nextRecent = [cleanUser, ...recentAccounts.filter((acc) => acc.toLowerCase() !== cleanUser.toLowerCase())].slice(0, 5);
          localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(nextRecent));
        } catch {
          /* ignore */
        }

        if (typeof onSuccess === 'function') {
          onSuccess(res.user);
        } else {
          window.location.reload();
        }
      } else {
        setError(t('login.failed') || 'Login gagal. Periksa username dan password.');
      }
    } catch (err) {
      setError(err?.message || t('login.failed') || 'Login gagal.');
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
      <div className="bg-surface-raised rounded-2xl shadow-2xl w-full max-w-md border border-line relative p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-content-muted hover:text-content p-1.5 rounded-full transition-colors"
            aria-label={t('login.closeAria')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent">
            <LogIn className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 id="login-title" className="text-xl font-bold text-content">
            {t('login.title') || 'Masuk Enterprise AI Assistant'}
          </h2>
          <p className="text-xs text-content-muted mt-1.5 leading-relaxed">
            {customMessage || t('login.subtitle') || 'Masuk untuk mengakses layanan Enterprise SAP & basis dokumen.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl flex items-center gap-2">
            <span>⚠️</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        {recentAccounts.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-content-muted mb-1.5">
              {t('login.recentAccounts') || 'Akun Pernah Login:'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentAccounts.map((acc) => (
                <div
                  key={acc}
                  onClick={() => handleSelectRecent(acc)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                    username.toLowerCase() === acc.toLowerCase()
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-surface border-line text-content-muted hover:text-content hover:bg-surface-raised'
                  }`}
                >
                  <span>{acc}</span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveRecent(e, acc)}
                    className="text-content-muted hover:text-red-400 p-0.5"
                    title={t('login.removeRecent')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-1">
              {t('login.usernameLabel') || 'Username'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.usernamePlaceholder') || 'Masukkan username'}
                autoComplete="username"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-surface border border-line rounded-xl text-content text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-muted mb-1">
              {t('login.passwordLabel') || 'Password'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder') || '••••••••'}
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-surface border border-line rounded-xl text-content text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 rounded-xl bg-accent text-accent-contrast font-semibold px-4 py-2.5 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('login.verifying') || 'Memverifikasi…'}</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>{t('login.submit') || 'Masuk Aplikasi'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
