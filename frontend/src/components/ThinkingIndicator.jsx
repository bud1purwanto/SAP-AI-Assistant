import React from 'react';
import { Database, FileSearch, Loader2, RefreshCw, Sparkles, Square } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Indikator progres jawaban AI.
 *
 * Persentasenya berasal dari langkah yang benar-benar sudah dikerjakan agen
 * (`step` dari `max_steps`), bukan perkiraan waktu — jumlah langkah yang
 * dibutuhkan sebuah pertanyaan memang tidak diketahui di muka. Karena itu bar
 * tidak pernah mencapai 100% sebelum jawaban benar-benar selesai, dan
 * keterangan tahapnya yang menjadi informasi utama.
 */

const STAGE_ICON = {
  connecting: Loader2,
  reconnecting: RefreshCw,
  reading: FileSearch,
  thinking: Sparkles,
  tool: Database,
  building: FileSearch,
  done: Sparkles,
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
  const Icon = STAGE_ICON[progress?.stage] || Sparkles;
  const isSpinning = progress?.stage === 'connecting' || progress?.stage === 'reconnecting';

  const stageKey = progress?.stage ? `thinking.${progress.stage}` : 'thinking.processing';
  const hint = progress?.stage === 'reconnecting'
    ? t('thinking.reconnecting_hint')
    : t(stageKey);
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
          <span className="text-[11px] text-content-muted truncate">
            {hint}
            {progress?.step ? ` • ${t('thinking.step', { step: progress.step })}` : ''}
          </span>
          {onStop && (
            <button
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
