import React, { useEffect, useState } from 'react';
import { Download, Share, X, Sparkles } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const PWAPrompt = () => {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      return;
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if user dismissed prompt recently
    const dismissedTime = localStorage.getItem('sap_pwa_prompt_dismissed');
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // If iOS and not installed, show after a short delay
    let iosTimer;
    if (isIosDevice) {
      iosTimer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('sap_pwa_prompt_dismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-surface-raised/95 backdrop-blur-xl border border-line p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent-soft-fg flex items-center justify-center font-bold text-lg shrink-0">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-content">{t('pwa.title')}</h4>
              <p className="text-xs text-content-muted">{t('pwa.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-content-subtle hover:text-content hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label={t('pwa.closeAria')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="text-xs text-content-muted bg-surface-sunken p-2.5 rounded-xl flex items-center gap-2 border border-line">
            <Share className="w-4 h-4 text-accent shrink-0" />
            <span>{t('pwa.iosHint')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-accent text-accent-fg rounded-xl text-xs font-semibold shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {t('pwa.installNow')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="py-2 px-3 bg-surface-sunken hover:bg-surface-hover text-content-muted hover:text-content rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              {t('pwa.later')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PWAPrompt;