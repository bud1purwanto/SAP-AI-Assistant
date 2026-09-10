import React from 'react';
import {
  BookOpen,
  Database,
  FileSearch,
  FileSpreadsheet,
  Loader2,
  Mail,
  RefreshCw,
  Server,
  Sparkles,
  Square,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Indikator progres jawaban AI yang real-time, bebas istilah teknis,
 * dan selaras antara ikon, keterangan tindakan, serta status layanan.
 */

const resolveContext = (progress, t) => {
  if (!progress) {
    return {
      Icon: Sparkles,
      context: t('thinking.service_ai'),
      isSpinning: false,
    };
  }

  const stage = progress.stage;
  const srv = (progress.server || '').toLowerCase();
  const label = (progress.label || '').toLowerCase();

  if (stage === 'connecting') {
    return {
      Icon: Loader2,
      context: t('thinking.connecting'),
      isSpinning: true,
    };
  }
  if (stage === 'reconnecting') {
    return {
      Icon: RefreshCw,
      context: t('thinking.reconnecting_hint'),
      isSpinning: true,
    };
  }
  if (stage === 'reading') {
    return {
      Icon: FileSearch,
      context: t('thinking.service_doc'),
      isSpinning: false,
    };
  }
  if (stage === 'building') {
    return {
      Icon: FileSpreadsheet,
      context: t('thinking.service_file'),
      isSpinning: false,
    };
  }
  if (stage === 'done') {
    return {
      Icon: Sparkles,
      context: t('thinking.done'),
      isSpinning: false,
    };
  }

  if (stage === 'tool') {
    if (srv === 'email' || label.includes('email') || label.includes('mail') || label.includes('pesan')) {
      return {
        Icon: Mail,
        context: t('thinking.service_email'),
        isSpinning: false,
      };
    }
    if (srv === 'rag' || label.includes('sop') || label.includes('dokumen') || label.includes('referensi') || label.includes('knowledge')) {
      return {
        Icon: BookOpen,
        context: t('thinking.service_rag'),
        isSpinning: false,
      };
    }
    if (srv === 'sql' || srv === 'database' || label.includes('database') || label.includes('basis data') || label.includes('kueri') || label.includes('query')) {
      return {
        Icon: Server,
        context: t('thinking.service_sql'),
        isSpinning: false,
      };
    }
    return {
      Icon: Database,
      context: t('thinking.service_sap'),
      isSpinning: false,
    };
  }

  return {
    Icon: Sparkles,
    context: t('thinking.service_ai'),
    isSpinning: false,
  };
};

/** Bobot per tahap agar bar bergerak wajar, dibatasi 92% sampai benar-benar selesai. */
const computePercent = (progress) => {
  if (!progress) return 8;
  if (progress.stage === 'done') return 100;
  if (progress.stage === 'reconnecting') return 75;

  const max = progress.max_steps || 6;
  const step = Math.min(progress.step || 0, max);
  // Langkah pertama sudah menunjukkan kemajuan nyata; sisanya proporsional.
  const base = 10 + (step / max) * 78;
  const bonus = progress.stage === 'building' ? 6 : 0;
  return Math.min(Math.round(base + bonus), 92);
};

const ThinkingIndicator = ({ progress, onStop }) => {
  const { t } = useLanguage();
  const percent = computePercent(progress);
  const { Icon, context, isSpinning } = resolveContext(progress, t);
  const label = progress?.label || t('thinking.processing');

  return (
    <div className="flex items-start gap-3 my-3 animate-fadeIn" role="status" aria-live="polite">
      <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent border border-accent/25 flex items-center justify-center mt-1 shrink-0 shadow-2xs">
        <Icon className={`w-4 h-4 ${isSpinning ? 'animate-spin' : 'animate-pulse'}`} aria-hidden="true" />
      </div>

      <div className="bg-surface border border-line/80 rounded-2xl rounded-tl-xs p-4 min-w-0 flex-1 max-w-md shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs sm:text-sm text-content font-semibold font-display truncate">{label}</span>
          <span className="text-xs font-mono font-bold text-accent tabular-nums shrink-0">
            {percent}%
          </span>
        </div>

        <div
          className="h-1.5 w-full bg-surface-sunken rounded-full overflow-hidden border border-line/40"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress: ${label}`}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-content-muted truncate">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/60 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
            </span>
            <span className="truncate font-medium">{context}</span>
          </div>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-content-muted hover:text-rose-400 hover:bg-rose-500/10 border border-line/80 rounded-lg px-2.5 py-1 transition-all shrink-0 cursor-pointer active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" aria-hidden="true" />
              {t('thinking.stop')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThinkingIndicator;
