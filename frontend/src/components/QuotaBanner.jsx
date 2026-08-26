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

const AMBANG_PERINGATAN = 80;   // persen terpakai
const AMBANG_GENTING = 95;

const angka = (n) => (n ?? 0).toLocaleString('id-ID');

const QuotaBanner = ({ quota }) => {
  if (!quota || !quota.enforced || quota.unlimited) return null;

  const persen = quota.used_percent ?? 0;
  if (persen < AMBANG_PERINGATAN) return null;
  const persenTerpakai = quota.used_percent ?? 0;
  if (persenTerpakai < AMBANG_PERINGATAN) return null;

  const habis = (quota.remaining_tokens ?? 0) <= 0;
  const genting = habis || persen >= AMBANG_GENTING;
  const batas = quota.daily_token_limit ?? 0;
  const sisa = Math.max(0, quota.remaining_tokens ?? 0);
  const sisaPersen = batas > 0 ? Math.max(0, Math.min(100, Math.round((sisa / batas) * 100))) : 0;
  const habis = sisa <= 0;
  const genting = habis || sisaPersen <= 5;

  return (
    <div
      role="status"
      className={`mx-3 mb-2 flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs sm:mx-8 ${
        genting
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-warning/40 bg-warning-soft text-warning'
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">
          {habis
            ? 'Kuota token harian Anda sudah habis'
            : `Sisa kuota token harian tinggal ${100 - persen}%`}
            : `Sisa kuota token harian tinggal ${sisaPersen}% (${ringkas(sisa)} token)`}
        </p>
        <p className="mt-0.5 opacity-90">
          {angka(quota.used_tokens)} dari {angka(quota.daily_token_limit)} token terpakai
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
 * Yang ditampilkan adalah SISA, bukan yang sudah terpakai: pertanyaan yang
 * dipunyai pengguna adalah "masih cukup untuk berapa lama lagi", dan angka
 * terpakai memaksa mereka menghitung sendiri.
 *
 * Bilahnya hanya muncul ketika pembatasan sedang ditegakkan. Saat admin
 * mematikan pembatasan, tidak ada yang bisa habis — memperlihatkan bilah yang
 * menyusut di situ berarti memperingatkan sesuatu yang tidak akan terjadi.
 * Menggunakan pendekatan Hybrid (Progress Bar + Angka Ringkas + Tooltip Persentase Lengkap).
 * Bilahnya hanya muncul ketika pembatasan sedang ditegakkan.
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
        className="hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2 py-1 text-[10.5px] font-medium text-content-muted sm:inline-flex"
        title="Peran Anda tidak dibatasi kuota token"
        className="hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[10.5px] font-medium text-content-muted sm:inline-flex"
        title="Peran Anda tidak dibatasi kuota token harian (Unlimited)"
      >
        <InfinityIcon className="h-3 w-3" aria-hidden="true" />
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

  const genting = sisaPersen <= 5;
  const menipis = sisaPersen <= 20;
  const warnaTeks = genting ? 'text-danger' : menipis ? 'text-warning' : 'text-content-muted';
  const warnaTeks = genting ? 'text-danger font-bold' : menipis ? 'text-warning font-semibold' : 'text-content-secondary font-medium';
  const warnaBilah = genting ? 'bg-danger' : menipis ? 'bg-warning' : 'bg-accent';

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-line bg-surface-sunken px-2 py-1 sm:px-2.5"
      title={`Sisa ${angka(sisa)} dari ${angka(batas)} token hari ini${
      className={`flex items-center gap-1.5 sm:gap-2 rounded-full border border-line bg-surface-sunken px-2 py-1 sm:px-2.5 transition-all ${
        genting ? 'border-danger/40 shadow-xs shadow-danger/10' : menipis ? 'border-warning/40' : ''
      }`}
      title={`Sisa ${angka(sisa)} dari ${angka(batas)} token (${sisaPersen}%) hari ini${
        quota.estimated ? ' (sebagian diperkirakan)' : ''
      }. Kuota dihitung ulang setiap tengah malam.`}
    >
      <span className="hidden text-[10px] font-medium text-content-subtle sm:inline">Sisa</span>
      <div
        role="progressbar"
        aria-label="Sisa kuota token hari ini"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={sisaPersen}
        aria-valuetext={`${sisaPersen} persen, ${angka(sisa)} token`}
        className="h-1.5 w-9 overflow-hidden rounded-full bg-line sm:w-20"
        aria-valuetext={`${sisaPersen} persen (${angka(sisa)} token tersisa)`}
        className="h-1.5 w-9 overflow-hidden rounded-full bg-line sm:w-16"
      >
        {/* Sisa 1% pada bilah selebar 36px hanya sepersekian piksel — tak
            terlihat, sehingga "hampir habis" dan "sudah habis" tampak sama. */}
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${warnaBilah}`}
          style={{ width: `${sisa > 0 ? Math.max(sisaPersen, 6) : 0}%` }}
        />
      </div>
      <span className={`text-[10.5px] font-semibold tabular-nums ${warnaTeks}`}>
      <span className={`text-[10.5px] tabular-nums ${warnaTeks}`}>
        {ringkas(sisa)}
      </span>
    </div>
  );
};

export default QuotaBanner;
