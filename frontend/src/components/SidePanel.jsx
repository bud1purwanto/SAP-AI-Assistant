import React, { useEffect } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

import { copyToClipboard } from '../lib/clipboard';

/**
 * Panel samping untuk isi panjang: kode ABAP, tabel lebar, atau spesifikasi
 * dokumen. Percakapan tetap terbaca di kiri sementara isinya dibaca di kanan,
 * sehingga tidak perlu menggulir naik-turun.
 *
 * Di layar sempit ruang untuk dua kolom tidak ada, jadi panel tampil sebagai
 * lapisan penuh — memaksakan split screen di ponsel hanya membuat keduanya
 * terlalu sempit untuk dibaca.
 */
const SidePanel = ({ isi, onTutup }) => {
  const { t } = useLanguage();
  const [tersalin, setTersalin] = React.useState(false);

  useEffect(() => {
    if (!isi) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isi, onTutup]);

  if (!isi) return null;

  const salin = async () => {
    if (await copyToClipboard(isi.teks)) {
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    }
  };

  const unduh = () => {
    const blob = new Blob([isi.teks], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isi.namaBerkas || 'isi.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      className="app-side-panel fixed inset-0 z-40 flex flex-col border-l border-line bg-surface-raised
                 lg:static lg:inset-auto lg:w-[26rem] xl:w-[32rem] lg:shrink-0"
      style={{ height: 'var(--app-height, 100dvh)' }}
      aria-label={isi.judul}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-line px-4 pb-3"
        style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.875rem)' }}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-content">{isi.judul}</h2>
          {isi.keterangan && (
            <p className="truncate text-[11px] text-content-muted">{isi.keterangan}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={salin}
            className="rounded-xl p-2 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
            title={tersalin ? t('chat.copied') : t('sidepanel.copy')}
            aria-label={t('sidepanel.copy')}
          >
            {tersalin
              ? <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={unduh}
            className="rounded-xl p-2 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
            title={t('sidepanel.download')}
            aria-label={t('sidepanel.download')}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onTutup}
            className="rounded-xl p-2.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
            title={t('sidepanel.close')}
            aria-label={t('sidepanel.close')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto overscroll-contain bg-surface p-4"
        style={{ paddingBottom: 'max(1rem, var(--sab))' }}
      >
        <pre className="whitespace-pre font-mono text-[12px] leading-relaxed text-content-secondary">
          {isi.teks}
        </pre>
      </div>
    </aside>
  );
};

export default SidePanel;
