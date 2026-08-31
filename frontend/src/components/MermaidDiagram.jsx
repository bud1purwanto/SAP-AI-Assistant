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
  
  const idRef = useRef(`mermaid-${(nomorUrut += 1)}`);
  const containerRef = useRef(null);
  const pointerMapRef = useRef(new Map());
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(Number((s + 0.25).toFixed(2)), 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(Number((s - 0.25).toFixed(2)), 0.25));
  }, []);

  const handleDoubleClick = useCallback(() => {
    setScale((prev) => (prev > 1.2 ? 1 : 1.75));
    setPosition({ x: 0, y: 0 });
  }, []);

  // Pointer drag & multi-touch pinch handling
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Abaikan jika pointer capture tidak didukung
    }

    pointerMapRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerMapRef.current.size === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    } else if (pointerMapRef.current.size === 2) {
      // Start multi-touch pinch
      const points = Array.from(pointerMapRef.current.values());
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartDistRef.current = dist;
      pinchStartScaleRef.current = scale;
      setIsDragging(false);
    }
  };

  const handlePointerMove = (e) => {
    if (!pointerMapRef.current.has(e.pointerId)) return;
    pointerMapRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerMapRef.current.size === 1 && isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
    } else if (pointerMapRef.current.size === 2 && pinchStartDistRef.current > 0) {
      // Handle multi-touch pinch zoom
      const points = Array.from(pointerMapRef.current.values());
      const currentDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const ratio = currentDist / pinchStartDistRef.current;
      const nextScale = Math.min(Math.max(pinchStartScaleRef.current * ratio, 0.25), 4);
      setScale(Number(nextScale.toFixed(2)));
    }
  };

  const handlePointerUp = (e) => {
    pointerMapRef.current.delete(e.pointerId);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Abaikan
    }

    if (pointerMapRef.current.size === 0) {
      setIsDragging(false);
      pinchStartDistRef.current = 0;
    } else if (pointerMapRef.current.size === 1) {
      // Transisi dari pinch kembali ke single finger drag
      const remainingPoint = Array.from(pointerMapRef.current.values())[0];
      dragStartRef.current = {
        x: remainingPoint.x,
        y: remainingPoint.y,
        posX: position.x,
        posY: position.y,
      };
      setIsDragging(true);
    }
  };

  // Wheel zoom via non-passive event listener to allow preventDefault reliably
  useEffect(() => {
    if (!diperbesar) return undefined;

    const container = containerRef.current;
    if (!container) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const factor = e.deltaY < 0 ? 1.15 : 0.88;
      setScale((prev) => Math.min(Math.max(Number((prev * factor).toFixed(2)), 0.25), 4));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [diperbesar]);

  // Keyboard shortcut (Esc untuk tutup, +/- untuk zoom, 0 untuk reset)
  useEffect(() => {
    if (!diperbesar) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setDiperbesar(false);
        resetZoom();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [diperbesar, resetZoom, handleZoomIn, handleZoomOut]);

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
              onClick={() => {
                resetZoom();
                setDiperbesar(true);
              }}
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
          aria-modal="true"
          aria-label={t('diagram.title')}
        >
          {/* Header & Controls Toolbar */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3 bg-surface z-10">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-content">{t('diagram.title')}</span>
              <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Zoom In (+)"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Zoom Out (-)"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="rounded-lg p-1.5 text-content-muted transition-colors hover:bg-surface-hover hover:text-content cursor-pointer"
                  title="Reset Zoom (0)"
                  aria-label="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-medium text-content-muted px-2 min-w-[3rem] text-center">
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
              title={t('diagram.close')}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Interactive Zoom & Pan Viewport */}
          <div
            ref={containerRef}
            className={`relative flex-1 w-full h-full overflow-hidden flex items-center justify-center touch-none select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
          >
            <div
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0, 0, 1)',
                transformOrigin: 'center center',
              }}
              className="flex items-center justify-center pointer-events-none [&_svg]:!max-w-[85vw] [&_svg]:!max-h-[75vh] [&_svg]:!w-auto [&_svg]:!h-auto [&_svg]:block select-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default MermaidDiagram;
