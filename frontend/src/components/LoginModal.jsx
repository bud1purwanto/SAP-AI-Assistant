import React, { useState, useEffect } from 'react';
import { LogIn, X, Lock, User, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { api, saveSession } from '../lib/api';

const RECENT_ACCOUNTS_KEY = 'sap_recent_accounts';

const LoginModal = ({ isOpen, customMessage, onClose, onSuccess }) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeRequired, setChangeRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentAccounts, setRecentAccounts] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangeRequired(false);
      setShowPassword(false);
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
    setChangeRequired(false);
    setNewPassword('');
    setConfirmPassword('');
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
      setError(t('login.required'));
      return;
    }

    setIsLoading(true);
    setError('');

    const completeLogin = (res) => {
      saveSession(res.access_token, res.user);
      try {
        const nextRecent = [cleanUser, ...recentAccounts.filter((acc) => acc.toLowerCase() !== cleanUser.toLowerCase())].slice(0, 5);
        localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(nextRecent));
      } catch {
        /* ignore */
      }
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (typeof onSuccess === 'function') {
        onSuccess(res.user);
      } else {
        window.location.reload();
      }
    };

    if (changeRequired) {
      if (!newPassword || !confirmPassword) {
        setError(t('login.new_password_required'));
        setIsLoading(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(t('login.password_mismatch'));
        setIsLoading(false);
        return;
      }
      let passwordChanged = false;
      try {
        await api.changeOidcPassword(cleanUser, password, newPassword);
        passwordChanged = true;
        const res = await api.login(cleanUser, newPassword);
        if (!res || res.status !== 'success' || !res.user) {
          throw new Error('Automatic login failed');
        }
        completeLogin(res);
      } catch (err) {
        if (passwordChanged) {
          setPassword(newPassword);
          setNewPassword('');
          setConfirmPassword('');
          setChangeRequired(false);
          setError(t('login.password_changed_login_failed'));
        } else {
          const status = err?.status;
          setError(t(status === 401 ? 'login.failed' : status === 502 ? 'login.dashboard_unreachable' : 'login.password_change_failed'));
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const res = await api.login(cleanUser, password);
      if (res && res.status === 'success' && res.user) {
        completeLogin(res);
      } else {
        setError(t('login.failed'));
      }
    } catch (err) {
      const status = err?.response?.status ?? err?.status;
      let msgKey = 'login.failed';
      if (status === 400) msgKey = 'login.required';
      else if (status === 403) {
        setChangeRequired(true);
        setError('');
        return;
      }
      else if (status === 502) msgKey = 'login.dashboard_unreachable';
      setError(t(msgKey));
    } finally {
      setIsLoading(false);
    }
  };

  if (changeRequired) {
    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="bg-surface-raised rounded-2xl shadow-2xl w-full max-w-md my-auto border border-line relative p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => {
              setChangeRequired(false);
              setPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setError('');
            }}
            className="absolute top-3 right-3 text-content-muted hover:text-content p-1.5 rounded-full transition-colors"
            aria-label={t('login.closePasswordChange')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <Lock className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 id="change-password-title" className="text-xl font-bold text-content">{t('login.change_password_title')}</h2>
          </div>
          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-xl">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="new-oidc-password" className="block text-xs font-semibold text-content-muted mb-1">{t('login.new_password')}</label>
              <input id="new-oidc-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required autoFocus className="w-full px-3 py-2.5 bg-surface border border-line rounded-xl text-content text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label htmlFor="confirm-oidc-password" className="block text-xs font-semibold text-content-muted mb-1">{t('login.confirm_password')}</label>
              <input id="confirm-oidc-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required className="w-full px-3 py-2.5 bg-surface border border-line rounded-xl text-content text-sm focus:outline-none focus:border-accent" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-accent text-accent-contrast font-semibold px-4 py-2.5 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t('login.change_password_submit')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div className="bg-surface-raised rounded-[36px] sm:rounded-[40px] shadow-2xl w-full max-w-sm my-auto border border-line/80 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Curved Sky Blue Dome Top with Motif Pattern (Mockup Style) */}
        <div className="bg-gradient-to-b from-[#EBF3FE] via-[#EEF5FF] to-[#F5F8FF] dark:from-slate-800/90 dark:via-slate-800/60 dark:to-slate-900 p-6 pt-8 pb-7 rounded-b-[40px] relative text-center border-b border-blue-100/60 dark:border-slate-700/50 overflow-hidden">
          
          {/* Circular Motif Rings (Motif-motif di header seperti mockup) */}
          <div className="absolute -top-16 -left-12 w-48 h-48 rounded-full border border-blue-200/50 dark:border-blue-400/10 pointer-events-none" />
          <div className="absolute -top-8 -left-4 w-36 h-36 rounded-full border border-blue-200/40 dark:border-blue-400/10 pointer-events-none" />
          <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full border border-blue-200/50 dark:border-blue-400/10 pointer-events-none" />
          <div className="absolute -top-4 -right-4 w-40 h-40 rounded-full border border-blue-200/40 dark:border-blue-400/10 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-blue-200/30 dark:border-blue-400/5 pointer-events-none" />

          {/* Close button - only shown if onClose allowed (not forced) */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-full hover:bg-white/80 dark:hover:bg-slate-700/50 transition-colors cursor-pointer z-10"
              aria-label={t('login.closeAria')}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          {/* 3D Cute Robot Mascot Avatar Container (Mockup Aligned) */}
          <div className="relative w-24 h-24 mx-auto mb-4 flex items-center justify-center z-10">
            {/* White Robot Head Container */}
            <div className="w-20 h-20 rounded-[26px] bg-white dark:bg-slate-800 shadow-lg shadow-blue-500/10 border border-white/80 dark:border-slate-700 flex flex-col items-center justify-center relative">
              {/* Headphone Ears (Vibrant Blue Pill) */}
              <div className="absolute -left-2.5 top-5 w-3 h-8 rounded-full bg-[#2563EB] shadow-xs" />
              <div className="absolute -right-2.5 top-5 w-3 h-8 rounded-full bg-[#2563EB] shadow-xs" />
              
              {/* Dark Visor Screen */}
              <div className="w-13 h-9 bg-[#111827] rounded-2xl flex items-center justify-center gap-2 shadow-inner">
                {/* Glowing Cyan Eyes */}
                <span className="w-2 h-2 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4] animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4] animate-pulse" />
              </div>
              
              {/* Robot Smile / Chin Accent */}
              <div className="w-4 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mt-1.5" />
            </div>

            {/* Floating Speech Bubble with icon at top right */}
            <div className="absolute -top-1 right-0 w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-md border border-blue-100/80 dark:border-slate-700 flex items-center justify-center text-xs animate-bounce">
              <span className="text-[11px] text-purple-400">💬</span>
            </div>
          </div>

          <div className="relative z-10 space-y-1">
            <span className="inline-block text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              ENTERPRISE EDITION
            </span>
            <h2 id="login-title" className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Enterprise.Ai
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
              {customMessage || t('login.subtitle') || 'Asisten kerja cerdas untuk akses instan SAP ERP, RAG SOP, dan Analitik.'}
            </p>
          </div>
        </div>

        <div className="p-6 pt-5">

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

          {/* Input Password */}
          <div>
            <label className="block text-xs font-semibold text-content-muted mb-1">
              {t('login.passwordLabel')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-muted">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder') || '••••••••'}
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-10 py-2.5 bg-surface border border-line rounded-xl text-content text-sm focus:outline-none focus:border-accent transition-colors"
              />
              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                <button
                  type="button"
                  tabIndex="-1"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 rounded-lg text-content-subtle hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                  title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 rounded-full bg-accent text-accent-contrast font-bold px-4 py-3 hover:bg-accent-hover transition-all flex items-center justify-center gap-2 text-xs shadow-md shadow-accent/20 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('login.verifying') || 'Memverifikasi…'}</span>
              </>
            ) : (
              <>
                <span>{t('login.submit') || 'Masuk Sekarang'}</span>
                <LogIn className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
