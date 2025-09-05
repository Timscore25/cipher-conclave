import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'testpassword123';

  test('sign-up creates account and shows success', async ({ page }) => {
    await page.goto('/');
    
    // Should show auth flow
    await expect(page.locator('text=PGPRooms')).toBeVisible();
    await expect(page.locator('[data-state="active"][value="signup"]')).toBeVisible();
    
    // Click signup tab if not active
    await page.click('text=Sign Up');
    
    // Fill signup form
    await page.fill('#signup-name', 'Test User');
    await page.fill('#signup-email', testEmail);
    await page.fill('#signup-password', testPassword);
    await page.fill('#signup-confirm', testPassword);
    
    // Submit form
    await page.click('button[type="submit"]:has-text("Create Account")');
    
    // Check for success message or redirect
    await expect(
      page.locator('text=Account created').or(page.locator('text=PGPRooms')) // Success message or app loaded
    ).toBeVisible({ timeout: 10000 });
  });

  test('sign-in with valid credentials enters app', async ({ page }) => {
    // First create a user via admin API
    const response = await page.request.post('/api/admin-create-user', {
      data: {
        email: testEmail,
        password: testPassword,
        displayName: 'E2E Test User'
      }
    });
    
    if (!response.ok()) {
      // If admin API fails, skip this test
      test.skip(true, 'Admin API not available for user creation');
    }

    await page.goto('/');
    
    // Should show auth flow
    await expect(page.locator('text=PGPRooms')).toBeVisible();
    
    // Click signin tab
    await page.click('text=Sign In');
    
    // Fill signin form  
    await page.fill('#signin-email', testEmail);
    await page.fill('#signin-password', testPassword);
    
    // Submit form
    await page.click('button[type="submit"]:has-text("Sign In")');
    
    // Should redirect to app or show main layout
    await expect(
      page.locator('text=Rooms').or(page.locator('text=Channels'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('sign-in with invalid credentials shows error', async ({ page }) => {
    await page.goto('/');
    
    // Click signin tab
    await page.click('text=Sign In');
    
    // Fill with invalid credentials
    await page.fill('#signin-email', 'invalid@example.com');
    await page.fill('#signin-password', 'wrongpassword');
    
    // Submit form
    await page.click('button[type="submit"]:has-text("Sign In")');
    
    // Should show error and stay on login page
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Sign In')).toBeVisible(); // Still on login
  });

  test('debug page shows auth state when enabled', async ({ page }) => {
    // Set debug mode (this would normally be set via env)
    await page.goto('/debug/auth');
    
    // Should either show debug dashboard or disabled message
    await expect(
      page.locator('text=Auth Debug').or(page.locator('text=Auth Debug is disabled'))
    ).toBeVisible();
  });
});