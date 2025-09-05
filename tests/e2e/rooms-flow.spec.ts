import { test, expect } from '@playwright/test';

test.describe('Rooms Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Enable debug mode
    await page.addInitScript(() => {
      window.localStorage.setItem('VITE_DEBUG_ROOMS', 'true');
      window.localStorage.setItem('VITE_DEBUG_AUTH', 'true');
      window.localStorage.setItem('VITE_DEBUG_CRYPTO', 'true');
    });
  });

  test('should show empty state when no rooms exist', async ({ page }) => {
    // Navigate to app (user should be authenticated and have device)
    await page.goto('/');
    
    // Wait for rooms to load
    await page.waitForSelector('[data-testid="rooms-list"]', { timeout: 10000 });
    
    // Should show empty state
    await expect(page.locator('text=No rooms yet')).toBeVisible();
    await expect(page.locator('text=Create a room to start chatting')).toBeVisible();
    
    // Should show create button
    await expect(page.locator('button:has-text("Create Your First Room")')).toBeVisible();
  });

  test('should create room and show it in list', async ({ page }) => {
    await page.goto('/');
    
    // Wait for empty state
    await page.waitForSelector('text=No rooms yet');
    
    // Click create room
    await page.click('button:has-text("Create")');
    
    // Fill room name
    await page.fill('#room-name', 'Test Room E2E');
    
    // Submit form
    await page.click('button:has-text("Create Room")');
    
    // Should show success toast
    await expect(page.locator('text=Room created')).toBeVisible();
    
    // Should show room in list
    await expect(page.locator('text=Test Room E2E')).toBeVisible();
    
    // Room should be selected (active state)
    await expect(page.locator('button:has-text("Test Room E2E")')).toHaveClass(/bg-primary|active/);
  });

  test('should handle room creation errors gracefully', async ({ page }) => {
    // Mock network to return error
    await page.route('**/rest/v1/rpc/create_room_with_membership', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ 
          message: 'No device found for user. Please create a device first.',
          code: 'PGRST301'
        })
      });
    });
    
    await page.goto('/');
    
    // Try to create room
    await page.click('button:has-text("Create")');
    await page.fill('#room-name', 'Test Room');
    await page.click('button:has-text("Create Room")');
    
    // Should show error toast with helpful message
    await expect(page.locator('text=You need to create a device first')).toBeVisible();
  });

  test('should persist rooms after page reload', async ({ page }) => {
    await page.goto('/');
    
    // Create a room first
    await page.waitForSelector('text=No rooms yet', { timeout: 5000 });
    await page.click('button:has-text("Create")');
    await page.fill('#room-name', 'Persistent Room');
    await page.click('button:has-text("Create Room")');
    
    // Wait for room to appear
    await expect(page.locator('text=Persistent Room')).toBeVisible();
    
    // Reload page
    await page.reload();
    
    // Room should still be there
    await expect(page.locator('text=Persistent Room')).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    await page.goto('/');
    
    // Should show loading state briefly
    await expect(page.locator('text=Loading rooms...')).toBeVisible();
  });

  test('should handle network errors with retry option', async ({ page }) => {
    // Mock network failure
    let failCount = 0;
    await page.route('**/rest/v1/rooms*', route => {
      failCount++;
      if (failCount <= 1) {
        route.abort('failed');
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });
    
    await page.goto('/');
    
    // Should show error state
    await expect(page.locator('text=Failed to load rooms')).toBeVisible();
    
    // Should have retry button
    await expect(page.locator('button:has-text("Try Again")')).toBeVisible();
    
    // Click retry should work
    await page.click('button:has-text("Try Again")');
    
    // Should show empty state after retry
    await expect(page.locator('text=No rooms yet')).toBeVisible();
  });

  test('should disable create button when no device exists', async ({ page }) => {
    // Mock user with no devices
    await page.addInitScript(() => {
      // Mock crypto store to have no device
      window.__mockCryptoStore = {
        currentDeviceFingerprint: null,
        hasDevice: false
      };
    });
    
    await page.goto('/');
    
    // Create button should be disabled
    await expect(page.locator('button:has-text("Create")').first()).toBeDisabled();
    
    // Should show helpful message in empty state
    await expect(page.locator('text=You need to create a device first')).toBeVisible();
  });

  test('should select room when clicked', async ({ page }) => {
    await page.goto('/');
    
    // Create multiple rooms
    await page.click('button:has-text("Create")');
    await page.fill('#room-name', 'Room 1');
    await page.click('button:has-text("Create Room")');
    
    await page.click('button:has-text("Create")');
    await page.fill('#room-name', 'Room 2');
    await page.click('button:has-text("Create Room")');
    
    // Wait for both rooms to appear
    await expect(page.locator('text=Room 1')).toBeVisible();
    await expect(page.locator('text=Room 2')).toBeVisible();
    
    // Click on Room 1
    await page.click('button:has-text("Room 1")');
    
    // Room 1 should be selected
    await expect(page.locator('button:has-text("Room 1")')).toHaveClass(/bg-primary|active/);
    
    // Room 2 should not be selected
    await expect(page.locator('button:has-text("Room 2")')).not.toHaveClass(/bg-primary|active/);
  });
});