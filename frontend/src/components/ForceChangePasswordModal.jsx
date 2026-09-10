import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut } from 'lucide-react';
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

  // Pastikan form selalu bersih dan pesan sukses lama tidak tertinggal saat modal dibuka
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

    if (!newPassword || newPassword.length < 8) {
      setError(isEn ? 'New password must be at least 8 characters.' : 'Password baru minimal 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isEn ? 'New password confirmation does not match.' : 'Konfirmasi password baru tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.changePassword(null, newPassword);
      if (res && res.success !== false) {
        setSuccess(
          isEn
            ? 'Personal password set successfully! Redirecting...'
            : 'Password pribadi berhasil disimpan! Mengalihkan...'
        );
        setTimeout(() => {
          setNewPassword('');
          setConfirmPassword('');
          setShowNew(false);
          setShowConfirm(false);
          setError('');
          setSuccess('');
          onSuccess?.();
        }, 800);
      } else {
        setError(res.message || (isEn ? 'Failed to update password.' : 'Gagal memperbarui password.'));
      }
    } catch (err) {
      setError(err.message || (isEn ? 'Failed to update password.' : 'Gagal memperbarui password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3.5 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn"
      style={{
        paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 1.25rem)',
        paddingBottom: 'calc(var(--sab, env(safe-area-inset-bottom, 0px)) + 1.25rem)',
      }}
    >
      <div className="bg-surface-raised border border-amber-500/30 rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 my-auto overflow-y-auto">
        {/* Header dengan Ikon Peringatan & Status */}
        <div className="flex items-start gap-3.5 pb-3.5 border-b border-line/80">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5 shadow-sm">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base sm:text-lg text-content font-display tracking-tight flex items-center gap-2">
              <span>{isEn ? 'Set Personal Password' : 'Atur Password Pribadi'}</span>
              <span className="text-[10px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                {isEn ? 'Required' : 'Wajib'}
              </span>
            </h3>
            <p className="text-xs text-content-muted mt-1 leading-relaxed">
              {isEn
                ? `Account @${user?.username} requires setting your personal password before continuing.`
                : `Akun @${user?.username} diwajibkan mengatur password pribadi sebelum dapat menggunakan asisten.`}
            </p>
          </div>
        </div>

        {/* Notifikasi Error & Sukses */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-500 text-xs flex items-start gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{success}</span>
          </div>
        )}

        {/* Formulir Pengaturan Password */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs sm:text-sm">
          {/* Password Baru Pribadi */}
          <div>
            <label className="block text-content font-semibold mb-1 text-xs flex items-center justify-between">
              <span>{isEn ? 'New Personal Password' : 'Password Baru Pribadi'}</span>
              <span className="text-[10px] text-content-subtle font-normal">
                {isEn ? 'Min. 8 characters' : 'Min. 8 karakter'}
              </span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={isEn ? 'Enter your new secret password' : 'Buat password baru yang aman'}
                autoComplete="new-password"
                className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm text-content placeholder:text-content-subtle focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 text-content-subtle hover:text-content p-1 cursor-pointer transition-colors"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Konfirmasi Password Baru */}
          <div>
            <label className="block text-content font-semibold mb-1 text-xs">
              {isEn ? 'Confirm New Password' : 'Konfirmasi Password Baru'}
            </label>
            <div className="relative flex items-center">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={isEn ? 'Re-type your new password' : 'Ketik ulang password baru Anda'}
                autoComplete="new-password"
                className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm text-content placeholder:text-content-subtle focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 text-content-subtle hover:text-content p-1 cursor-pointer transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-line/80 mt-2">
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-content-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isEn ? 'Log Out' : 'Keluar'}</span>
            </button>

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="px-4 py-2 bg-accent text-accent-fg font-semibold rounded-xl text-xs shadow-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
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
