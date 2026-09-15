import React from 'react';
import { LogIn, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const LoginModal = ({ isOpen, customMessage, onClose }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  const handleLogin = () => {
    window.location.assign('/api/auth/login');
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <div className="bg-surface-raised rounded-2xl shadow-2xl w-full max-w-md border border-line relative p-6 sm:p-8">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-content-muted hover:text-content p-1.5 rounded-full transition-colors"
            aria-label={t('login.closeAria')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}

        <div className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-accent" aria-hidden="true" />
          </div>
          <h2 id="login-title" className="text-xl font-bold text-content mb-2">
            {t('sidebar.loginPrompt')}
          </h2>
          <p className="text-sm text-content-muted mb-6">
            {customMessage || t('login.subtitle')}
          </p>
          <button
            type="button"
            onClick={handleLogin}
            className="w-full rounded-xl bg-accent text-accent-contrast font-semibold px-4 py-3 hover:bg-accent/90 transition-colors"
          >
            {t('sidebar.loginPrompt')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
