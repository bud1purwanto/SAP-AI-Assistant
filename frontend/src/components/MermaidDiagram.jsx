import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, Code2, Maximize2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

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

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  fontFamily: 'Inter, system-ui, sans-serif',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    nodeSpacing: 30,
    rankSpacing: 40,
    padding: 12,
  },
  sequence: {
    useMaxWidth: true,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
  },
};

/** Satu instans mermaid dipakai bersama; inisialisasi ulang mahal dan tidak perlu. */
function muatMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize(MERMAID_CONFIG);
      return mermaid;
    });
  }
  return mermaidPromise;
}

const temaMermaid = () =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'default';

let nomorUrut = 0;

/**
 * Hasil gambar disimpan per (tema + teks diagram).
 *
 * Menggambar ulang diagram yang sama memakan waktu dan — yang lebih terasa —
 * membuat tinggi isi menciut lalu memuai, sehingga posisi baca pengguna
 * meloncat. Dengan simpanan ini, diagram yang sudah pernah digambar langsung
 * tampil pada render berikutnya tanpa jeda.
 */
const simpanan = new Map();

const MermaidDiagram = ({ chart, isStreaming = false }) => {
  const { t } = useLanguage();
  const [svg, setSvg] = useState(() => simpanan.get(`${temaMermaid()}::${chart}`) || '');
  const [galat, setGalat] = useState('');
  const [lihatSumber, setLihatSumber] = useState(false);
  const [diperbesar, setDiperbesar] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const idRef = useRef(`mermaid-${(nomorUrut += 1)}`);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale((prevScale) => Math.min(Math.max(prevScale * zoomFactor, 0.25), 4));
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // hanya klik kiri
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    // Selama jawaban masih ditulis, teks diagram belum tentu utuh.
    if (isStreaming) return undefined;

    const kunci = `${temaMermaid()}::${chart}`;
    const tersimpan = simpanan.get(kunci);
    if (tersimpan) {
      setSvg(tersimpan);
      setGalat('');
      return undefined;
    }

    let dibatalkan = false;

    (async () => {
      try {
        const mermaid = await muatMermaid();
        if (dibatalkan) return;
        mermaid.initialize({ ...MERMAID_CONFIG, theme: temaMermaid() });
        const { svg: hasil } = await mermaid.render(idRef.current, chart);
        simpanan.set(kunci, hasil);
        if (!dibatalkan) {
          setSvg(hasil);
          setGalat('');
        }
      } catch (e) {
        if (!dibatalkan) {
          // Gambar sebelumnya dipertahankan bila ada; layar tidak perlu
          // berkedip hanya karena satu percobaan gagal.
          setGalat(e?.message || 'Diagram could not be rendered.');
        }
      }
    })();

    return () => { dibatalkan = true; };
  }, [chart, isStreaming]);

  if (isStreaming) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-xs text-content-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {t('diagram.preparing')}
      </div>
    );
  }

  // Diagram yang tidak dapat digambar tetap harus berguna: tampilkan sumbernya
  // agar isinya tidak hilang begitu saja.
  if (galat && !svg) {
    return (
      <div className="my-3 overflow-hidden rounded-2xl border border-warning/40 bg-warning-soft/40">
        <div className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold text-warning">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {t('diagram.error')}
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
          <span className="text-[11px] font-semibold text-content-muted">{t('diagram.title')}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLihatSumber((v) => !v)}
              className="rounded-lg p-1.5 text-content-subtle transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
              title={lihatSumber ? t('diagram.viewVisual') : t('diagram.viewSource')}
              aria-label={lihatSumber ? t('diagram.viewVisual') : t('diagram.viewSource')}
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDiperbesar(true)}
              className="rounded-lg p-1.5 text-content-subtle transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
              title={t('diagram.expand')}
              aria-label={t('diagram.expand')}
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
          // Diagram berukuran wajar sesuai isi; diagram pendek tidak ditarik paksa
          // melebar ke seluruh layar, dan diagram besar dapat digulir horizontal.
          <div
            className="overflow-x-auto overscroll-x-contain p-3 sm:p-4 flex items-center justify-center min-h-[4rem] [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[30rem] [&_svg]:w-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      {diperbesar && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm pt-safe pb-safe select-none"
          role="dialog"
          aria-label={t('diagram.title')}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-content">{t('diagram.title')}</span>
              <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-medium text-content-muted px-2">
                  {Math.round(scale * 100)}%
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDiperbesar(false);
                resetZoom();
              }}
              className="rounded-xl p-2 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
              aria-label={t('diagram.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div
            className={`flex-1 overflow-hidden p-4 sm:p-8 flex items-center justify-center ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
          >
            <div
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                transformOrigin: 'center center',
              }}
              className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[85vh] [&_svg]:w-auto [&_svg]:max-w-full pointer-events-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default MermaidDiagram;
