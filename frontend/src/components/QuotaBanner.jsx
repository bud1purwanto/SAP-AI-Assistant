import React, { useState } from 'react';
import { AlertTriangle, Infinity as InfinityIcon, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Peringatan sisa kuota token harian.
 *
 * Hanya muncul ketika sudah dekat batas. Menampilkannya terus-menerus hanya
 * menambah kebisingan; yang dibutuhkan pengguna adalah tahu SEBELUM terputus,
 * bukan diingatkan sepanjang hari.
 *
 * Ketika pembatasan dimatikan admin, tidak ada yang perlu diperingatkan sama
 * sekali — pemakaian tetap dicatat, tetapi tidak membatasi apa pun.
 */

const AMBANG_PERINGATAN = 70;   // persen terpakai (muncul saat sisa <= 30%)

const angka = (n, lang = 'id') => (n ?? 0).toLocaleString(lang === 'en' ? 'en-US' : 'id-ID');

const QuotaBanner = ({ quota, isDashboard = false }) => {
  const { t, language } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!quota || !quota.enforced || quota.unlimited) return null;

  const persenTerpakai = quota.used_percent ?? 0;
  if (persenTerpakai < AMBANG_PERINGATAN) return null;

  const batas = quota.daily_token_limit ?? 0;
  const sisa = Math.max(0, quota.remaining_tokens ?? 0);
  const sisaPersen = batas > 0 ? Math.max(0, Math.min(100, Math.round((sisa / batas) * 100))) : 0;
  const habis = sisa <= 0;
  const hampirHabis = sisaPersen <= 15;

  const containerClasses = isDashboard
    ? 'relative mt-3.5 sm:mt-4 mx-3 sm:mx-6 mb-2 md:mt-0 md:mb-0 md:absolute md:top-5 md:left-1/2 md:-translate-x-1/2 md:w-[calc(100%-3rem)] md:max-w-5xl md:mx-auto md:z-30 md:shadow-lg md:backdrop-blur-md'
    : 'relative mt-2 mx-3 sm:mx-8 mb-2';

  const themeClasses = habis || hampirHabis
    ? 'border-rose-500/40 bg-rose-500/10 md:bg-rose-50/95 dark:md:bg-rose-950/85 text-rose-600 dark:text-rose-400'
    : 'border-amber-500/40 bg-amber-500/10 md:bg-amber-50/95 dark:md:bg-amber-950/85 text-amber-600 dark:text-amber-400';

  return (
    <div
      role="status"
      className={`${containerClasses} flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs transition-all ${themeClasses}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {habis
            ? t('quota.exhausted')
            : t('quota.remainingNotice', { percent: sisaPersen, remaining: ringkas(sisa, language) })}
        </p>
        <p className="mt-0.5 opacity-90 leading-relaxed">
          {t('quota.usedDetail', {
            used: angka(quota.used_tokens, language),
            limit: angka(batas, language),
            percent: persenTerpakai,
          })}
          {quota.estimated && ` (${language === 'en' ? 'partially estimated' : 'sebagian diperkirakan'})`}. {t('quota.resetNotice')}
          {habis && `; ${t('quota.adminContact')}`}.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer shrink-0 ml-auto"
        aria-label={language === 'en' ? 'Close' : 'Tutup'}
        title={language === 'en' ? 'Close' : 'Tutup'}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * Sisa kuota token di bilah atas.
 *
 * Menggunakan pendekatan Hybrid (Progress Bar + Angka Ringkas + Tooltip Persentase Lengkap).
 * Berwarna MERAH jika kuota hampir habis (<= 15%), KUNING jika menipis (<= 30%).
 */

/** 1.240.000 → "1,2jt" (id) / "1.2m" (en); ruang di bilah atas terlalu sempit untuk angka penuh. */
const ringkas = (n, lang = 'id') => {
  const v = Math.max(0, n ?? 0);
  if (v >= 1_000_000) {
    const jt = v / 1_000_000;
    const formatted = jt.toFixed(jt < 10 ? 1 : 0);
    return lang === 'en' ? `${formatted}m` : `${formatted.replace('.', ',')}jt`;
  }
  if (v >= 1_000) {
    const rb = Math.round(v / 1_000);
    return lang === 'en' ? `${rb}k` : `${rb}rb`;
  }
  return String(v);
};

export const QuotaChip = ({ quota }) => {
  const { t, language } = useLanguage();
  if (!quota) return null;

  if (quota.unlimited) {
    return (
      <span
        className="hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[10.5px] font-medium text-content-muted sm:inline-flex"
        title={t('nav.quotaUnlimitedTooltip')}
      >
        <InfinityIcon className="h-3 w-3 text-accent" aria-hidden="true" />
        {t('nav.unlimited')}
      </span>
    );
  }

  // Pembatasan mati: pemakaian tetap dicatat untuk admin, tetapi pengguna
  // tidak punya sisa yang perlu dijaga.
  if (!quota.enforced) return null;

  const batas = quota.daily_token_limit ?? 0;
  const sisa = Math.max(0, quota.remaining_tokens ?? 0);
  const sisaPersen = batas > 0 ? Math.max(0, Math.min(100, Math.round((sisa / batas) * 100))) : 0;

  // Ambang batas warna:
  // <= 15% -> Merah (Hampir Limit / Kritis)
  // <= 30% -> Kuning (Menipis)
  // > 30%  -> Normal
  const hampirHabis = sisaPersen <= 15;
  const menipis = sisaPersen <= 30;

  const warnaTeks = hampirHabis
    ? 'text-rose-600 dark:text-rose-400 font-bold'
    : menipis
    ? 'text-amber-600 dark:text-amber-400 font-semibold'
    : 'text-content-secondary font-medium';

  const warnaBilah = hampirHabis
    ? 'bg-rose-500 animate-pulse'
    : menipis
    ? 'bg-amber-500'
    : 'bg-accent';

  const styleContainer = hampirHabis
    ? 'border-rose-500/40 bg-rose-500/10 shadow-xs shadow-rose-500/10'
    : menipis
    ? 'border-amber-500/40 bg-amber-500/5'
    : 'border-line bg-surface-sunken';

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 rounded-full border px-2 py-1 sm:px-2.5 transition-all ${styleContainer}`}
      title={`${language === 'en' ? 'Remaining' : 'Sisa'} ${angka(sisa, language)} / ${angka(batas, language)} token (${sisaPersen}%) ${language === 'en' ? 'today' : 'hari ini'}. ${t('quota.resetNotice')}`}
    >
      <span className={`hidden text-[10px] font-medium sm:inline ${hampirHabis ? 'text-rose-500' : 'text-content-subtle'}`}>
        {t('nav.quotaRemaining')}
      </span>
      <div
        role="progressbar"
        aria-label={language === 'en' ? "Today's remaining token quota" : "Sisa kuota token hari ini"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={sisaPersen}
        aria-valuetext={language === 'en' ? `${sisaPersen} percent (${angka(sisa, language)} tokens remaining)` : `${sisaPersen} persen (sisa ${angka(sisa, language)} token)`}
        className="h-1.5 w-9 overflow-hidden rounded-full bg-line/80 sm:w-16"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${warnaBilah}`}
          style={{ width: `${sisa > 0 ? Math.max(sisaPersen, 6) : 0}%` }}
        />
      </div>
      <span className={`text-[10.5px] tabular-nums ${warnaTeks}`}>
        {ringkas(sisa, language)}
      </span>
    </div>
  );
};

export default QuotaBanner;
