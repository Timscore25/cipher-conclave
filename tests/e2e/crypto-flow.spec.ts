import { test, expect } from '@playwright/test';

test.describe('Create Device Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Enable debug mode for crypto logging
    await page.addInitScript(() => {
      window.localStorage.setItem('VITE_DEBUG_CRYPTO', 'true');
    });
    
    await page.goto('/');
  });

  test('should show validation errors for invalid input', async ({ page }) => {
    // Navigate to device creation (assuming we need to be logged in first)
    // This might need adjustment based on your auth flow
    
    // Try to create device with empty passphrase
    await page.fill('#passphrase', '');
    await page.fill('#confirm-passphrase', '');
    await page.click('button:has-text("Create Device")');
    
    await expect(page.locator('text=Passphrase must be at least')).toBeVisible();
  });

  test('should show error when passphrases do not match', async ({ page }) => {
    // Fill device form with mismatched passphrases
    await page.fill('#device-label', 'Test Device');
    await page.fill('#passphrase', 'validpassphrase123');
    await page.fill('#confirm-passphrase', 'differentpassphrase123');
    await page.click('button:has-text("Create Device")');
    
    await expect(page.locator('text=Passphrases do not match')).toBeVisible();
  });

  test('should successfully create device with valid input', async ({ page }) => {
    const deviceLabel = 'My Test Device';
    const passphrase = 'validpassphrase123';
    
    // Fill device creation form
    await page.fill('#device-label', deviceLabel);
    await page.click('button:has-text("Continue")');
    
    await page.fill('#passphrase', passphrase);
    await page.fill('#confirm-passphrase', passphrase);
    await page.click('button:has-text("Create Device")');
    
    // Wait for success state
    await expect(page.locator('text=Setup Complete!')).toBeVisible();
    await expect(page.locator('text=Your Key Fingerprint')).toBeVisible();
    
    // Should show a fingerprint
    const fingerprintElement = page.locator('[class*="font-mono"]').first();
    await expect(fingerprintElement).toBeVisible();
    const fingerprint = await fingerprintElement.textContent();
    expect(fingerprint).toBeTruthy();
    expect(fingerprint!.length).toBeGreaterThan(10);
  });

  test('should handle long passphrase gracefully', async ({ page }) => {
    const longPassphrase = 'a'.repeat(129); // Over 128 char limit
    
    await page.fill('#device-label', 'Test Device');
    await page.fill('#passphrase', longPassphrase);
    await page.fill('#confirm-passphrase', longPassphrase);
    await page.click('button:has-text("Create Device")');
    
    await expect(page.locator('text=Passphrase is too long')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Try with empty device label
    await page.fill('#device-label', '');
    await page.click('button:has-text("Continue")');
    // Should not advance to next step or show error
    
    await page.fill('#device-label', '   '); // Whitespace only
    await page.click('button:has-text("Continue")');
    
    await page.fill('#passphrase', 'validpassphrase123');
    await page.fill('#confirm-passphrase', 'validpassphrase123');
    await page.click('button:has-text("Create Device")');
    
    await expect(page.locator('text=Device label is required')).toBeVisible();
  });
});

test.describe('Device Unlock Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('VITE_DEBUG_CRYPTO', 'true');
    });
  });

  test('should show error with wrong passphrase', async ({ page, context }) => {
    // First create a device (this would be in a separate test setup)
    // For now, we'll assume a device exists and we're at unlock screen
    
    await page.goto('/unlock'); // Adjust based on your routing
    
    await page.fill('#passphrase', 'wrongpassphrase');
    await page.click('button:has-text("Unlock Device")');
    
    await expect(page.locator('text=Invalid passphrase')).toBeVisible();
  });

  test('should require passphrase input', async ({ page }) => {
    await page.goto('/unlock');
    
    // Button should be disabled when passphrase is empty
    const unlockButton = page.locator('button:has-text("Unlock Device")');
    await expect(unlockButton).toBeDisabled();
    
    // Fill passphrase
    await page.fill('#passphrase', 'somepassphrase123');
    await expect(unlockButton).toBeEnabled();
  });

  test('should display device fingerprint', async ({ page }) => {
    await page.goto('/unlock');
    
    // Should show device fingerprint section
    await expect(page.locator('text=Device Fingerprint')).toBeVisible();
    
    // Should show actual fingerprint (mocked or real)
    const fingerprintCode = page.locator('code').first();
    await expect(fingerprintCode).toBeVisible();
  });
});

test.describe('Error Handling & Recovery', () => {
  test('should handle crypto initialization errors gracefully', async ({ page }) => {
    // Mock crypto initialization failure
    await page.route('**/crypto-init', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Crypto initialization failed' })
      });
    });
    
    await page.goto('/');
    
    // Should show error message instead of crash
    // Adjust selector based on your error handling UI
    await expect(page.locator('text=initialization failed').or(page.locator('text=Failed to'))).toBeVisible();
  });

  test('should provide clear feedback during key generation', async ({ page }) => {
    await page.goto('/');
    
    // Fill form and submit
    await page.fill('#device-label', 'Test Device');
    await page.fill('#passphrase', 'validpassphrase123');
    await page.fill('#confirm-passphrase', 'validpassphrase123');
    
    // Click create and check loading state
    await page.click('button:has-text("Create Device")');
    await expect(page.locator('text=Generating Keys')).toBeVisible();
    
    // Should eventually complete (or timeout with clear error)
    await expect(page.locator('text=Setup Complete!').or(page.locator('text=Failed to'))).toBeVisible({ timeout: 30000 });
  });
});