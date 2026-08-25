import React, { useState } from 'react';
import { Clock, Database, Gauge, Wrench, Zap } from 'lucide-react';

/**
 * Ringkasan biaya dan kecepatan permintaan terakhir.
 *
 * Angkanya berasal dari yang dilaporkan provider AI, bukan hitungan sendiri:
 * tokenizer tiap model berbeda, dan angka yang salah lebih menyesatkan daripada
 * tidak ada angka. Karena itu setiap bagian hanya muncul bila datanya benar-benar
 * ada — pill tidak pernah menampilkan tebakan.
 */

const ringkasAngka = (n) => {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
};

const UsagePill = ({ usage }) => {
  const [terbuka, setTerbuka] = useState(false);
  if (!usage) return null;

  const adaToken = usage.total_tokens !== null && usage.total_tokens !== undefined;
  const adaWaktu = usage.latency_ms !== null && usage.latency_ms !== undefined;
  if (!adaToken && !adaWaktu) return null;

  const detik = adaWaktu ? (usage.latency_ms / 1000).toFixed(1) : null;
  // Rasio cache hanya bermakna bila token masukannya diketahui.
  const persenCache =
    usage.cached_tokens && usage.prompt_tokens
      ? Math.round((usage.cached_tokens / usage.prompt_tokens) * 100)
      : null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-[10.5px] font-medium text-content-muted transition-colors hover:border-accent/40 hover:text-content"
        title="Rincian pemakaian permintaan ini"
        aria-expanded={terbuka}
      >
        {adaToken && (
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-accent" aria-hidden="true" />
            {ringkasAngka(usage.total_tokens)} token
          </span>
        )}
        {persenCache !== null && (
          <span className="flex items-center gap-1 text-success">
            <Database className="h-3 w-3" aria-hidden="true" />
            {persenCache}% cache
          </span>
        )}
        {adaWaktu && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {detik}s
          </span>
        )}
      </button>

      {terbuka && (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-[11px] sm:max-w-sm">
          {usage.prompt_tokens !== null && usage.prompt_tokens !== undefined && (
            <>
              <dt className="text-content-subtle">Token masukan</dt>
              <dd className="text-right font-semibold text-content tabular-nums">
                {usage.prompt_tokens.toLocaleString('id-ID')}
              </dd>
            </>
          )}
          {usage.completion_tokens !== null && usage.completion_tokens !== undefined && (
            <>
              <dt className="text-content-subtle">Token jawaban</dt>
              <dd className="text-right font-semibold text-content tabular-nums">
                {usage.completion_tokens.toLocaleString('id-ID')}
              </dd>
            </>
          )}
          {usage.cached_tokens ? (
            <>
              <dt className="text-content-subtle">Dari cache</dt>
              <dd className="text-right font-semibold text-success tabular-nums">
                {usage.cached_tokens.toLocaleString('id-ID')}
              </dd>
            </>
          ) : null}
          {adaWaktu && (
            <>
              <dt className="flex items-center gap-1 text-content-subtle">
                <Gauge className="h-3 w-3" aria-hidden="true" /> Waktu proses
              </dt>
              <dd className="text-right font-semibold text-content tabular-nums">{detik} detik</dd>
            </>
          )}
          {usage.tool_calls > 0 && (
            <>
              <dt className="flex items-center gap-1 text-content-subtle">
                <Wrench className="h-3 w-3" aria-hidden="true" /> Panggilan data
              </dt>
              <dd className="text-right font-semibold text-content tabular-nums">{usage.tool_calls}</dd>
            </>
          )}
          {usage.model && (
            <>
              <dt className="text-content-subtle">Model</dt>
              <dd className="truncate text-right font-semibold text-content" title={usage.model}>
                {usage.model}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
};

export default UsagePill;
