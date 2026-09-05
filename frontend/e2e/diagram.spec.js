/**
 * Diagram Mermaid pada jawaban asisten.
 *
 * Pustaka mermaid diimpor secara dinamis, jadi yang diperiksa bukan hanya
 * "ada svg" melainkan bahwa chunk-nya benar-benar termuat dan tergambar di
 * dalam percakapan. Diagram juga tidak boleh membuat halaman melebar ke
 * samping — keluhan yang sudah pernah terjadi pada tabel.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

/**
 * Masuk lebih dulu. Sebagai tamu, kuota harian membuat hasil tes bergantung
 * pada urutan menjalankannya: permintaan ditolak 429 dan gejalanya menyerupai
 * diagram yang gagal digambar.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Buka menu percakapan' }).click();
  await page.getByRole('button', { name: /masuk akun/i }).click();
  await page.getByPlaceholder('Masukkan username SAP').fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();
  await expect(page.locator('aside')).toContainText(ADMIN, { timeout: 15_000 });
  // Tutup drawer: selama masih terbuka ia menutupi kotak pesan, sehingga
  // pengiriman tertunda dan pengukuran waktu menjadi tidak sahih.
  await page.getByRole('button', { name: 'Tutup menu' }).click();
  await expect(page.getByPlaceholder('Tanyakan sesuatu tentang SAP…')).toBeVisible();
});

test('blok mermaid digambar sebagai bagan, bukan kode', async ({ page }) => {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('tampilkan diagram alur procure to pay');
  await kotak.press('Enter');

  const svg = page.locator('.app-chat-scroll svg[id^="mermaid-"]');
  await expect(svg).toBeVisible({ timeout: 30_000 });

  // Penjelasan teks harus tetap ada; diagram melengkapi, bukan menggantikan.
  await expect(page.locator('.app-chat-scroll')).toContainText('EKKO');

  const ukuran = await page.evaluate(() => ({
    lebarHalaman: document.documentElement.scrollWidth,
    lebarLayar: window.innerWidth,
  }));
  expect(ukuran.lebarHalaman, 'diagram membuat halaman melebar ke samping')
    .toBeLessThanOrEqual(ukuran.lebarLayar);
});

test('diagram tidak digambar selagi jawaban masih ditulis', async ({ page }) => {
  // Fase "sedang ditulis" hanya berlangsung sekitar satu setengah detik.
  // Menunggunya dengan toBeVisible berarti berlomba dengan waktu: bila
  // pengiriman tertunda sedikit saja, pemeriksaan baru mulai setelah jawaban
  // selesai dan tes gagal tanpa ada yang rusak. Karena itu kemunculannya
  // DIREKAM lebih dulu, lalu diperiksa setelahnya.
  await page.evaluate(() => {
    window.__penandaMuncul = false;
    window.__galatDiagram = false;
    const periksa = () => {
      const teks = document.body.innerText || '';
      if (teks.includes('Menyiapkan diagram')) window.__penandaMuncul = true;
      if (teks.includes('Diagram tidak dapat ditampilkan')) window.__galatDiagram = true;
    };
    new MutationObserver(periksa).observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
  });

  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('tampilkan diagram alur procure to pay');
  await kotak.press('Enter');

  await expect(page.locator('.app-chat-scroll svg[id^="mermaid-"]')).toBeVisible({ timeout: 30_000 });

  const jejak = await page.evaluate(() => ({
    penanda: window.__penandaMuncul,
    galat: window.__galatDiagram,
  }));
  expect(jejak.penanda, 'penanda "menyiapkan diagram" tidak pernah muncul').toBe(true);
  expect(jejak.galat, 'diagram sempat menampilkan galat dari potongan yang belum utuh').toBe(false);
});

test('diagram tidak digambar ulang saat panel sumber data dibuka', async ({ page }) => {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('tampilkan diagram alur procure to pay');
  await kotak.press('Enter');
  await expect(page.locator('svg[id^="mermaid-"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const idAwal = await page.locator('svg[id^="mermaid-"]').getAttribute('id');

  // Tinggi wadah diagram direkam tiap frame selama panel dibuka. Bila
  // komponennya ter-mount ulang, tingginya menciut ke nol lalu tumbuh lagi —
  // isi di bawahnya ikut bergerak dan posisi baca pengguna meloncat.
  const hasil = await page.evaluate(async () => {
    const ukur = () => {
      const el = document.querySelector('svg[id^="mermaid-"]')?.closest('div[class*="rounded-2xl"]');
      return Math.round(el ? el.getBoundingClientRect().height : 0);
    };
    const sebelum = ukur();
    const tinggi = [];
    let jalan = true;
    const rekam = () => { tinggi.push(ukur()); if (jalan) requestAnimationFrame(rekam); };
    requestAnimationFrame(rekam);

    [...document.querySelectorAll('button')]
      .find((b) => /lihat sumber data/i.test(b.textContent || ''))
      .click();

    await new Promise((r) => setTimeout(r, 800));
    jalan = false;
    return { sebelum, minimum: Math.min(...tinggi) };
  });

  expect(hasil.sebelum).toBeGreaterThan(100);
  expect(hasil.minimum, 'diagram menciut lalu digambar ulang').toBe(hasil.sebelum);

  // Id yang berubah menandakan komponennya benar-benar dibuat ulang.
  expect(await page.locator('svg[id^="mermaid-"]').getAttribute('id')).toBe(idAwal);
});

test('membuka percakapan berdiagram tetap mendarat di pesan terakhir', async ({ page }) => {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');

  // Percakapan harus lebih tinggi daripada layar, dan diakhiri diagram —
  // diagram digambar beberapa saat setelah pesan tampil, menambah ratusan
  // piksel sesudah layar terlanjur digulir ke dasar yang lama.
  for (const t of ['pertanyaan pertama', 'pertanyaan kedua', 'tampilkan diagram alur procure to pay']) {
    await kotak.fill(t);
    await kotak.press('Enter');
    await page.waitForTimeout(2500);
  }
  await expect(page.locator('svg[id^="mermaid-"]')).toBeVisible({ timeout: 30_000 });

  // Muat ulang agar simpanan diagram di memori terhapus: inilah kondisi
  // pengguna yang baru membuka aplikasi lalu memilih percakapan lama.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Buka menu percakapan' }).click();
  await page.locator('nav button', { hasText: 'pertanyaan pertama' }).first().click();
  await expect(page.locator('svg[id^="mermaid-"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  const sisa = await page.evaluate(() => {
    const el = document.querySelector('.app-chat-scroll');
    return Math.round(el.scrollHeight - el.scrollTop - el.clientHeight);
  });
  expect(sisa, 'pesan terakhir berada di bawah layar setelah diagram digambar')
    .toBeLessThan(80);
});
