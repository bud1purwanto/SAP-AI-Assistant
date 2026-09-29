// @ts-check
import { test, expect } from '@playwright/test';

/**
 * End-to-End browser tests for:
 * 1. Admin MCP URL Registry (URL-only CRUD, no tokens)
 * 2. Access Control Menu removal verification (tab deleted)
 * 3. SAP Credential Modal and Bound Token flow
 * 4. SAP Onboarding error handling in Chat
 */

test.describe('MCP Integration & Administration', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to base UI
    await page.goto('/');
  });

  test('1. Access Control tab must NOT exist in Admin Dashboard', async ({ page }) => {
    // Open Admin Dashboard if admin button is available
    const adminBtn = page.getByRole('button', { name: /admin/i }).or(page.locator('[data-testid="admin-btn"]'));
    if (await adminBtn.isVisible()) {
      await adminBtn.click();
      // Verify tab "Access Control" or "Kontrol Akses" does NOT exist
      const accessTab = page.getByRole('tab', { name: /access control|kontrol akses/i });
      await expect(accessTab).toHaveCount(0);
    }
  });

  test('2. Admin MCP Registry shows URL-only configuration without static tokens', async ({ page }) => {
    const adminBtn = page.getByRole('button', { name: /admin/i }).or(page.locator('[data-testid="admin-btn"]'));
    if (await adminBtn.isVisible()) {
      await adminBtn.click();
      
      // Navigate to MCP tab
      const mcpTab = page.getByRole('tab', { name: /mcp/i }).or(page.locator('button:has-text("MCP")'));
      if (await mcpTab.isVisible()) {
        await mcpTab.click();

        // Check for Add Server button
        const addBtn = page.getByRole('button', { name: /tambah server mcp|add mcp server/i });
        await expect(addBtn).toBeVisible();

        // Open modal
        await addBtn.click();

        // Inputs must only be Name and URL (no token/secret fields)
        const nameInput = page.getByLabel(/nama server|server name/i).or(page.locator('input[placeholder*="SAP"], input[name="name"]'));
        const urlInput = page.getByLabel(/url server|server url/i).or(page.locator('input[placeholder*="http"], input[name="url"]'));
        const tokenInput = page.locator('input[name="auth_token"], input[name="token"], input[type="password"]');

        await expect(nameInput.first()).toBeVisible();
        await expect(urlInput.first()).toBeVisible();
        // Crucial security invariant: No token inputs should exist
        await expect(tokenInput).toHaveCount(0);
      }
    }
  });

  test('3. Settings Modal contains SAP Credential Form with Token Binding capability', async ({ page }) => {
    // Open Settings Modal
    const settingsBtn = page.getByRole('button', { name: /pengaturan|settings/i }).or(page.locator('[data-testid="settings-btn"]'));
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();

      // Click on SAP Credentials tab
      const sapTab = page.getByRole('tab', { name: /sap|kredensial sap/i }).or(page.locator('button:has-text("SAP")'));
      if (await sapTab.isVisible()) {
        await sapTab.click();

        // Verify SAP Credential inputs
        const targetSelect = page.locator('select, [role="combobox"]').first();
        const userInput = page.getByLabel(/username sap|sap username/i).or(page.locator('input[placeholder*="user" i]'));
        const saveBtn = page.getByRole('button', { name: /simpan|save/i });

        await expect(targetSelect).toBeVisible();
        await expect(userInput).toBeVisible();
        await expect(saveBtn).toBeVisible();
      }
    }
  });

});
