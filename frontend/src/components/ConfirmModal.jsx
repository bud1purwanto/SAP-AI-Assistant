import React, { useEffect } from 'react';
import { AlertTriangle, LogOut, Trash2, X } from 'lucide-react';

const ICONS = {
  danger: Trash2,
  warning: AlertTriangle,
  logout: LogOut,
};

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Konfirmasi',
  message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant = 'danger', // 'danger' | 'warning' | 'logout'
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const IconComponent = ICONS[variant] || AlertTriangle;

  const getVariantStyles = () => {
    switch (variant) {
      case 'logout':
        return {
          iconBg: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
          btnBg: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20',
          glow: 'from-amber-500/10 via-transparent to-transparent',
        };
      case 'warning':
        return {
          iconBg: 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/30',
          btnBg: 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-yellow-900/20',
          glow: 'from-yellow-500/10 via-transparent to-transparent',
        };
      case 'danger':
      default:
        return {
          iconBg: 'bg-rose-500/15 text-rose-500 border border-rose-500/30',
          btnBg: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20',
          glow: 'from-rose-500/10 via-transparent to-transparent',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-surface-raised border border-line shadow-2xl transition-all animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 bg-gradient-to-b ${styles.glow} rounded-full blur-2xl pointer-events-none`} />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-xl text-content-subtle hover:text-content hover:bg-surface-sunken transition-colors disabled:opacity-50"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 text-center">
          {/* Animated Icon Avatar */}
          <div className="mx-auto mb-4 flex items-center justify-center">
            <div className={`w-13 h-13 rounded-2xl flex items-center justify-center shadow-inner ${styles.iconBg}`}>
              <IconComponent className="w-6 h-6 animate-pulse" aria-hidden="true" />
            </div>
          </div>

          <h3 id="confirm-modal-title" className="text-base font-bold text-content font-display tracking-tight">
            {title}
          </h3>

          <p className="mt-2 text-xs sm:text-sm text-content-muted leading-relaxed">
            {message}
          </p>

          <div className="mt-6 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-surface-sunken hover:bg-surface-hover text-content border border-line transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer ${styles.btnBg}`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memproses…</span>
                </div>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;