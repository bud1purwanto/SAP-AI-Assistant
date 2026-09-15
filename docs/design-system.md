# Design System SAP AI Assistant

> Acuan UI yang mengikuti implementasi saat ini di `frontend/src/index.css`. Gunakan token semantik agar light/dark/system theme tetap konsisten.

## 1. Prinsip

- Enterprise, tenang, padat informasi, dan mudah dipindai.
- Mobile-first; seluruh alur utama harus dapat diselesaikan tanpa overflow horizontal halaman.
- Warna menyatakan peran (`surface`, `content`, `accent`), bukan nama warna spesifik.
- Konten SAP/data boleh padat, tetapi action utama dan status harus tetap jelas.
- Bahasa Indonesia dan English memiliki prioritas setara; layout harus tahan ekspansi teks.
- Semua state interaktif memiliki feedback visual, keyboard focus, dan label aksesibel.

## 2. Fondasi Visual

Font stack:

```css
'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

Gunakan font monospace bawaan platform untuk kode ABAP, SQL, JSON, ID teknis, dan output terminal.

### Token Warna

| Peran | Light | Dark | Tailwind semantic utility |
|---|---:|---:|---|
| Surface | `#f8fafc` | `#09090b` | `bg-surface` |
| Raised surface | `#ffffff` | `#18181b` | `bg-surface-raised` |
| Sunken surface | `#f1f5f9` | `#131316` | `bg-surface-sunken` |
| Hover surface | `#e9eef5` | `#27272a` | `bg-surface-hover` |
| Line | `#e2e8f0` | `#27272a` | `border-line` |
| Strong line | `#cbd5e1` | `#3f3f46` | `border-line-strong` |
| Primary content | `#0f172a` | `#fafafa` | `text-content` |
| Secondary content | `#334155` | `#d4d4d8` | `text-content-secondary` |
| Muted content | `#64748b` | `#a1a1aa` | `text-content-muted` |
| Accent | `#4f46e5` | `#818cf8` | `bg-accent`, `text-accent` |
| Danger | `#e11d48` | `#fb7185` | `text-danger`, `bg-danger-soft` |
| Warning | `#d97706` | `#fbbf24` | `text-warning`, `bg-warning-soft` |
| Success | `#059669` | `#34d399` | `text-success` |

Jangan menambahkan warna literal di JSX bila token yang sesuai sudah tersedia. Warna literal hanya layak untuk data visualization palette, syntax highlighting, atau kebutuhan teknis khusus yang terdokumentasi.

### Syntax ABAP

| Token | Light | Dark |
|---|---:|---:|
| Keyword | `#00007f` | `#569cd6` |
| Comment | `#3f7f5f` | `#6a9955` |
| String | `#2a00ff` | `#ce9178` |
| Number | `#1e293b` | `#b5cea8` |

## 3. Spacing, Radius, dan Elevation

Gunakan skala Tailwind. Pola yang direkomendasikan:

- Gap rapat: `gap-1`/`gap-2` untuk ikon dan label.
- Gap komponen: `gap-3`/`gap-4`.
- Section: `p-4` pada mobile, `sm:p-6` pada layar lebih besar.
- Control: tinggi minimum nyaman sentuh sekitar 40–44 px.
- Radius control: `rounded-lg`; card/modal: `rounded-xl` atau `rounded-2xl`.
- Border tipis semantic lebih disukai daripada shadow berat.
- Modal boleh memakai shadow kuat untuk memisahkan layer, dengan backdrop yang konsisten.

## 4. Tipografi

| Peran | Rekomendasi |
|---|---|
| Page/modal title | `text-lg sm:text-xl font-semibold` |
| Section title | `text-sm sm:text-base font-semibold` |
| Body | `text-sm` atau `text-base` sesuai kepadatan |
| Supporting/meta | `text-xs text-content-muted` |
| Button | `text-sm font-medium` |
| Code/data | monospace, ukuran cukup, scroll pada container khusus |

Hindari uppercase panjang. Label status singkat boleh uppercase bila kontras dan tracking tetap terbaca.

## 5. Layout Responsif

Breakpoint custom `xs` adalah `30rem`; breakpoint Tailwind standar `sm`, `md`, dan `lg` tetap digunakan.

- Mobile menjadi baseline; tambahkan peningkatan layout dengan `sm:`/`md:`/`lg:`.
- Body aplikasi dikunci ke viewport dinamis melalui `--app-height` dan `100dvh`.
- Hormati safe-area iOS: `--sat`, `--sar`, `--sab`, `--sal`.
- Sidebar/panel menjadi drawer di mobile dan panel tetap bila ruang desktop cukup.
- Tabel data menggunakan container scroll horizontal sendiri; halaman tidak boleh ikut melebar.
- Modal di mobile harus menyisakan margin, memiliki `max-height`, dan area konten yang dapat discroll.
- Uji portrait, compact landscape, desktop, keyboard virtual, dan teks English/Indonesia yang panjang.

## 6. Komponen dan State

### Button

- Primary: accent background + accent foreground.
- Secondary: raised/sunken background + semantic border.
- Ghost: transparan, hover memakai `surface-hover`.
- Destructive: danger; gunakan hanya untuk tindakan benar-benar destruktif.
- Semua variant: default, hover, focus-visible, active, disabled, dan loading.

### Form

- Label selalu terlihat; placeholder bukan pengganti label.
- Error ditempatkan dekat field dan tersedia dalam `id`/`en`.
- Secret ditampilkan sebagai password/masked value.
- Submit disabled saat invalid atau request berlangsung untuk mencegah duplikasi.

### Card dan Panel

- Gunakan raised surface, semantic border, dan hierarchy judul–isi–action.
- Jangan membuat seluruh card clickable bila card juga berisi action lain.
- Status konektor/mode/role menggunakan label teks selain warna.

### Modal

- Memiliki judul, tombol close berlabel, fokus awal, Escape/close yang aman, dan confirm khusus bila destructive.
- Full-screen hanya bila dibutuhkan di mobile; desktop memakai lebar maksimum sesuai isi.

### Chat Content

- Markdown mendukung GFM, matematika KaTeX, code block, source, diagram Mermaid, dan tabel.
- Code/table/diagram memiliki overflow container mandiri dan action copy/expand bila relevan.
- Progress streaming membedakan connecting, reading, reasoning, tool, building, reviewing, dan done.
- Sources dan usage adalah metadata; tampilkan tanpa mengalahkan jawaban utama.

## 7. Data Visualization

Palette chart saat ini: sky, emerald, amber, violet, pink, cyan, orange, indigo, teal, lime. Aturan:

- Jangan mengandalkan warna saja; tampilkan label/legend/value.
- ID dokumen, nomor SAP, tanggal, rekening, dan kode tidak boleh diperlakukan sebagai nilai numerik chart.
- Table adalah fallback utama untuk data yang tidak cocok divisualisasikan.
- Format angka/tanggal mengikuti locale aktif (`id-ID` atau `en-US`).
- Mermaid harus menyediakan source fallback bila visual gagal dirender.

## 8. Ikon dan Copy

- Gunakan `lucide-react`; jangan mencampur keluarga ikon tanpa alasan.
- Ukuran ikon mengikuti control dan selalu konsisten dalam satu kelompok.
- Icon-only button wajib memiliki `aria-label` terjemahan.
- Pertahankan copy dan istilah produk yang sudah ada, termasuk kata “Enterprise”, kecuali pengguna meminta perubahan.
- Semua UI copy baru harus masuk `frontend/src/lib/i18n.js` untuk `id` dan `en`, lalu dipanggil melalui `useLanguage()`/`t()`.

## 9. Accessibility Checklist

- [ ] Seluruh fungsi dapat dipakai dengan keyboard.
- [ ] Focus ring terlihat dengan `focus-visible`.
- [ ] Icon-only action memiliki accessible name.
- [ ] Input memiliki label yang terhubung.
- [ ] Error/status penting tidak disampaikan dengan warna saja.
- [ ] Kontras diuji pada light dan dark theme.
- [ ] Dialog memiliki nama, urutan fokus, dan close behavior yang jelas.
- [ ] Animasi/progress tidak menghalangi pembaca layar.
- [ ] Touch target memadai dan tidak terlalu rapat.
- [ ] Zoom browser tidak memotong action penting.

## 10. Definition of Done UI

- Tampilan lulus pada mobile dan desktop tanpa overflow halaman.
- Light, dark, dan system theme konsisten.
- Semua string baru tersedia dalam Bahasa Indonesia dan English.
- Loading, empty, error, disabled, dan success state ditangani.
- Tidak ada perubahan copy existing yang tidak diminta.
- `npm run lint`, build, unit test relevan, dan Playwright relevan berhasil.

