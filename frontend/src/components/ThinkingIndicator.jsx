import React, { useEffect, useRef, useState } from 'react';
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
  if (stage === 'investigating') {
    return {
      Icon: FileSearch,
      context: t('thinking.investigating'),
      isSpinning: false,
    };
  }
  if (stage === 'reviewing') {
    return {
      Icon: Sparkles,
      context: t('thinking.reviewing'),
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

/**
 * Hitung target persentase secara dinamis berdasarkan tahap (stage),
 * langkah aktif (step), dan batas iterasi mode (max_steps).
 */
const computeTargetPercent = (progress) => {
  if (!progress) return 10;
  const stage = progress.stage;
  if (stage === 'done') return 100;
  if (stage === 'reconnecting') return 75;

  // Baca max_steps secara dinamis dari setting mode yang aktif (fallback 15 jika tidak tersedia)
  const maxSteps = Math.max(Number(progress.max_steps) || 15, 1);
  const step = Math.max(Number(progress.step) || 0, 0);
  const stepRatio = Math.min(step / maxSteps, 1);

  switch (stage) {
    case 'connecting':
      return 15;
    case 'reading':
      return 25;
    case 'thinking':
      // Langkah awal (analisis pertanyaan sebelum panggil tool)
      if (step <= 1) return 32;
      // Langkah perumusan jawaban dari data: bergerak dinamis 62% - 88% sesuai stepRatio
      return Math.min(Math.round(62 + stepRatio * 26), 88);
    case 'tool':
      // Eksekusi pengambilan data: bergerak dinamis 36% - 65% sesuai stepRatio
      return Math.min(Math.round(36 + stepRatio * 28), 65);
    case 'investigating':
      return Math.min(Math.round(28 + stepRatio * 20), 50);
    case 'reviewing':
      return Math.min(Math.round(88 + stepRatio * 8), 96);
    case 'building':
      // Menyiapkan berkas dokumen hasil (Excel/CSV/dokumen)
      return 92;
    default:
      return 20;
  }
};

const ThinkingIndicator = ({ progress, onStop }) => {
  const { t } = useLanguage();
  const targetPercent = computeTargetPercent(progress);
  const [displayPercent, setDisplayPercent] = useState(() => Math.min(targetPercent, 12));
  const { Icon, context, isSpinning } = resolveContext(progress, t);
  const label = progress?.label || t('thinking.processing');

  const targetRef = useRef(targetPercent);
  const isDoneRef = useRef(progress?.stage === 'done');
  const tickCountRef = useRef(0);

  useEffect(() => {
    targetRef.current = targetPercent;
    isDoneRef.current = progress?.stage === 'done';
  }, [targetPercent, progress?.stage]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayPercent((prev) => {
        const target = targetRef.current;
        const isDone = isDoneRef.current;

        // Bila proses selesai (done), percepat kenaikan urut hingga 100%
        if (isDone) {
          if (prev >= 100) return 100;
          const delta = Math.max(1, Math.ceil((100 - prev) / 3));
          return Math.min(prev + delta, 100);
        }

        // Naikkan secara urut dan bertahap menuju target
        if (prev < target) {
          const diff = target - prev;
          const stepDelta = diff > 20 ? 2 : 1;
          return Math.min(prev + stepDelta, target);
        }

        // Saat menunggu respon I/O (misal query SAP/Email lambat), lakukan perayap halus (micro-creep)
        // setiap ~600ms (+1%) agar loading tidak membeku, dibatasi aman sebelum tahap selesai.
        tickCountRef.current += 1;
        if (tickCountRef.current % 12 === 0 && prev < 92 && prev < target + 6) {
          return prev + 1;
        }

        return prev;
      });
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-start gap-3 my-3 animate-fadeIn" role="status" aria-live="polite">
      <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent border border-accent/25 flex items-center justify-center mt-1 shrink-0 shadow-2xs">
        <Icon className={`w-4 h-4 ${isSpinning ? 'animate-spin' : 'animate-pulse'}`} aria-hidden="true" />
      </div>

      <div className="bg-surface border border-line/80 rounded-2xl rounded-tl-xs p-4 min-w-0 flex-1 max-w-md shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs sm:text-sm text-content font-semibold font-display truncate">{label}</span>
          <span className="text-xs font-mono font-bold text-accent tabular-nums shrink-0">
            {displayPercent}%
          </span>
        </div>

        <div
          className="h-1.5 w-full bg-surface-sunken rounded-full overflow-hidden border border-line/40"
          role="progressbar"
          aria-valuenow={displayPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress: ${label}`}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${displayPercent}%` }}
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
