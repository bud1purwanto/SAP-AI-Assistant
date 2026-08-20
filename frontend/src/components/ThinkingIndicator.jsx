import React from 'react';
import { Database, FileSearch, Loader2, Sparkles, Square } from 'lucide-react';

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
  reading: FileSearch,
  thinking: Sparkles,
  tool: Database,
  building: FileSearch,
  done: Sparkles,
};

const STAGE_HINT = {
  connecting: 'Menghubungi asisten',
  reading: 'Membaca lampiran Anda',
  thinking: 'Menyusun jawaban',
  tool: 'Mengambil data',
  building: 'Menyiapkan berkas',
  done: 'Selesai',
};

/** Bobot per tahap agar bar bergerak wajar, dibatasi 92% sampai benar-benar selesai. */
const computePercent = (progress) => {
  if (!progress) return 6;
  if (progress.stage === 'done') return 100;

  const max = progress.max_steps || 6;
  const step = Math.min(progress.step || 0, max);
  // Langkah pertama sudah menunjukkan kemajuan nyata; sisanya proporsional.
  const base = 10 + (step / max) * 78;
  const bonus = progress.stage === 'building' ? 6 : 0;
  return Math.min(Math.round(base + bonus), 92);
};

const ThinkingIndicator = ({ progress, onStop }) => {
  const percent = computePercent(progress);
  const Icon = STAGE_ICON[progress?.stage] || Sparkles;
  const label = progress?.label || 'Sedang memproses…';
  const hint = STAGE_HINT[progress?.stage] || '';

  return (
    <div className="flex items-start gap-3.5 my-4" role="status" aria-live="polite">
      <div className="w-8 h-8 rounded-full bg-accent text-accent-fg flex items-center justify-center mt-1 shrink-0">
        <Icon className="w-4 h-4 animate-pulse" aria-hidden="true" />
      </div>

      <div className="bg-surface-raised border border-line rounded-3xl rounded-tl-sm px-5 py-4 min-w-0 flex-1 max-w-md">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-sm text-content font-medium truncate">{label}</span>
          <span className="text-xs font-semibold text-content-muted tabular-nums shrink-0">
            {percent}%
          </span>
        </div>

        <div
          className="h-1.5 w-full bg-surface-sunken rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Kemajuan: ${label}`}
        >
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 mt-2.5">
          <span className="text-xs text-content-subtle truncate">
            {hint}
            {progress?.step ? ` • langkah ${progress.step}` : ''}
          </span>
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 text-xs font-semibold text-content-muted hover:text-danger border border-line rounded-lg px-2 py-1 transition-colors shrink-0"
          >
            <Square className="w-3 h-3" aria-hidden="true" />
            Hentikan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThinkingIndicator;
