import { defineConfig, devices } from '@playwright/test';

import { STORAGE_STATE } from './e2e/global-setup.js';

/**
 * Tes end-to-end berjalan terhadap aplikasi yang benar-benar dijalankan:
 * Vite preview di 4173 dan backend di 8000 (lihat scripts/e2e.sh).
 *
 * Backend sengaja tidak dinyalakan lewat `webServer` di sini karena ia perlu
 * PostgreSQL yang sudah siap lebih dulu; skrip pembungkusnya yang mengatur urutan.
 */
export default defineConfig({
  testDir: './e2e',
  // Menyiapkan localStorage berisi pilihan bahasa sebelum tes pertama jalan.
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    // Seluruh spec mencari teks berbahasa Indonesia, sedangkan bawaan aplikasi
    // adalah Inggris. State ini menyetel bahasa sebelum halaman pertama dimuat.
    storageState: STORAGE_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // `channel: 'chromium'` memakai Chromium utuh, bukan varian
        // chrome-headless-shell yang perlu diunduh terpisah.
        channel: 'chromium',
        // Lingkungan yang sudah menyediakan Chromium sendiri cukup menunjuknya
        // lewat PLAYWRIGHT_CHROMIUM_PATH alih-alih mengunduh ulang.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
