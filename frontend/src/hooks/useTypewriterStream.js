import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mencegah terpotongnya pasangan surrogate UTF-16 (misal emoji 🤖, 📊, ⚡)
 * di tengah jalan saat memotong teks per karakter.
 */
function safeCharSlice(str, targetLength) {
  if (!str || targetLength <= 0) return '';
  if (targetLength >= str.length) return str;

  const code = str.charCodeAt(targetLength - 1);
  // Bila posisi potong jatuh pada high surrogate (0xD800 - 0xDBFF),
  // sertakan satu kode unit berikutnya (low surrogate).
  if (code >= 0xD800 && code <= 0xDBFF) {
    return str.slice(0, targetLength + 1);
  }
  return str.slice(0, targetLength);
}

/**
 * Hook untuk menghadirkan efek ketikan (typewriter stream) yang halus dan adaptif.
 *
 * Mengatasi masalah model AI (khususnya model penalaran hard / medium) yang
 * sering mengeluarkan teks dalam letupan chunk besar secara tiba-tiba (bursts),
 * sehingga teks dapat mengalir ritmis karakter demi karakter dengan perlambatan
 * halus (ease-out deceleration).
 */
export function useTypewriterStream() {
  const [streamMap, setStreamMap] = useState({});

  // Menyimpan data teks lengkap yang sudah diterima dari server
  const rawStreamRef = useRef({});
  // Menyimpan teks yang saat ini sudah tertampil di layar
  const displayedStreamRef = useRef({});
  // ID requestAnimationFrame per sessionKey
  const rafRef = useRef({});
  // Catatan waktu frame terakhir untuk membatasi laju render (~50fps / 20ms)
  const lastTickRef = useRef({});
  // Resolver promise saat flushAndFinish() dipanggil
  const finishResolversRef = useRef({});

  // Pembersihan seluruh frame saat unmount
  useEffect(() => {
    const rafs = rafRef.current;
    const resolvers = finishResolversRef.current;
    return () => {
      Object.keys(rafs).forEach((key) => {
        if (rafs[key]) cancelAnimationFrame(rafs[key]);
      });
      Object.keys(resolvers).forEach((key) => {
        if (resolvers[key]) resolvers[key]();
      });
    };
  }, []);

  const scheduleTick = useCallback((sessionKey) => {
    if (rafRef.current[sessionKey]) return;

    const tick = (now) => {
      delete rafRef.current[sessionKey];

      const raw = rawStreamRef.current[sessionKey] || '';
      let current = displayedStreamRef.current[sessionKey] || '';
      const diff = raw.length - current.length;

      // Bila tidak ada lagi teks yang perlu diketik
      if (diff <= 0) {
        if (finishResolversRef.current[sessionKey]) {
          const resolver = finishResolversRef.current[sessionKey];
          delete finishResolversRef.current[sessionKey];
          resolver();
        }
        return;
      }

      // Pembatasan laju refresh (~50fps / minimal 18ms per tick)
      // Menjamin ritme pengetikan stabil di semua monitor (60Hz / 120Hz / 144Hz)
      const lastTime = lastTickRef.current[sessionKey] || 0;
      const elapsed = now - lastTime;
      if (elapsed < 18) {
        rafRef.current[sessionKey] = requestAnimationFrame(tick);
        return;
      }
      lastTickRef.current[sessionKey] = now;

      // Jika tab sedang di-minimize atau tidak aktif di latar belakang,
      // langsung tuntaskan agar pengguna tidak menunggu saat membuka kembali tab.
      if (typeof document !== 'undefined' && document.hidden) {
        displayedStreamRef.current[sessionKey] = raw;
        setStreamMap((prev) => ({ ...prev, [sessionKey]: raw }));
        if (finishResolversRef.current[sessionKey]) {
          const resolver = finishResolversRef.current[sessionKey];
          delete finishResolversRef.current[sessionKey];
          resolver();
        }
        return;
      }

      // Kalkulasi langkah adaptif (adaptive step size)
      // Menghadirkan ritme ketikan natural saat aliran stabil, dan
      // melakukan akselerasi terukur saat ada lonjakan besar dari model penalaran.
      let step = 1;
      const isFinishing = Boolean(finishResolversRef.current[sessionKey]);

      if (isFinishing) {
        // Saat menunggu finalisasi: percepat penuntasan agar sisa kalimat
        // mengalir rapi dalam hitungan milidetik tanpa menahan pengguna.
        if (diff <= 10) {
          step = Math.min(diff, 2);
        } else if (diff <= 30) {
          step = Math.min(diff, 4);
        } else if (diff <= 100) {
          step = Math.min(diff, Math.ceil(diff / 6));
        } else {
          step = Math.min(diff, Math.ceil(diff / 4));
        }
      } else {
        // Aliran normal: ritme mesin tik / asisten mengetik secara hidup
        if (diff <= 3) {
          step = 1;
        } else if (diff <= 8) {
          step = Math.min(diff, 2);
        } else if (diff <= 20) {
          step = Math.min(diff, 3);
        } else if (diff <= 50) {
          step = Math.min(diff, 5);
        } else if (diff <= 120) {
          step = Math.min(diff, Math.ceil(diff / 9));
        } else {
          step = Math.min(diff, Math.ceil(diff / 6));
        }
      }

      const nextTargetLen = current.length + step;
      const nextText = safeCharSlice(raw, nextTargetLen);
      displayedStreamRef.current[sessionKey] = nextText;

      setStreamMap((prev) => ({ ...prev, [sessionKey]: nextText }));

      if (nextText.length < raw.length) {
        rafRef.current[sessionKey] = requestAnimationFrame(tick);
      } else if (finishResolversRef.current[sessionKey]) {
        const resolver = finishResolversRef.current[sessionKey];
        delete finishResolversRef.current[sessionKey];
        resolver();
      }
    };

    rafRef.current[sessionKey] = requestAnimationFrame(tick);
  }, []);

  /**
   * Menambahkan token baru yang diterima dari SSE backend ke dalam antrean.
   */
  const appendToken = useCallback((sessionKey, chunk) => {
    if (chunk === null) {
      // Server mengirim token_reset: batalkan teks yang sudah dialirkan
      if (rafRef.current[sessionKey]) {
        cancelAnimationFrame(rafRef.current[sessionKey]);
        delete rafRef.current[sessionKey];
      }
      rawStreamRef.current[sessionKey] = '';
      displayedStreamRef.current[sessionKey] = '';
      setStreamMap((prev) => ({ ...prev, [sessionKey]: '' }));
      if (finishResolversRef.current[sessionKey]) {
        const resolver = finishResolversRef.current[sessionKey];
        delete finishResolversRef.current[sessionKey];
        resolver();
      }
      return;
    }

    if (!chunk) return;

    rawStreamRef.current[sessionKey] = (rawStreamRef.current[sessionKey] || '') + chunk;
    scheduleTick(sessionKey);
  }, [scheduleTick]);

  /**
   * Memastikan seluruh teks jawaban final terselesaikan dengan efek ketikan
   * mulus sebelum transisi ke pesan permanen.
   */
  const flushAndFinish = useCallback((sessionKey, finalText) => {
    return new Promise((resolve) => {
      const target = typeof finalText === 'string'
        ? finalText
        : (rawStreamRef.current[sessionKey] || '');

      rawStreamRef.current[sessionKey] = target;
      const current = displayedStreamRef.current[sessionKey] || '';

      if (current.length >= target.length) {
        resolve();
        return;
      }

      // Batas waktu pengaman maksimal (1000ms) agar tidak pernah menghambat UI
      const timeoutId = setTimeout(() => {
        displayedStreamRef.current[sessionKey] = target;
        setStreamMap((prev) => ({ ...prev, [sessionKey]: target }));
        resolve();
      }, 1000);

      finishResolversRef.current[sessionKey] = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      scheduleTick(sessionKey);
    });
  }, [scheduleTick]);

  /**
   * Membatalkan pengetikan seketika (misal saat tombol Stop ditekan).
   */
  const abortStream = useCallback((sessionKey) => {
    if (rafRef.current[sessionKey]) {
      cancelAnimationFrame(rafRef.current[sessionKey]);
      delete rafRef.current[sessionKey];
    }
    if (finishResolversRef.current[sessionKey]) {
      const resolver = finishResolversRef.current[sessionKey];
      delete finishResolversRef.current[sessionKey];
      resolver();
    }
  }, []);

  /**
   * Mengosongkan data stream pada sesi tertentu.
   */
  const resetStream = useCallback((sessionKey) => {
    abortStream(sessionKey);
    rawStreamRef.current[sessionKey] = '';
    displayedStreamRef.current[sessionKey] = '';
    setStreamMap((prev) => ({ ...prev, [sessionKey]: '' }));
  }, [abortStream]);

  return {
    streamMap,
    appendToken,
    flushAndFinish,
    abortStream,
    resetStream,
  };
}

export default useTypewriterStream;

