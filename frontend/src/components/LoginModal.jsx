import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, KeyRound, Lock, LogIn, User, UserCheck, X } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

const SAVED_USERS_KEY = 'sap_assistant_saved_usernames';

function getSavedUsers() {
  try {
    const raw = localStorage.getItem(SAVED_USERS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()) : [];
  } catch {
    return [];
  }
}

function saveRecentUser(username) {
  if (!username || typeof username !== 'string') return;
  const clean = username.trim();
  if (!clean) return;
  try {
    const existing = getSavedUsers();
    const updated = [clean, ...existing.filter((u) => u.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
    localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recent user:', e);
  }
}

function removeSavedUserFromStorage(usernameToRemove) {
  try {
    const existing = getSavedUsers();
    const updated = existing.filter((u) => u.toLowerCase() !== usernameToRemove.toLowerCase());
    localStorage.setItem(SAVED_USERS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

const LoginModal = ({ isOpen, onLoginSuccess, onGuestContinue, customMessage, onClose }) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedUsers, setSavedUsers] = useState([]);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  // Saat modal dibuka: kosongkan field, refresh daftar rekomendasi user, dan fokus ke input.
  useEffect(() => {
    if (!isOpen) return undefined;
    setUsername('');
    setPassword('');
    setError('');
    setSavedUsers(getSavedUsers());

    const timer = setTimeout(() => {
      usernameRef.current?.focus();
    }, 100);

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectRecent = (u) => {
    setUsername(u);
    setTimeout(() => {
      passwordRef.current?.focus();
    }, 50);
  };

  const handleRemoveRecent = (e, u) => {
    e.stopPropagation();
    const updated = removeSavedUserFromStorage(u);
    setSavedUsers(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await api.login(username, password);
      // Simpan username yang sukses login ke recent accounts
      saveRecentUser(username);

      // access_token diteruskan ke pemanggil untuk disimpan bersama profil user.
      onLoginSuccess({
        access_token: data.access_token,
        username: data.username,
        full_name: data.full_name || '',
        role: data.role,
        roles: data.roles || [data.role],
        assistant_persona: data.assistant_persona,
      });
    } catch (err) {
      setError(err.message || t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputFocus = (e) => {
    // Pada perangkat mobile, pastikan elemen yang difokuskan terlihat di tengah layar di atas keyboard virtual
    setTimeout(() => {
      e.target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain animate-modal-backdrop"
      style={{
        paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
        paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div
        className="bg-surface-raised rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-sm sm:max-w-md overflow-hidden border border-line relative my-auto flex flex-col animate-modal-content transition-all"
        style={{
          maxHeight: 'calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 2.5rem)'
        }}
      >

        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 p-1.5 rounded-full transition-all z-10 cursor-pointer"
            aria-label={t('login.closeAria')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Compact Header for mobile friendly height */}
        <div className="bg-accent px-4 sm:px-6 py-3.5 sm:py-5 text-center text-accent-fg shrink-0">
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-1.5 border border-white/20">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </div>
          <h2 id="login-title" className="text-sm sm:text-lg font-bold font-display leading-tight">{t('login.title')}</h2>
          <p className="text-[10px] sm:text-xs opacity-90 mt-0.5 max-w-xs mx-auto leading-tight">
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1">
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
            <label htmlFor="login-username" className="block text-[10px] sm:text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
              {t('login.usernameLabel')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-2.5 sm:top-3 text-content-subtle" aria-hidden="true" />
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                required
                list="saved-sap-usernames"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={handleInputFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    passwordRef.current?.focus();
                  }
                }}
                className="w-full bg-surface-sunken border border-line rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-content focus:border-accent transition-all font-mono"
                placeholder={t('login.usernamePlaceholder')}
              />
              <datalist id="saved-sap-usernames">
                {savedUsers.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            {/* Rekomendasi Akun Pernah Login (Recent Users) */}
            {savedUsers.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-content-subtle font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-content-subtle" />
                  <span>{t('login.recentAccounts')}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {savedUsers.map((u) => (
                    <div
                      key={u}
                      onClick={() => handleSelectRecent(u)}
                      className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer ${
                        username.toLowerCase() === u.toLowerCase()
                          ? 'bg-accent/15 border-accent text-accent font-semibold shadow-xs'
                          : 'bg-surface hover:bg-surface-hover border-line text-content-secondary hover:text-content'
                      }`}
                      title={u}
                    >
                      <span className="truncate max-w-[130px]">{u}</span>
                      <button
                        type="button"
                        tabIndex="-1"
                        onClick={(e) => handleRemoveRecent(e, u)}
                        className="text-content-subtle hover:text-rose-500 opacity-60 group-hover:opacity-100 p-0.5 rounded transition-all cursor-pointer"
                        title={t('login.removeRecent')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[10px] sm:text-[11px] font-bold text-content-secondary mb-1 uppercase tracking-wider">
              {t('login.passwordLabel')}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-2.5 sm:top-3 text-content-subtle" aria-hidden="true" />
              <input
                id="login-password"
                ref={passwordRef}
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={handleInputFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    usernameRef.current?.focus();
                  }
                }}
                className="w-full bg-surface-sunken border border-line rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-content focus:border-accent transition-all font-mono"
                placeholder={t('login.passwordPlaceholder')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-1.5 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-accent-fg font-bold py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-70 text-xs sm:text-sm cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
            <span>{isLoading ? t('login.verifying') : t('login.submit')}</span>
          </button>

          {onGuestContinue && (
            <div className="pt-2 text-center border-t border-line mt-3">
              <button
                type="button"
                onClick={onGuestContinue}
                className="inline-flex items-center gap-1.5 text-xs text-content-muted hover:text-content font-medium py-1.5 px-3 rounded-xl hover:bg-surface-hover transition-all cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('login.guestContinue')}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
