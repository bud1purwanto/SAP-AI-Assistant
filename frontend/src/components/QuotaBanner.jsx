import React from 'react';
import { AlertTriangle, Infinity as InfinityIcon, Zap } from 'lucide-react';

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

  const habis = (quota.remaining_tokens ?? 0) <= 0;
  const genting = habis || persen >= AMBANG_GENTING;

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
        </p>
        <p className="mt-0.5 opacity-90">
          {angka(quota.used_tokens)} dari {angka(quota.daily_token_limit)} token terpakai
          {quota.estimated && ' (sebagian diperkirakan)'}. Kuota dihitung ulang setiap tengah malam
          {habis && '; hubungi administrator bila Anda membutuhkan tambahan'}.
        </p>
      </div>
    </div>
  );
};

/** Ringkasan kuota di bilah atas — ringkas, tanpa memakan ruang. */
export const QuotaChip = ({ quota }) => {
  if (!quota) return null;

  if (quota.unlimited) {
    return (
      <span
        className="hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2 py-1 text-[10.5px] font-medium text-content-muted sm:inline-flex"
        title="Peran Anda tidak dibatasi kuota token"
      >
        <InfinityIcon className="h-3 w-3" aria-hidden="true" />
        Tanpa batas
      </span>
    );
  }

  const persen = quota.used_percent ?? 0;
  const warna = persen >= 95 ? 'text-danger' : persen >= 80 ? 'text-warning' : 'text-content-muted';

  return (
    <span
      className={`hidden items-center gap-1 rounded-full border border-line bg-surface-sunken px-2 py-1 text-[10.5px] font-medium sm:inline-flex ${warna}`}
      title={`${angka(quota.used_tokens)} dari ${angka(quota.daily_token_limit)} token terpakai hari ini${
        quota.enforced ? '' : ' (pembatasan sedang dimatikan)'
      }`}
    >
      <Zap className="h-3 w-3" aria-hidden="true" />
      {persen}%
    </span>
  );
};

export default QuotaBanner;
