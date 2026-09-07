import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Mail,
  Send,
  Server,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

const TYPE_ICONS = {
  email: Mail,
  sap_write: ShieldAlert,
  sap: Server,
  system: AlertTriangle,
};

export default function ActionCard({ action, onAction, messageId }) {
  const { t } = useLanguage();

  if (!action || typeof action !== 'object') {
    return null;
  }

  const {
    action_id,
    action_type = 'system',
    title = t('actionCard.confirmTitle'),
    summary,
    details = {},
    confirm_prompt,
    cancel_prompt,
  } = action;

  const storageKey = `sap_action_card_${action_id || (messageId ? `msg_${messageId}` : `${title}_${confirm_prompt}`.replace(/\s+/g, '_'))}`;

  const [status, setStatus] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'approved' || saved === 'cancelled') {
        return saved;
      }
    } catch {}
    return 'pending';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const IconComponent = TYPE_ICONS[action_type] || AlertTriangle;

  const handleApprove = () => {
    if (status !== 'pending' || isSubmitting) return;
    setIsSubmitting(true);
    setStatus('approved');
    try {
      localStorage.setItem(storageKey, 'approved');
    } catch {}
    if (onAction && confirm_prompt) {
      onAction(confirm_prompt);
    }
  };

  const handleCancel = () => {
    if (status !== 'pending' || isSubmitting) return;
    setIsSubmitting(true);
    setStatus('cancelled');
    try {
      localStorage.setItem(storageKey, 'cancelled');
    } catch {}
    if (onAction && cancel_prompt) {
      onAction(cancel_prompt);
    }
  };

  return (
    <div className="my-3 rounded-2xl border border-line bg-surface-raised shadow-xs overflow-hidden max-w-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-sunken border-b border-line">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-xl bg-accent-soft text-accent-soft-fg shrink-0">
            <IconComponent className="w-4 h-4" aria-hidden="true" />
          </div>
          <span className="font-semibold text-xs text-content truncate">
            {title}
          </span>
        </div>

        <div>
          {status === 'pending' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {t('actionCard.pending')}
            </span>
          )}
          {status === 'approved' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Check className="w-3 h-3" />
              {t('actionCard.executed')}
            </span>
          )}
          {status === 'cancelled' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <X className="w-3 h-3" />
              {t('actionCard.cancelled')}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {summary && (
          <p className="text-xs text-content-secondary leading-relaxed">
            {summary}
          </p>
        )}

        {/* Key-Value Details */}
        {details && Object.keys(details).length > 0 && (
          <div className="rounded-xl bg-surface-sunken border border-line p-3 space-y-1.5">
            {Object.entries(details).map(([key, val]) => (
              <div
                key={key}
                className="flex items-start justify-between gap-3 text-xs py-1 border-b border-line/40 last:border-0"
              >
                <span className="text-content-muted font-medium shrink-0">{key}</span>
                <span className="text-content font-mono font-medium text-right break-all">
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        {status === 'pending' ? (
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-content-muted hover:text-content bg-surface hover:bg-surface-hover border border-line rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-3.5 h-3.5" />
              {t('actionCard.cancel')}
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-accent hover:opacity-90 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {t('actionCard.approve')}
            </button>
          </div>
        ) : (
          <div className="pt-1 text-[11px] text-content-muted flex items-center gap-1.5">
            {status === 'approved' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{t('actionCard.approvedNote')}</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{t('actionCard.cancelledNote')}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

