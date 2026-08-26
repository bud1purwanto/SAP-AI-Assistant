import React from 'react';
import { AlertTriangle, Infinity as InfinityIcon } from 'lucide-react';

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

const angka = (n) => (n ?? 0).toLocaleString('id-ID');

const QuotaBanner = ({ quota }) => {
  if (!quota || !quota.enforced || quota.unlimited) return null;

  const persenTerpakai = quota.used_percent ?? 0;
  if (persenTerpakai < AMBANG_PERINGATAN) return null;

  const batas = quota.daily_token_limit ?? 0;
  const sisa = Math.max(0, quota.remaining_tokens ?? 0);
  const sisaPersen = batas > 0 ? Math.max(0, Math.min(100, Math.round((sisa / batas) * 100))) : 0;
  const habis = sisa <= 0;
  const hampirHabis = sisaPersen <= 15;

  return (
    <div
      role="status"
      className={`mx-3 mb-2 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs sm:mx-8 transition-colors ${
        habis || hampirHabis
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">
          {habis
            ? 'Kuota token harian Anda sudah habis'
            : `Sisa kuota token harian tinggal ${sisaPersen}% (${ringkas(sisa)} token)`}
        </p>
        <p className="mt-0.5 opacity-90">
          {angka(quota.used_tokens)} dari {angka(batas)} token terpakai ({persenTerpakai}%)
          {quota.estimated && ' (sebagian diperkirakan)'}. Kuota dihitung ulang setiap tengah malam
          {habis && '; hubungi administrator bila Anda membutuhkan tambahan'}.
        </p>
      </div>
    </div>
  );
};

/**
 * Sisa kuota token di bilah atas.
 *
 * Menggunakan pendekatan Hybrid (Progress Bar + Angka Ringkas + Tooltip Persentase Lengkap).
 * Berwarna MERAH jika kuota hampir habis (<= 15%), KUNING jika menipis (<= 30%).
 */

/** 1.240.000 → "1,2jt"; ruang di bilah atas terlalu sempit untuk angka penuh. */
const ringkas = (n) => {
  const v = Math.max(0, n ?? 0);
  if (v >= 1_000_000) {
    const jt = v / 1_000_000;
    return `${jt.toFixed(jt < 10 ? 1 : 0).replace('.', ',')}jt`;
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return String(v);
};

export const QuotaChip = ({ quota }) => {
  if (!quota) return null;

  if (quota.unlimited) {
    return (
      <span
        className="hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[10.5px] font-medium text-content-muted sm:inline-flex"
        title="Peran Anda tidak dibatasi kuota token harian (Unlimited)"
      >
        <InfinityIcon className="h-3 w-3 text-accent" aria-hidden="true" />
        Tanpa batas
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
      title={`Sisa ${angka(sisa)} dari ${angka(batas)} token (${sisaPersen}%) hari ini${
        quota.estimated ? ' (sebagian diperkirakan)' : ''
      }. Kuota dihitung ulang setiap tengah malam.`}
    >
      <span className={`hidden text-[10px] font-medium sm:inline ${hampirHabis ? 'text-rose-500' : 'text-content-subtle'}`}>
        Sisa
      </span>
      <div
        role="progressbar"
        aria-label="Sisa kuota token hari ini"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={sisaPersen}
        aria-valuetext={`${sisaPersen} persen (${angka(sisa)} token tersisa)`}
        className="h-1.5 w-9 overflow-hidden rounded-full bg-line/80 sm:w-16"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${warnaBilah}`}
          style={{ width: `${sisa > 0 ? Math.max(sisaPersen, 6) : 0}%` }}
        />
      </div>
      <span className={`text-[10.5px] tabular-nums ${warnaTeks}`}>
        {ringkas(sisa)}
      </span>
    </div>
  );
};

export default QuotaBanner;
