import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from 'lucide-react';
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
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [shake, setShake] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [savedUsers, setSavedUsers] = useState([]);

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const formRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // Inisialisasi saat modal dibuka
  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      setIsInputFocused(false);
      return undefined;
    }

    // Lock body scroll to prevent iOS Safari from shifting background
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Pastikan posisi scroll window tetap di (0, 0) agar fixed overlay tidak terdorong keluar layar di Safari iOS
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }

    // Pastikan tidak ada elemen luar (seperti chat input) yang masih memegang fokus
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    setIsInputFocused(false);

    setUsername('');
    setPassword('');
    setError('');
    setIsSuccess(false);
    setShowPassword(false);
    setCapsLockOn(false);
    setShake(false);
    setIsClosing(false);
    setSavedUsers(getSavedUsers());

    // Fokus halus hanya pada layar non-touch / desktop agar tidak memicu pop keyboard tiba-tiba di mobile
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    let focusTimer = null;
    if (!isMobile) {
      focusTimer = setTimeout(() => {
        usernameRef.current?.focus();
      }, 120);
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && onClose && !isLoading) {
        triggerClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      if (focusTimer) clearTimeout(focusTimer);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (onClose) onClose();
    }, 180);
  };

  const handleSelectRecent = (u) => {
    setUsername(u);
    setTimeout(() => {
      passwordRef.current?.focus();
    }, 60);
  };

  const handleRemoveRecent = (e, u) => {
    e.stopPropagation();
    const updated = removeSavedUserFromStorage(u);
    setSavedUsers(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || isSuccess) return;

    setError('');
    setIsLoading(true);

    try {
      const data = await api.login(username, password);
      saveRecentUser(username);
      setIsSuccess(true);

      setTimeout(() => {
        onLoginSuccess({
          access_token: data.access_token,
          username: data.username,
          full_name: data.full_name || '',
          role: data.role,
          roles: data.roles || [data.role],
          assistant_persona: data.assistant_persona,
          force_change_password: Boolean(data.force_change_password),
        });
      }, 350);
    } catch (err) {
      setError(err.message || t('login.failed'));
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setTimeout(() => {
        passwordRef.current?.focus();
        passwordRef.current?.select();
      }, 50);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordKeyDown = (e) => {
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      usernameRef.current?.focus();
    }
  };

  const handlePasswordKeyUp = (e) => {
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose && !isLoading && !isSuccess) {
          triggerClose();
        }
      }}
      className={`fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex ${
        isInputFocused ? 'items-start pt-1.5 sm:pt-4' : 'items-center'
      } justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain transition-all duration-250 ${
        isClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop'
      }`}
      style={{
        minHeight: '100dvh',
        height: '100%',
        paddingTop: isInputFocused
          ? 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.25rem)'
          : 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.75rem)',
        paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 0.75rem)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div
        className={`bg-surface-raised/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[340px] xs:max-w-sm sm:max-w-md overflow-hidden border border-line/80 relative ${
          isInputFocused ? 'my-1 sm:my-auto' : 'my-auto'
        } flex flex-col transition-all duration-250 ${
          isClosing ? 'animate-modal-content-out' : 'animate-modal-content'
        } ${shake ? 'animate-shake' : ''}`}
        style={{
          maxHeight:
            'min(92vh, calc(var(--app-height, 100dvh) - var(--sat, env(safe-area-inset-top, 0px)) - var(--sab, env(safe-area-inset-bottom, 0px)) - 1.5rem))',
        }}
      >
        {/* Glowing ambient background auras */}
        <div className="absolute -top-20 -left-20 w-48 h-48 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top glowing hairline accent */}
        <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-80" />

        {/* Tombol Tutup (jika didukung) */}
        {onClose && !isLoading && !isSuccess && (
          <button
            type="button"
            onClick={triggerClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-content-muted hover:text-content bg-surface-sunken/80 hover:bg-surface-hover rounded-full border border-line/50 transition-all duration-200 z-20 cursor-pointer hover:rotate-90"
            aria-label={t('login.closeAria')}
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
          </button>
        )}

        {/* Header Visual Modern & Smooth */}
        <div className="relative pt-5 sm:pt-6 pb-2 px-5 sm:px-6 text-center shrink-0">
          {/* Security Badge Pill */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold bg-accent-soft text-accent-soft-fg border border-accent/25 shadow-xs mb-2 sm:mb-2.5 select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('login.badge')}</span>
          </div>

          {/* Glowing Lock Badge */}
          <div className="relative mx-auto w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center mb-1.5 sm:mb-2">
            <div className="absolute inset-0 bg-gradient-to-tr from-accent to-indigo-500 rounded-2xl blur-md opacity-50 animate-pulse" />
            <div className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-accent via-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-accent/30 border border-white/20">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
            </div>
          </div>

          <h2 id="login-title" className="text-base sm:text-lg font-bold font-display text-content tracking-tight">
            {t('login.title')}
          </h2>
          <p className="text-[11px] sm:text-xs text-content-muted mt-0.5 max-w-xs mx-auto leading-relaxed">
            {t('login.subtitle')}
          </p>
        </div>

        {/* Body Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onFocus={() => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
            setIsInputFocused(true);
          }}
          onBlur={() => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = setTimeout(() => {
              const active = document.activeElement;
              if (!formRef.current || !formRef.current.contains(active)) {
                setIsInputFocused(false);
              }
            }, 100);
          }}
          className="p-4 sm:p-6 pt-2 sm:pt-3 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar flex-1 relative z-10"
        >
          {/* Custom Informational Message (misal saat wajib login atau timeout) */}
          {customMessage && (
            <div className="flex items-start gap-2.5 p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-medium leading-relaxed transition-all">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>{customMessage}</span>
            </div>
          )}

          {/* Pesan Kesalahan dengan Transisi Mulus */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-2.5 sm:p-3 bg-danger-soft border border-danger/40 rounded-xl text-danger text-xs font-medium leading-relaxed transition-all"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Input Username */}
          <div>
            <label
              htmlFor="login-username"
              className="block text-[11px] font-semibold text-content-secondary mb-1.5 uppercase tracking-wider"
            >
              {t('login.usernameLabel')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle peer-focus:text-accent transition-colors duration-200">
                <User className="w-4 h-4" aria-hidden="true" />
              </div>
              <input
                id="login-username"
                ref={usernameRef}
                type="text"
                required
                disabled={isLoading || isSuccess}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    passwordRef.current?.focus();
                  }
                }}
                className="peer w-full bg-surface-sunken/80 hover:bg-surface-sunken focus:bg-surface-raised border border-line focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-9 py-2.5 sm:py-3 text-xs sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none disabled:opacity-50"
                placeholder={t('login.usernamePlaceholder')}
              />
              {username && !isLoading && !isSuccess && (
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                  <button
                    type="button"
                    tabIndex="-1"
                    onClick={() => {
                      setUsername('');
                      usernameRef.current?.focus();
                    }}
                    className="p-1 rounded-full text-content-subtle hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                    title={t('login.clearUsername')}
                    aria-label={t('login.clearUsername')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Rekomendasi Akun Pernah Login (Recent Accounts) */}
            {savedUsers.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-content-subtle font-medium">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>{t('login.recentAccounts')}</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {savedUsers.map((u) => {
                    const isSelected = username.toLowerCase() === u.toLowerCase();
                    return (
                      <div
                        key={u}
                        onClick={() => handleSelectRecent(u)}
                        className={`group inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-mono border transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-accent/15 border-accent text-accent font-semibold shadow-xs'
                            : 'bg-surface-sunken/60 hover:bg-surface-hover border-line/60 text-content-secondary hover:text-content hover:border-line'
                        }`}
                        title={u}
                      >
                        <span className="truncate max-w-[130px]">{u}</span>
                        <button
                          type="button"
                          tabIndex="-1"
                          onClick={(e) => handleRemoveRecent(e, u)}
                          className="text-content-subtle hover:text-danger hover:bg-danger/10 p-0.5 rounded transition-all cursor-pointer"
                          title={t('login.removeRecent')}
                          aria-label={t('login.removeRecent')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Input Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-[11px] font-semibold text-content-secondary uppercase tracking-wider"
              >
                {t('login.passwordLabel')}
              </label>
              {capsLockOn && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  <span>{t('login.capsLock')}</span>
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle peer-focus:text-accent transition-colors duration-200">
                <KeyRound className="w-4 h-4" aria-hidden="true" />
              </div>
              <input
                id="login-password"
                ref={passwordRef}
                type={showPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isSuccess}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handlePasswordKeyDown}
                onKeyUp={handlePasswordKeyUp}
                className="peer w-full bg-surface-sunken/80 hover:bg-surface-sunken focus:bg-surface-raised border border-line focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-10 py-2.5 sm:py-3 text-xs sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none disabled:opacity-50"
                placeholder={t('login.passwordPlaceholder')}
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

          {/* Tombol Submit Interaktif dengan Feedback Visual Mulus */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isLoading || isSuccess}
              className={`w-full relative overflow-hidden flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 shadow-md ${
                isSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-accent via-indigo-600 to-accent bg-[length:200%_auto] hover:bg-[position:right_center] text-white shadow-accent/25 hover:shadow-accent/40 active:scale-[0.98] cursor-pointer'
              } disabled:opacity-80`}
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200 animate-bounce" aria-hidden="true" />
                  <span>{t('login.success')}</span>
                </>
              ) : isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                  <span>{t('login.verifying')}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>{t('login.submit')}</span>
                </>
              )}
            </button>
          </div>

          {/* Opsi Lanjutkan Sebagai Tamu (jika diizinkan oleh parent) */}
          {onGuestContinue && (
            <div className="pt-2 text-center border-t border-line/60 mt-3">
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
