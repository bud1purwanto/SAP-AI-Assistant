/**
 * Input suara.
 *
 * Web Speech API menuntut dua hal di luar kendali aplikasi: peramban yang
 * menyediakannya, dan halaman yang berjalan pada secure context. Aplikasi yang
 * diakses lewat alamat IP dengan http:// biasa TIDAK memenuhi syarat kedua,
 * dan peramban menolak mikrofon tanpa dapat diakali dari sisi kode.
 *
 * Yang diuji di sini bukan pengenalan suaranya (itu milik peramban), melainkan
 * bahwa aplikasi menjelaskan sebabnya alih-alih diam saja saat tombol ditekan.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const tombolMik = (page) => page.getByRole('button', { name: /dikte suara|hentikan respon/i });

test('tombol suara tersedia bila peramban mendukung', async ({ page }) => {
  await page.goto('/');
  await expect(tombolMik(page)).toBeVisible();
});

test('menjelaskan bahwa mikrofon butuh HTTPS, bukan diam saja', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { get: () => false });
  });
  await page.goto('/');

  await tombolMik(page).click();
  await expect(page.getByRole('alert')).toContainText(/HTTPS/i);
});

test('menjelaskan bila peramban tidak menyediakan pengenalan suara', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await page.goto('/');

  await tombolMik(page).click();
  await expect(page.getByRole('alert')).toContainText(/tidak menyediakan pengenalan suara/i);
});

test('hasil bicara ditambahkan di belakang teks yang sudah diketik', async ({ page }) => {
  // Pengenal suara palsu: menirukan peramban tanpa memerlukan mikrofon nyata.
  await page.addInitScript(() => {
    class PengenalPalsu {
      start() {
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [Object.assign([{ transcript: 'cek stok material' }], { isFinal: true })],
          });
          this.onend?.();
        }, 100);
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = PengenalPalsu;
    window.webkitSpeechRecognition = PengenalPalsu;
  });
  await page.goto('/');

  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('Tolong');
  await tombolMik(page).click();

  await expect(kotak).toHaveValue('Tolong cek stok material', { timeout: 10_000 });
});
