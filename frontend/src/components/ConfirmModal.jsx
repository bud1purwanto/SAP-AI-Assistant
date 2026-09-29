import React, { useEffect } from 'react';
import { AlertTriangle, Info, LogOut, RotateCcw, Trash2, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const ICONS = {
  danger: Trash2,
  warning: AlertTriangle,
  logout: LogOut,
  reset: RotateCcw,
  info: Info,
};

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger', // 'danger' | 'warning' | 'logout' | 'reset' | 'info'
  isLoading = false,
}) => {
  const { t } = useLanguage();

  const displayTitle = title || t('confirm.defaultTitle');
  const displayMessage = message || t('confirm.defaultMessage');
  const displayConfirmText = confirmText || t('confirm.yes');
  const displayCancelText = cancelText || t('confirm.cancel');

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
      case 'reset':
        return {
          iconBg: 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-rose-500/30 border-white/20',
          btnBg: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-900/25',
          hairline: 'via-rose-500',
          aura: 'bg-rose-500/20',
        };
      case 'info':
        return {
          iconBg: 'bg-gradient-to-tr from-indigo-500 to-accent text-white shadow-indigo-500/30 border-white/20',
          btnBg: 'bg-gradient-to-r from-indigo-600 via-accent to-indigo-600 hover:opacity-95 text-white shadow-indigo-900/25',
          hairline: 'via-accent',
          aura: 'bg-accent/20',
        };
      case 'logout':
        return {
          iconBg: 'bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-amber-500/30 border-white/20',
          btnBg: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-900/25',
          hairline: 'via-amber-500',
          aura: 'bg-amber-500/20',
        };
      case 'warning':
        return {
          iconBg: 'bg-gradient-to-tr from-yellow-500 to-amber-600 text-white shadow-yellow-500/30 border-white/20',
          btnBg: 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white shadow-yellow-900/25',
          hairline: 'via-amber-500',
          aura: 'bg-amber-500/20',
        };
      case 'danger':
      default:
        return {
          iconBg: 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-rose-500/30 border-white/20',
          btnBg: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-rose-900/25',
          hairline: 'via-rose-500',
          aura: 'bg-rose-500/20',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain bg-black/65 backdrop-blur-md animate-modal-backdrop"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="relative my-auto w-full max-w-[340px] xs:max-w-sm overflow-hidden rounded-2xl sm:rounded-3xl bg-surface-raised/95 backdrop-blur-xl border border-line/80 shadow-2xl transition-all animate-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow Blobs */}
        <div className={`absolute -top-16 -left-16 w-44 h-44 ${styles.aura} rounded-full blur-3xl pointer-events-none animate-pulse`} />
        <div className="absolute -bottom-16 -right-16 w-44 h-44 bg-surface-sunken/40 rounded-full blur-3xl pointer-events-none" />

        {/* Top glowing hairline accent */}
        <div className={`absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent ${styles.hairline} to-transparent opacity-80`} />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-3.5 right-3.5 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-content-muted hover:text-content bg-surface-sunken/80 hover:bg-surface-hover border border-line/50 transition-all duration-200 disabled:opacity-50 cursor-pointer hover:rotate-90 z-10"
          aria-label={t('common.close')}
        >
          <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <div className="p-5 sm:p-6 text-center relative z-10">
          {/* Animated Hero Icon Avatar */}
          <div className="mx-auto mb-3.5 flex items-center justify-center">
            <div className="relative">
              <div className={`absolute inset-0 rounded-2xl blur-md opacity-50 ${styles.aura}`} />
              <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-xl border ${styles.iconBg}`}>
                <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
              </div>
            </div>
          </div>

          <h3 id="confirm-modal-title" className="text-base sm:text-lg font-bold text-content font-display tracking-tight">
            {displayTitle}
          </h3>

          <p className="mt-2 text-xs sm:text-sm text-content-muted leading-relaxed">
            {displayMessage}
          </p>

          <div className="mt-5 sm:mt-6 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold bg-surface-sunken/80 hover:bg-surface-hover text-content border border-line transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {displayCancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer ${styles.btnBg}`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('confirm.processing')}</span>
                </div>
              ) : (
                displayConfirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;