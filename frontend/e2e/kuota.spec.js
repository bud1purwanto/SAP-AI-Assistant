/**
 * Pengaturan kuota token di Dashboard Admin.
 *
 * Yang diuji di sini adalah hal yang tidak terlihat dari tes backend: apakah
 * saklar dan kolom batas benar-benar sampai ke server dan bertahan setelah
 * halaman dimuat ulang. Angka yang berubah di layar tetapi tidak tersimpan
 * adalah kegagalan yang paling mudah lolos dari pemeriksaan manual.
 */
import { test, expect } from '@playwright/test';

const ADMIN = process.env.E2E_ADMIN_USER || 'TRSTDEV';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPass123';

const saklar = (page) => page.getByRole('button', { name: 'Penegakan batas token' });

async function masukSebagaiAdmin(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /login/i }).first().click();
  await page.getByPlaceholder('Masukkan username SAP').fill(ADMIN);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /masuk aplikasi/i }).click();
  await expect(page.locator('aside')).toContainText(ADMIN, { timeout: 15_000 });
}

async function bukaTabKuota(page) {
  await page.getByRole('button', { name: /admin dashboard/i }).first().click();
  await page.getByRole('button', { name: 'Kuota Token' }).click();
  await expect(page.getByRole('heading', { name: 'Kuota Token' })).toBeVisible();
  // Batas peran baru terisi setelah /api/admin/quota menjawab.
  await expect(page.locator('#harian-abaper')).toBeVisible({ timeout: 15_000 });
}

test('batas peran tersimpan di server, bukan hanya berubah di layar', async ({ page }) => {
  await masukSebagaiAdmin(page);
  await bukaTabKuota(page);

  // Contoh dari permintaan: batas ABAPer dinaikkan dari 1 juta ke 2 juta.
  await page.locator('#harian-abaper').fill('2000000');
  await page.getByRole('button', { name: 'Simpan batas abaper' }).click();
  await expect(page.getByText(/Batas peran 'abaper' tersimpan/)).toBeVisible();

  // Muat ulang penuh: nilai yang bertahan pasti datang dari server.
  await page.reload();
  await bukaTabKuota(page);
  await expect(page.locator('#harian-abaper')).toHaveValue('2000000');

  // Dikembalikan agar tes lain tidak mewarisi batas yang diubah.
  await page.locator('#harian-abaper').fill('1000000');
  await page.getByRole('button', { name: 'Simpan batas abaper' }).click();
  await expect(page.getByText(/Batas peran 'abaper' tersimpan/)).toBeVisible();
});

test('saklar pembatasan bertahan setelah halaman dimuat ulang', async ({ page }) => {
  await masukSebagaiAdmin(page);
  await bukaTabKuota(page);

  const semula = await saklar(page).getAttribute('aria-pressed');
  const sesudah = semula === 'true' ? 'false' : 'true';

  await saklar(page).click();
  await expect(saklar(page)).toHaveAttribute('aria-pressed', sesudah);

  await page.reload();
  await bukaTabKuota(page);
  await expect(saklar(page)).toHaveAttribute('aria-pressed', sesudah);

  // Kembalikan ke keadaan semula.
  await saklar(page).click();
  await expect(saklar(page)).toHaveAttribute('aria-pressed', semula);
});

test('sisa kuota tampil sebagai bilah di bilah atas ketika pembatasan menyala', async ({ page }) => {
  await masukSebagaiAdmin(page);
  await bukaTabKuota(page);

  const bilah = page.getByRole('progressbar', { name: 'Sisa kuota token hari ini' });

  // Peran superadmin bawaannya tanpa batas (0), jadi tidak ada sisa untuk
  // digambar. Batas sementara dipasang supaya bilahnya punya sesuatu untuk
  // ditampilkan, lalu dikembalikan di akhir.
  const saklarSemula = await saklar(page).getAttribute('aria-pressed');
  await page.locator('#harian-superadmin').fill('100000');
  await page.getByRole('button', { name: 'Simpan batas superadmin' }).click();
  await expect(page.getByText(/Batas peran 'superadmin' tersimpan/)).toBeVisible();
  if (saklarSemula !== 'true') await saklar(page).click();
  await expect(saklar(page)).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(bilah).toBeVisible({ timeout: 15_000 });

  // Belum ada pemakaian pada peran ini, jadi sisanya penuh.
  const persen = Number(await bilah.getAttribute('aria-valuenow'));
  expect(persen).toBeGreaterThan(90);
  expect(persen).toBeLessThanOrEqual(100);

  // Pembatasan dimatikan: tidak ada sisa yang bisa habis, bilahnya ikut hilang.
  await bukaTabKuota(page);
  await saklar(page).click();
  await expect(saklar(page)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(bilah).toHaveCount(0);

  // Kembalikan batas dan saklar ke keadaan semula.
  await bukaTabKuota(page);
  await page.locator('#harian-superadmin').fill('0');
  await page.getByRole('button', { name: 'Simpan batas superadmin' }).click();
  await expect(page.getByText(/Batas peran 'superadmin' tersimpan/)).toBeVisible();
  if (saklarSemula === 'true') await saklar(page).click();
});
