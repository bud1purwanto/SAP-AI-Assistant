# 🌐 Panduan Standar Multibahasa (Multilanguage Guidelines)

Dokumen ini mendefinisikan aturan dan standar wajib dalam pengembangan antarmuka dan fitur baru pada proyek **SAP AI Assistant**.

---

## 📌 Aturan Wajib (Mandatory Rule)

> [!IMPORTANT]
> **Setiap fitur, komponen UI, pesan validasi, tooltip, notifikasi, dan artefak baru yang dibangun WAJIB mendukung multibahasa (Minimal: Bahasa Indonesia `id` dan Bahasa Inggris `en`).**
> Dilarang keras meng-*hardcode* string antarmuka langsung di dalam komponen tanpa mendaftarkannya pada kamus `i18n`.

---

## 📂 Struktur & File Terkait

1. **Kamus Terjemahan**: `frontend/src/lib/i18n.js`
   - Menyimpan seluruh *dictionary* teks untuk bahasa yang didukung (`SUPPORTED_LANGUAGES`).
   - Default bahasa sistem: `id` (Bahasa Indonesia).
2. **Hook & Provider**: `frontend/src/hooks/useLanguage.js`
   - Menyediakan fungsi `t(key, params)` untuk mengambil teks terjemahan.
   - Menyediakan `language`, `setLanguage`, dan `languages`.

---

## 🛠️ Cara Menggunakan Saat Membangun Fitur Baru

### 1. Daftarkan Kunci Teks di `frontend/src/lib/i18n.js`

Tambahkan pasangan kunci untuk `id` dan `en`:

```javascript
export const TRANSLATIONS = {
  id: {
    'myFeature.title': 'Judul Fitur Baru',
    'myFeature.desc': 'Deskripsi dengan parameter {count} item.',
  },
  en: {
    'myFeature.title': 'New Feature Title',
    'myFeature.desc': 'Description with parameter {count} items.',
  },
};
```

### 2. Gunakan di Komponen React via `useLanguage()`

```jsx
import React from 'react';
import { useLanguage } from '../hooks/useLanguage';

const MyNewComponent = () => {
  const { t, language } = useLanguage();

  return (
    <div>
      <h2>{t('myFeature.title')}</h2>
      <p>{t('myFeature.desc', { count: 10 })}</p>
    </div>
  );
};

export default MyNewComponent;
```

---

## 🤖 Standar untuk Respons AI (Backend & Prompts)

1. **Deteksi Bahasa Prompt Pengguna**:
   - Backend asisten SAP secara cerdas merespons dalam bahasa yang digunakan oleh pengguna saat bertanya (misal: jika pengguna bertanya dalam Bahasa Inggris, AI merespons dalam Bahasa Inggris).
2. **Konsistensi Format Dokumen (Artifact)**:
   - Template Word/Excel/WRICEF dan label bagan Mermaid menyesuaikan dengan konteks bahasa yang sedang aktif atau diminta.

---

## ✅ Checklist Verifikasi Fitur Baru

Sebelum mengajukan perubahan atau merge fitur baru, pastikan:
- [ ] Semua teks tombol, judul, placeholder, dan modal menggunakan `t('...')`.
- [ ] Kunci terjemahan tersedia lengkap di `id` dan `en` pada `frontend/src/lib/i18n.js`.
- [ ] Tidak ada teks antarmuka yang di-*hardcode* permanen dalam satu bahasa saja.
- [ ] Format angka dan tanggal menggunakan locale aktif (`id-ID` atau `en-US`).

