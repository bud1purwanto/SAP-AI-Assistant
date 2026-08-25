import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Code2, Maximize2, X } from 'lucide-react';

/**
 * Diagram alur dari blok ```mermaid pada jawaban asisten.
 *
 * Pustaka mermaid berukuran besar (>2 MB) sehingga diimpor secara dinamis saat
 * diagram pertama benar-benar muncul; percakapan yang tidak memuat diagram
 * tidak ikut menanggung biayanya.
 *
 * Jawaban mengalir kata demi kata, artinya komponen ini sempat menerima teks
 * diagram yang belum utuh. Menggambar potongan yang belum lengkap menghasilkan
 * pesan galat yang berkedip-kedip, jadi penggambaran ditunda sampai teksnya
 * berhenti bertambah.
 */

let mermaidPromise = null;

/** Satu instans mermaid dipakai bersama; inisialisasi ulang mahal dan tidak perlu. */
function muatMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',   // jangan izinkan skrip/HTML dari isi diagram
        fontFamily: 'Inter, system-ui, sans-serif',
        flowchart: { useMaxWidth: true, htmlLabels: false },
        sequence: { useMaxWidth: true },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

const temaMermaid = () =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'default';

let nomorUrut = 0;

const MermaidDiagram = ({ chart, isStreaming = false }) => {
  const [svg, setSvg] = useState('');
  const [galat, setGalat] = useState('');
  const [lihatSumber, setLihatSumber] = useState(false);
  const [diperbesar, setDiperbesar] = useState(false);
  const idRef = useRef(`mermaid-${(nomorUrut += 1)}`);

  useEffect(() => {
    // Selama jawaban masih ditulis, teks diagram belum tentu utuh.
    if (isStreaming) return undefined;

    let dibatalkan = false;

    (async () => {
      try {
        const mermaid = await muatMermaid();
        if (dibatalkan) return;
        mermaid.initialize({ startOnLoad: false, theme: temaMermaid() });
        const { svg: hasil } = await mermaid.render(idRef.current, chart);
        if (!dibatalkan) {
          setSvg(hasil);
          setGalat('');
        }
      } catch (e) {
        if (!dibatalkan) {
          setSvg('');
          setGalat(e?.message || 'Diagram tidak dapat digambar.');
        }
      }
    })();

    return () => { dibatalkan = true; };
  }, [chart, isStreaming]);

  if (isStreaming) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-xs text-content-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        Menyiapkan diagram…
      </div>
    );
  }

  // Diagram yang tidak dapat digambar tetap harus berguna: tampilkan sumbernya
  // agar isinya tidak hilang begitu saja.
  if (galat) {
    return (
      <div className="my-3 overflow-hidden rounded-2xl border border-warning/40 bg-warning-soft/40">
        <div className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-warning">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Diagram tidak dapat ditampilkan
        </div>
        <pre className="overflow-x-auto px-4 pb-3 text-[11px] leading-relaxed text-content-secondary">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <>
      <div className="group/diagram my-3 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line bg-surface-sunken px-3.5 py-2">
          <span className="text-[11px] font-semibold text-content-muted">Diagram alur</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLihatSumber((v) => !v)}
              className="rounded-lg p-1.5 text-content-subtle transition-colors hover:bg-surface-hover hover:text-content"
              title={lihatSumber ? 'Tampilkan diagram' : 'Lihat kode diagram'}
              aria-label={lihatSumber ? 'Tampilkan diagram' : 'Lihat kode diagram'}
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDiperbesar(true)}
              className="rounded-lg p-1.5 text-content-subtle transition-colors hover:bg-surface-hover hover:text-content"
              title="Perbesar diagram"
              aria-label="Perbesar diagram"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {lihatSumber ? (
          <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-content-secondary">
            {chart}
          </pre>
        ) : (
          // Diagram lebar digulir di dalam wadahnya sendiri; halaman tidak
          // boleh ikut bergeser ke samping.
          <div
            className="overflow-x-auto overscroll-x-contain px-3 py-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {diperbesar && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm pt-safe pb-safe"
          role="dialog"
          aria-label="Diagram diperbesar"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-content">Diagram alur</span>
            <button
              type="button"
              onClick={() => setDiperbesar(false)}
              className="rounded-xl p-2.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
              aria-label="Tutup diagram"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            className="flex-1 overflow-auto p-4 [&_svg]:mx-auto [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </>
  );
};

export default MermaidDiagram;
