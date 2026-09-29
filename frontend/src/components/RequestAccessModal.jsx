import React, { useState } from 'react';
import { Lock, Send, X, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

export default function RequestAccessModal({
  isOpen,
  onClose,
  target,
  onSubmit,
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !target) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit(target.connectionId || target.id, reason.trim() || undefined);
      setReason('');
      onClose();
    } catch (err) {
      setError(err.message || t('mcp.requestFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-surface border border-line rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content">
                {t('mcp.requestAccessTitle')}
              </h3>
              <p className="text-[11px] text-content-muted">
                {target.name} ({target.serverType || target.kind || 'MCP'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-content-muted leading-relaxed">
          {t('mcp.requestAccessDesc')}
        </p>

        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-content block mb-1">
              {t('mcp.requestReasonLabel')}
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('mcp.requestReasonPlaceholder')}
              className="w-full text-xs px-3 py-2 bg-surface-sunken border border-line rounded-xl focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none text-content transition-all resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-content-muted hover:text-content hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
            >
              {t('mcp.btnCancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-accent-hover active:scale-95 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? t('common.processing') : t('mcp.btnSubmitRequest')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
