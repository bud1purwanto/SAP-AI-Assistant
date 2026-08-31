/**
 * Alur chat dari sisi pengguna.
 *
 * Tes ini ada karena dua bug nyata lolos dari 90 tes backend dan dari pembacaan
 * kode: edit pertanyaan tidak menghapus pertukaran lama (state React yang basi),
 * dan buat ulang menyimpan pertanyaan dua kali di database (riwayat dipotong
 * dari titik yang salah). Keduanya hanya terlihat ketika aplikasi benar-benar
 * dijalankan, jadi pemeriksaannya harus di lapisan ini.
 */
import { test, expect } from '@playwright/test';

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /masuk akun/i }).first().click();
  await page.getByPlaceholder('Masukkan username SAP').fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  // Tombol dipilih lewat namanya: form chat juga memiliki button[type=submit],
  // sehingga pemilihan berdasarkan tipe dapat menekan tombol yang keliru dan
  // membuat tes berjalan dalam mode tamu tanpa terlihat.
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();
  // Kotak chat sudah tampil sejak mode tamu, jadi yang dipastikan adalah
  // identitas penggunanya benar-benar berganti.
  await expect(page.locator('aside')).toContainText(ADMIN, { timeout: 15_000 });
}

async function kirim(page, teks) {
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill(teks);
  await kotak.press('Enter');
}

/** Menunggu sampai jawaban selesai: tombol aksinya baru muncul setelah itu. */
async function tungguJawabanSelesai(page) {
  await expect(page.getByRole('button', { name: 'Buat ulang jawaban' })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Menunggu jawaban PENGGANTI setelah edit atau buat ulang.
 *
 * Tidak cukup menunggu tombol aksi terlihat: tombol milik jawaban lama masih
 * terpasang beberapa saat setelah diklik, sehingga penantian itu langsung
 * selesai dan langkah berikutnya berjalan selagi permintaannya masih terbang.
 * Jawaban lama harus benar-benar hilang lebih dulu.
 */
async function tungguJawabanPengganti(page) {
  await expect(page.getByRole('button', { name: 'Buat ulang jawaban' })).toHaveCount(0, {
    timeout: 15_000,
  });
  await tungguJawabanSelesai(page);
}

const jumlahJawaban = (page) => page.getByText('Asisten SAP').count();
/** Label "Anda" hanya muncul sekali per pesan pengguna. */
const jumlahPertanyaan = (page) => page.locator('span', { hasText: /^Anda$/ }).count();

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('jawaban muncul bertahap, bukan sekaligus di akhir', async ({ page }) => {
  await kirim(page, 'uji streaming bertahap');

  const area = page.locator('.app-chat-scroll');
  const panjang = [];
  for (let i = 0; i < 5; i += 1) {
    await page.waitForTimeout(200);
    panjang.push((await area.innerText()).length);
  }

  // Bila teks hanya muncul sekaligus di akhir, seluruh sampel akan sama panjang.
  expect(panjang.some((n, i) => i > 0 && n > panjang[i - 1])).toBe(true);
  await tungguJawabanSelesai(page);
});

test('edit pertanyaan menggantikan pertukaran lama, bukan menambah', async ({ page }) => {
  await kirim(page, 'stok material ABC');
  await tungguJawabanSelesai(page);

  await page.getByRole('button', { name: 'Ubah pertanyaan ini' }).first().click();
  await page.getByLabel('Ubah pertanyaan').fill('stok material XYZ');
  await page.getByRole('button', { name: 'Kirim ulang' }).click();
  await tungguJawabanPengganti(page);

  const isi = await page.locator('.app-chat-scroll').innerText();
  expect(isi).toContain('stok material XYZ');
  expect(isi).not.toContain('ABC');
  expect(await jumlahJawaban(page)).toBe(1);
  expect(await jumlahPertanyaan(page)).toBe(1);
});

test('buat ulang mengganti jawaban tanpa menggandakan pertanyaan', async ({ page }) => {
  await kirim(page, 'pertanyaan untuk dibuat ulang');
  await tungguJawabanSelesai(page);

  await page.getByRole('button', { name: 'Buat ulang jawaban' }).first().click();
  await tungguJawabanPengganti(page);

  expect(await jumlahJawaban(page)).toBe(1);
  // Pertanyaannya sempat tersimpan dua kali karena riwayat dipotong dari
  // jawabannya, bukan dari pertanyaannya.
  expect(await jumlahPertanyaan(page)).toBe(1);

  // Muat ulang halaman membuktikan keadaan di database, bukan hanya di layar.
  // Setelah reload aplikasi selalu membuka Chat Baru, jadi sesinya dipilih dulu
  // dari sidebar — isinya kemudian datang dari server, bukan dari state lama.
  await page.reload();
  await page.locator('nav button', { hasText: 'pertanyaan untuk dibuat ulang' }).first().click();
  await expect(page.getByText('Asisten SAP')).toBeVisible({ timeout: 15_000 });
  expect(await jumlahJawaban(page)).toBe(1);
  expect(await jumlahPertanyaan(page)).toBe(1);
});

test('riwayat dapat dicari dan sesi yang dipakai lagi naik ke urutan teratas', async ({ page }) => {
  await kirim(page, 'kontrak vendor ACME untuk pengujian');
  await tungguJawabanSelesai(page);

  const cari = page.getByPlaceholder('Cari percakapan…');
  await cari.fill('ACME');
  await expect(page.locator('nav')).toContainText('ACME', { timeout: 15_000 });
  await cari.fill('');

  // Percakapan baru menggeser yang tadi ke bawah…
  await page.getByRole('button', { name: /percakapan baru/i }).click();
  await kirim(page, 'percakapan yang lebih baru');
  await tungguJawabanSelesai(page);
  await expect(page.locator('nav button').first()).toContainText('percakapan yang lebih baru');

  // …dan melanjutkan percakapan lama harus mengembalikannya ke paling atas.
  await page.locator('nav button', { hasText: 'kontrak vendor ACME' }).first().click();
  await expect(page.getByText('Asisten SAP')).toBeVisible({ timeout: 15_000 });
  await kirim(page, 'lanjutan percakapan lama');
  await tungguJawabanSelesai(page);
  await expect(page.locator('nav button').first()).toContainText('kontrak vendor ACME');
});
