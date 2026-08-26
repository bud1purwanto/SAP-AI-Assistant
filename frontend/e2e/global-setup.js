import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from '../src/lib/i18n.js';

/**
 * Bahasa antarmuka menentukan setiap teks yang dicari tes ini (placeholder,
 * nama tombol, judul). Sejak dukungan multibahasa masuk, bawaan aplikasi
 * menjadi Inggris sementara seluruh spec ditulis dengan teks Indonesia —
 * akibatnya semua tes gagal pada langkah login dan job CI berjalan 44 menit
 * sampai kehabisan waktu.
 *
 * Alih-alih menyalin ulang ratusan selector, sesi tes dimulai dengan
 * localStorage yang sudah menyimpan pilihan bahasa Indonesia. Tes menguji
 * perilaku aplikasi, bukan bahasa bawaannya.
 */
export const E2E_LANGUAGE = process.env.E2E_LANGUAGE || 'id';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_STATE = path.join(here, '.auth', 'storage-state.json');

export default async function globalSetup(config) {
  // baseURL berbeda antara mesin lokal dan CI; localStorage terikat origin,
  // jadi nilainya diambil dari konfigurasi yang benar-benar dipakai.
  const baseURL =
    config.projects[0]?.use?.baseURL || 'http://127.0.0.1:4173';

  const state = {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          { name: LANGUAGE_STORAGE_KEY, value: E2E_LANGUAGE },
        ],
      },
    ],
  };

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  fs.writeFileSync(STORAGE_STATE, JSON.stringify(state, null, 2));

  if (E2E_LANGUAGE === DEFAULT_LANGUAGE) {
    console.log(`ℹ Bahasa tes sama dengan bawaan aplikasi (${E2E_LANGUAGE}).`);
  }
}
