import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Modal wajib ganti password (blocking modal) yang tampil ketika akun user
 * ditandai `force_change_password: true` (setelah direset admin atau login pertama kali).
 */
export default function ForceChangePasswordModal({ isOpen, user, onSuccess, onLogout }) {
  const { isEn } = useLanguage();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const formRef = useRef(null);
  const containerRef = useRef(null);
  const pointerDownTargetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        const isInside = containerRef.current && containerRef.current.contains(document.activeElement);
        if (!isInside) {
          document.activeElement.blur();
        }
      }
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setLoading(false);
      setError('');
      setSuccess('');

      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen, user?.username]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError(isEn ? 'New password must be at least 6 characters.' : 'Password baru minimal 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isEn ? 'Password confirmation does not match.' : 'Konfirmasi password baru tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(null, newPassword);
      setSuccess(isEn ? 'Password successfully changed! Proceeding…' : 'Password berhasil diubah! Mengalihkan…');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1200);
    } catch (err) {
      setError(err.message || (isEn ? 'Failed to update password.' : 'Gagal memperbarui password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        pointerDownTargetRef.current = e.target;
      }}
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-md transition-opacity duration-200 animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="min-h-full flex items-center justify-center p-3 sm:p-4 text-center"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface-raised/98 dark:bg-[#1a1a24] backdrop-blur-2xl border border-white/20 dark:border-white/15 ring-1 ring-black/5 dark:ring-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-md w-full shadow-2xl relative my-auto flex flex-col text-left overflow-hidden animate-modal-content transition-opacity duration-200"
          style={{
            maxHeight: 'min(92vh, calc(100% - 1.5rem))',
          }}
        >
          {/* Top glowing hairline accent */}
          <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-90" />

          {/* Header dengan Ikon Peringatan & Status - Stabil & Proporsional */}
          <div className="flex items-start gap-3 pb-3 border-b border-line/80 relative z-10 shrink-0">
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center shadow-xs">
                <KeyRound className="w-5 h-5" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-sm sm:text-base text-content font-display tracking-tight">
                  {isEn ? 'Set Personal Password' : 'Atur Password Pribadi'}
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  <ShieldAlert className="w-3 h-3" />
                  <span>{isEn ? 'Required' : 'Wajib'}</span>
                </span>
              </div>
              <p className="text-xs text-content-muted leading-relaxed">
                {isEn
                  ? `Account @${user?.username} requires setting your personal password before continuing.`
                  : `Akun @${user?.username} diwajibkan mengatur password pribadi sebelum dapat menggunakan asisten.`}
              </p>
            </div>
          </div>

          {/* Notifikasi Error & Sukses */}
          {error && (
            <div className="mt-2 p-2 sm:p-2.5 bg-danger-soft border border-danger/40 rounded-xl text-danger text-xs flex items-start gap-2.5 animate-modal-content">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {success && (
            <div className="mt-2 p-2 sm:p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2.5 animate-modal-content">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{success}</span>
            </div>
          )}

          {/* Formulir Pengaturan Password */}
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-3 sm:space-y-3.5 text-xs sm:text-sm mt-3 overflow-y-auto custom-scrollbar flex-1 min-h-0 relative z-10"
          >
            {/* Password Baru Pribadi */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-content font-semibold text-xs">
                  {isEn ? 'New Personal Password' : 'Password Baru Pribadi'}
                </label>
                <span className="text-[10px] text-content-subtle font-mono">
                  {isEn ? 'Min. 8 chars' : 'Min. 8 karakter'}
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle peer-focus:text-accent transition-colors duration-200">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={isEn ? 'Enter new password' : 'Buat password baru yang aman'}
                  autoComplete="new-password"
                  className="peer w-full bg-surface-sunken hover:bg-surface-sunken focus:bg-surface-raised border border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-base sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none"
                />
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="p-1.5 rounded-lg text-content-subtle hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Konfirmasi Password Baru */}
            <div>
              <label className="block text-content font-semibold mb-1.5 text-xs">
                {isEn ? 'Confirm New Password' : 'Konfirmasi Password Baru'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle peer-focus:text-accent transition-colors duration-200">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={isEn ? 'Re-type your new password' : 'Ketik ulang password baru Anda'}
                  autoComplete="new-password"
                  className="peer w-full bg-surface-sunken hover:bg-surface-sunken focus:bg-surface-raised border border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-base sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none"
                />
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="p-1.5 rounded-lg text-content-subtle hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="flex items-center justify-between gap-2.5 pt-3 mt-1.5 border-t border-line/80">
              <button
                type="button"
                onClick={onLogout}
                className="px-3.5 py-2.5 sm:py-3 rounded-xl text-xs font-semibold text-content-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isEn ? 'Log Out' : 'Keluar'}</span>
              </button>

              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="px-4 py-2.5 sm:py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-accent/25 hover:shadow-accent/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {loading
                    ? (isEn ? 'Saving...' : 'Menyimpan...')
                    : (isEn ? 'Save Personal Password' : 'Simpan Password Pribadi')}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
