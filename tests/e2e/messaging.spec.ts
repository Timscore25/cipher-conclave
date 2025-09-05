import { test, expect } from '@playwright/test';

test.describe('Messaging Flow', () => {
  test('complete messaging workflow with file attachment', async ({ page, context }) => {
    // This test simulates the full messaging flow:
    // 1. User A creates a room
    // 2. User A generates an invitation link
    // 3. User B accepts the invitation and joins
    // 4. User A sends a message with file attachment
    // 5. User B receives and decrypts the message
    // 6. Both users verify signatures and file integrity

    // Setup first user (A)
    await page.goto('/');
    
    // Wait for app to initialize and handle auth
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 });
    
    // Create first device for User A
    await page.click('[data-testid="create-device-button"]');
    await page.fill('[data-testid="device-name-input"]', 'UserA-Device1');
    await page.fill('[data-testid="passphrase-input"]', 'testpassphrase123');
    await page.click('[data-testid="create-device-confirm"]');
    
    // Wait for device creation and unlock
    await page.waitForSelector('[data-testid="rooms-list"]', { timeout: 15000 });
    
    // Create a room
    await page.click('[data-testid="create-room-button"]');
    await page.fill('[data-testid="room-name-input"]', 'Test Room');
    await page.click('[data-testid="create-room-confirm"]');
    
    // Wait for room to be created and selected
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10000 });
    
    // Generate invitation link
    await page.click('[data-testid="invite-users-button"]');
    await page.click('[data-testid="generate-invite-button"]');
    
    // Get the invitation link
    const inviteLink = await page.textContent('[data-testid="invitation-link"]');
    expect(inviteLink).toContain('/invite/');
    
    // Open second browser context for User B
    const contextB = await context.browser()?.newContext();
    const pageB = await contextB?.newPage();
    
    if (!pageB) throw new Error('Failed to create second browser context');
    
    // User B accepts invitation
    await pageB.goto(inviteLink!);
    
    // User B creates their device
    await pageB.click('[data-testid="create-device-button"]');
    await pageB.fill('[data-testid="device-name-input"]', 'UserB-Device1');
    await pageB.fill('[data-testid="passphrase-input"]', 'testpassphrase456');
    await pageB.click('[data-testid="create-device-confirm"]');
    
    // User B should automatically join the room after device creation
    await pageB.waitForSelector('[data-testid="chat-view"]', { timeout: 15000 });
    
    // Verify User B sees the correct room
    const roomNameB = await pageB.textContent('[data-testid="room-name"]');
    expect(roomNameB).toBe('Test Room');
    
    // User A sends a message with attachment
    await page.fill('[data-testid="message-input"]', 'Hello from User A! This is a test message.');
    
    // Simulate file attachment
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles({
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is a test document content for encryption testing.'),
    });
    
    await page.click('[data-testid="send-message-button"]');
    
    // Wait for message to be sent and appear in chat
    await page.waitForSelector('[data-testid="message"]:has-text("Hello from User A")', { timeout: 10000 });
    
    // Verify message appears with attachment
    const messageWithAttachment = page.locator('[data-testid="message"]').last();
    await expect(messageWithAttachment).toContainText('Hello from User A');
    await expect(messageWithAttachment.locator('[data-testid="attachment"]')).toBeVisible();
    
    // User B should receive the message
    await pageB.waitForSelector('[data-testid="message"]:has-text("Hello from User A")', { timeout: 15000 });
    
    // Verify message decryption and signature verification on User B's side
    const messageBElement = pageB.locator('[data-testid="message"]').last();
    await expect(messageBElement).toContainText('Hello from User A');
    
    // Check for signature verification indicator
    await expect(messageBElement.locator('[data-testid="signature-verified"]')).toBeVisible();
    
    // Test file download and integrity
    await messageBElement.locator('[data-testid="download-attachment"]').click();
    
    // Wait for download to start
    const download = await pageB.waitForEvent('download', { timeout: 5000 });
    expect(download.suggestedFilename()).toBe('test-document.txt');
    
    // Save and verify file content
    const path = await download.path();
    if (path) {
      const fs = require('fs');
      const downloadedContent = fs.readFileSync(path, 'utf8');
      expect(downloadedContent).toBe('This is a test document content for encryption testing.');
    }
    
    // Clean up
    await contextB?.close();
  });

  test('tamper detection - modified ciphertext should fail decryption', async ({ page }) => {
    await page.goto('/');
    
    // Setup device and room (abbreviated setup)
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 });
    
    // Intercept network requests and tamper with message data
    await page.route('**/functions/v1/messages/send', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      
      // Tamper with the ciphertext
      if (body.ciphertext) {
        const tamperedBody = {
          ...body,
          ciphertext: body.ciphertext.replace(/A/g, 'B'), // Simple tampering
        };
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tamperedBody),
        });
      } else {
        await route.continue();
      }
    });
    
    // Create device and room
    await page.click('[data-testid="create-device-button"]');
    await page.fill('[data-testid="device-name-input"]', 'TestDevice');
    await page.fill('[data-testid="passphrase-input"]', 'testpass123');
    await page.click('[data-testid="create-device-confirm"]');
    
    await page.waitForSelector('[data-testid="rooms-list"]', { timeout: 15000 });
    
    await page.click('[data-testid="create-room-button"]');
    await page.fill('[data-testid="room-name-input"]', 'Tamper Test Room');
    await page.click('[data-testid="create-room-confirm"]');
    
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10000 });
    
    // Send a message that will be tampered with
    await page.fill('[data-testid="message-input"]', 'This message will be tampered with');
    await page.click('[data-testid="send-message-button"]');
    
    // Should show decryption error
    await page.waitForSelector('[data-testid="decryption-error"]', { timeout: 10000 });
    
    const errorMessage = await page.textContent('[data-testid="decryption-error"]');
    expect(errorMessage).toContain('Failed to decrypt');
  });
});