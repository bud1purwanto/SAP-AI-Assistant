import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../hooks/useLanguage';
import { useVirtualKeyboard } from '../hooks/useVirtualKeyboard';

/**
 * Modal wajib ganti password (blocking modal) yang tampil ketika akun user
 * ditandai `force_change_password: true` (setelah direset admin atau login pertama kali).
 */
export default function ForceChangePasswordModal({ isOpen, user, onSuccess, onLogout }) {
  const { isEn } = useLanguage();
  const isKeyboardOpen = useVirtualKeyboard();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setLoading(false);
      setError('');
      setSuccess('');
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
      className={`fixed inset-0 z-[100] flex ${
        isKeyboardOpen ? 'items-start pt-1.5 sm:pt-4' : 'items-center'
      } justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-md overflow-y-auto overscroll-contain transition-all duration-250 animate-modal-backdrop`}
      style={{
        paddingTop: isKeyboardOpen
          ? 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.25rem)'
          : 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.75rem)',
        paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 0.75rem)',
      }}
    >
      <div className={`bg-surface-raised/95 backdrop-blur-xl border border-line/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative ${
        isKeyboardOpen ? 'my-1 sm:my-auto' : 'my-auto'
      } overflow-hidden animate-modal-content transition-all duration-250`}>
        {/* Ambient Top Glow Blobs */}
        <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top glowing hairline accent */}
        <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-80" />

        {/* Header dengan Ikon Peringatan & Status */}
        <div className="flex items-start gap-3.5 pb-4 border-b border-line/80 relative z-10">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/30 blur-sm" />
            <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 border border-white/20 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <KeyRound className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-base sm:text-lg text-content font-display tracking-tight">
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
          <div className="mt-3.5 p-3 bg-danger-soft border border-danger/40 rounded-xl text-danger text-xs flex items-start gap-2.5 animate-modal-content">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-3.5 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2.5 animate-modal-content">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{success}</span>
          </div>
        )}

        {/* Formulir Pengaturan Password */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs sm:text-sm mt-4 relative z-10">
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
                className="peer w-full bg-surface-sunken/80 hover:bg-surface-sunken focus:bg-surface-raised border border-line focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none"
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
                className="peer w-full bg-surface-sunken/80 hover:bg-surface-sunken focus:bg-surface-raised border border-line focus:border-accent focus:ring-2 focus:ring-accent/25 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-content placeholder:text-content-subtle font-mono transition-all duration-200 outline-none"
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
          <div className="flex items-center justify-between gap-2.5 pt-3.5 border-t border-line/80 mt-2">
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-content-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isEn ? 'Log Out' : 'Keluar'}</span>
            </button>

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="px-4 py-2.5 bg-gradient-to-r from-accent via-indigo-600 to-accent bg-[length:200%_auto] hover:bg-[position:right_center] text-white font-bold rounded-xl text-xs shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
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
  );
}
