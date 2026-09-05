/**
 * Panel samping untuk isi panjang.
 *
 * Tujuannya membaca kode/dokumen tanpa menggulir naik-turun di percakapan.
 * Karena itu yang diuji bukan sekadar "panel muncul", melainkan bahwa di layar
 * lebar percakapan TETAP terlihat di sebelahnya — kalau panel menutupi chat,
 * fiturnya tidak menyelesaikan masalah yang dimaksud.
 */
import { test, expect } from '@playwright/test';

async function bukaPanelKode(page) {
  await page.goto('/');
  const kotak = page.getByPlaceholder('Tanyakan sesuatu tentang SAP…');
  await kotak.fill('buatkan program abap');
  await kotak.press('Enter');
  await expect(page.locator('pre code').first()).toBeVisible({ timeout: 25_000 });
  await page.getByRole('button', { name: 'Buka kode di panel samping' }).first().click();
  await expect(page.locator('.app-side-panel')).toBeVisible();
}

test.describe('layar lebar', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('panel berdampingan dengan percakapan, bukan menutupinya', async ({ page }) => {
    await bukaPanelKode(page);

    const ukur = await page.evaluate(() => {
      const panel = document.querySelector('.app-side-panel').getBoundingClientRect();
      const chat = document.querySelector('.app-chat-scroll').getBoundingClientRect();
      return {
        panelKiri: Math.round(panel.left),
        panelLebar: Math.round(panel.width),
        chatKanan: Math.round(chat.right),
        chatLebar: Math.round(chat.width),
      };
    });

    expect(ukur.chatLebar, 'percakapan hilang saat panel dibuka').toBeGreaterThan(300);
    expect(ukur.panelLebar).toBeGreaterThan(300);
    expect(ukur.chatKanan, 'panel menutupi percakapan').toBeLessThanOrEqual(ukur.panelKiri + 1);
  });

  test('panel dapat ditutup dan percakapan kembali melebar', async ({ page }) => {
    await bukaPanelKode(page);
    const sempit = await page.evaluate(
      () => Math.round(document.querySelector('.app-chat-scroll').getBoundingClientRect().width));

    await page.getByRole('button', { name: 'Tutup panel' }).click();
    await expect(page.locator('.app-side-panel')).toHaveCount(0);

    const lebar = await page.evaluate(
      () => Math.round(document.querySelector('.app-chat-scroll').getBoundingClientRect().width));
    expect(lebar).toBeGreaterThan(sempit);
  });
});

test.describe('layar ponsel', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('panel tampil penuh, bukan dipaksa berbagi ruang', async ({ page }) => {
    await bukaPanelKode(page);

    const lebar = await page.evaluate(() => ({
      panel: Math.round(document.querySelector('.app-side-panel').getBoundingClientRect().width),
      layar: window.innerWidth,
    }));
    // Dua kolom di layar 390px membuat keduanya terlalu sempit untuk dibaca.
    expect(lebar.panel).toBe(lebar.layar);
  });

  test('tombol tutup panel tidak tertimpa status bar', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--sat', '47px');
      });
    });
    await bukaPanelKode(page);

    const atas = await page.evaluate(() => Math.round(
      document.querySelector('[aria-label="Tutup panel"]').getBoundingClientRect().top));
    expect(atas).toBeGreaterThanOrEqual(47);
  });
});
