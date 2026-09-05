/**
 * Modal di layar ponsel: kepala modal harus tetap dapat dijangkau.
 *
 * Di PWA iOS, `inset-0` dan satuan `vh` mencakup area status bar. Modal yang
 * dipusatkan dengan `items-center` lalu isinya lebih tinggi daripada ruang yang
 * tersedia akan meluber ke ATAS dan ke bawah sekaligus — judul dan tombol tutup
 * terdorong ke balik jam serta ikon baterai, sehingga pengguna tidak bisa
 * keluar dari modal itu. Ini pernah terjadi pada Dashboard Admin dan Pengaturan.
 *
 * Chromium melaporkan safe-area 0 karena tidak punya notch, jadi nilainya
 * disuntikkan lewat variabel --sat/--sab yang memang dipakai gaya aplikasi.
 */
import { test, expect } from '@playwright/test';

const STATUS_BAR = 47;   // iPhone dengan notch, mode standalone
const HOME_BAR = 34;

test.use({ viewport: { width: 375, height: 560 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.setProperty('--sat', d.sat + 'px');
      document.documentElement.style.setProperty('--sab', d.sab + 'px');
      document.documentElement.classList.add('is-pwa-standalone');
    });
  }, { sat: STATUS_BAR, sab: HOME_BAR });
  await page.goto('/');
});

/** Posisi tepi atas sebuah elemen terhadap layar. */
async function tepiAtas(page, selector) {
  return page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().top));
}

test('tombol tutup Pengaturan tidak tertimpa status bar', async ({ page }) => {
  await page.getByRole('button', { name: 'Buka pengaturan' }).last().click();

  const tombol = page.getByRole('button', { name: 'Tutup Pengaturan' });
  await expect(tombol).toBeVisible();

  const atas = await tepiAtas(page, '[aria-label="Tutup Pengaturan"]');
  expect(atas, 'tombol tutup berada di balik status bar').toBeGreaterThanOrEqual(STATUS_BAR);

  // Yang menentukan bukan hanya posisinya: tombolnya harus benar-benar bekerja.
  await tombol.click();
  await expect(page.locator('[aria-label="Tutup Pengaturan"]')).toHaveCount(0);
});

test('panel Pengaturan tetap di dalam layar, tidak meluber ke atas', async ({ page }) => {
  await page.getByRole('button', { name: 'Buka pengaturan' }).last().click();
  await expect(page.locator('.modal-panel')).toBeVisible();

  const kotak = await page.locator('.modal-panel').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { atas: Math.round(r.top), bawah: Math.round(r.bottom), layar: window.innerHeight };
  });

  expect(kotak.atas, 'panel meluber ke atas layar').toBeGreaterThanOrEqual(STATUS_BAR);
  expect(kotak.bawah, 'panel meluber ke bawah layar').toBeLessThanOrEqual(kotak.layar - HOME_BAR);
});
