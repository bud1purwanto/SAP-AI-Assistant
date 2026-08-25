import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Input suara memakai Web Speech API bawaan peramban.
 *
 * Dua syarat harus terpenuhi, dan keduanya di luar kendali aplikasi:
 *
 * 1. Peramban menyediakan SpeechRecognition (Safari & Chrome: ya; Firefox: tidak).
 * 2. Halaman berjalan pada SECURE CONTEXT — HTTPS, atau localhost.
 *
 * Syarat kedua yang paling sering menggagalkan: aplikasi yang diakses lewat
 * alamat IP di jaringan lokal dengan http:// biasa BUKAN secure context,
 * sehingga mikrofon ditolak peramban tanpa dapat diakali dari sisi kode.
 * Karena itu alasannya dilaporkan apa adanya ke antarmuka, bukan disembunyikan
 * di balik tombol yang diam saja saat ditekan.
 */

export const ALASAN = {
  SIAP: 'siap',
  TIDAK_DIDUKUNG: 'tidak-didukung',
  BUTUH_HTTPS: 'butuh-https',
};

function kelasPengenal() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function periksaDukungan() {
  if (!kelasPengenal()) return ALASAN.TIDAK_DIDUKUNG;
  if (!window.isSecureContext) return ALASAN.BUTUH_HTTPS;
  return ALASAN.SIAP;
}

export function useVoiceInput({ onTeks, bahasa = 'id-ID' } = {}) {
  const [mendengar, setMendengar] = useState(false);
  const [galat, setGalat] = useState('');
  const pengenalRef = useRef(null);
  const onTeksRef = useRef(onTeks);
  onTeksRef.current = onTeks;

  const dukungan = periksaDukungan();

  const berhenti = useCallback(() => {
    try {
      pengenalRef.current?.stop();
    } catch {
      /* sudah berhenti sendiri */
    }
    setMendengar(false);
  }, []);

  const mulai = useCallback(() => {
    const Pengenal = kelasPengenal();
    if (!Pengenal || !window.isSecureContext) return;

    setGalat('');
    const pengenal = new Pengenal();
    pengenal.lang = bahasa;
    pengenal.continuous = false;
    // Hasil sementara dikirim agar teksnya terlihat tumbuh saat berbicara,
    // bukan muncul sekaligus setelah selesai.
    pengenal.interimResults = true;

    let terakhirFinal = '';

    pengenal.onresult = (e) => {
      let sementara = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const teks = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += teks;
        else sementara += teks;
      }
      if (final) terakhirFinal += final;
      onTeksRef.current?.(terakhirFinal + sementara, Boolean(final));
    };

    pengenal.onerror = (e) => {
      const kode = e.error || '';
      if (kode === 'not-allowed' || kode === 'service-not-allowed') {
        setGalat('Izin mikrofon ditolak. Aktifkan lewat pengaturan peramban.');
      } else if (kode === 'no-speech') {
        setGalat('Tidak ada suara yang terdengar.');
      } else if (kode === 'network') {
        setGalat('Pengenalan suara membutuhkan koneksi internet.');
      } else if (kode !== 'aborted') {
        setGalat('Pengenalan suara gagal. Coba lagi.');
      }
      setMendengar(false);
    };

    pengenal.onend = () => setMendengar(false);

    pengenalRef.current = pengenal;
    try {
      pengenal.start();
      setMendengar(true);
    } catch {
      setGalat('Pengenalan suara tidak dapat dimulai.');
      setMendengar(false);
    }
  }, [bahasa]);

  // Meninggalkan halaman selagi mikrofon aktif akan membiarkannya menyala.
  useEffect(() => () => {
    try {
      pengenalRef.current?.abort();
    } catch {
      /* tidak apa-apa */
    }
  }, []);

  return { dukungan, mendengar, galat, mulai, berhenti, setGalat };
}

export default useVoiceInput;
