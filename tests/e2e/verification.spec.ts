import { test, expect } from '@playwright/test';

test.describe('Key Verification Flow', () => {
  test('QR code verification workflow', async ({ page, context }) => {
    // Setup two users for verification
    await page.goto('/');
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 });
    
    // User A setup
    await page.click('[data-testid="create-device-button"]');
    await page.fill('[data-testid="device-name-input"]', 'UserA-Verification');
    await page.fill('[data-testid="passphrase-input"]', 'verifypass123');
    await page.click('[data-testid="create-device-confirm"]');
    
    await page.waitForSelector('[data-testid="rooms-list"]', { timeout: 15000 });
    
    // Create room and invite process (to get two users in contact)
    await page.click('[data-testid="create-room-button"]');
    await page.fill('[data-testid="room-name-input"]', 'Verification Test');
    await page.click('[data-testid="create-room-confirm"]');
    
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10000 });
    
    // Generate invite
    await page.click('[data-testid="invite-users-button"]');
    await page.click('[data-testid="generate-invite-button"]');
    const inviteLink = await page.textContent('[data-testid="invitation-link"]');
    
    // User B setup
    const contextB = await context.browser()?.newContext();
    const pageB = await contextB?.newPage();
    if (!pageB) throw new Error('Failed to create second context');
    
    await pageB.goto(inviteLink!);
    await pageB.click('[data-testid="create-device-button"]');
    await pageB.fill('[data-testid="device-name-input"]', 'UserB-Verification');
    await pageB.fill('[data-testid="passphrase-input"]', 'verifypass456');
    await pageB.click('[data-testid="create-device-confirm"]');
    
    await pageB.waitForSelector('[data-testid="chat-view"]', { timeout: 15000 });
    
    // Start verification process - User A shows QR
    await page.click('[data-testid="room-members-button"]');
    const userBInList = page.locator('[data-testid="member-item"]').filter({ hasText: 'UserB' });
    await userBInList.click();
    await page.click('[data-testid="verify-key-button"]');
    await page.click('[data-testid="show-qr-option"]');
    
    // User A should now show QR code
    await page.waitForSelector('[data-testid="qr-code-display"]', { timeout: 5000 });
    
    // Extract QR data for simulation (in real scenario, User B would scan)
    const qrDataUrl = await page.getAttribute('[data-testid="qr-code-image"]', 'src');
    expect(qrDataUrl).toContain('data:image/png;base64,');
    
    // Get the QR payload data (simulate QR scanning result)
    const qrPayload = await page.evaluate(() => {
      // This would normally come from QR scanning
      return window.__TEST_QR_PAYLOAD; // Set by the component for testing
    });
    
    // User B scans QR (simulate by directly providing the payload)
    await pageB.click('[data-testid="room-members-button"]');
    const userAInList = pageB.locator('[data-testid="member-item"]').filter({ hasText: 'UserA' });
    await userAInList.click();
    await pageB.click('[data-testid="verify-key-button"]');
    await pageB.click('[data-testid="scan-qr-option"]');
    
    // Simulate successful QR scan
    await pageB.evaluate((payload) => {
      window.dispatchEvent(new CustomEvent('qr-scanned', { detail: payload }));
    }, qrPayload);
    
    // Both users should now see SAS verification screen
    await page.waitForSelector('[data-testid="sas-verification"]', { timeout: 5000 });
    await pageB.waitForSelector('[data-testid="sas-verification"]', { timeout: 5000 });
    
    // Get SAS values from both sides
    const sasA = await page.textContent('[data-testid="sas-value"]');
    const sasB = await pageB.textContent('[data-testid="sas-value"]');
    
    // SAS should match
    expect(sasA).toBe(sasB);
    expect(sasA).toMatch(/^[0-9A-F]{6}$/);
    
    // Both users confirm SAS matches
    await page.click('[data-testid="sas-confirm-button"]');
    await pageB.click('[data-testid="sas-confirm-button"]');
    
    // Verification should complete
    await page.waitForSelector('[data-testid="verification-success"]', { timeout: 10000 });
    await pageB.waitForSelector('[data-testid="verification-success"]', { timeout: 10000 });
    
    // Check that verification is recorded in UI
    await page.click('[data-testid="close-verification"]');
    await pageB.click('[data-testid="close-verification"]');
    
    // User lists should now show verified status
    await page.click('[data-testid="room-members-button"]');
    const verifiedMemberA = page.locator('[data-testid="member-item"]').filter({ hasText: 'UserB' });
    await expect(verifiedMemberA.locator('[data-testid="verified-badge"]')).toBeVisible();
    
    await pageB.click('[data-testid="room-members-button"]');
    const verifiedMemberB = pageB.locator('[data-testid="member-item"]').filter({ hasText: 'UserA' });
    await expect(verifiedMemberB.locator('[data-testid="verified-badge"]')).toBeVisible();
    
    // Future messages should show as verified
    await page.fill('[data-testid="message-input"]', 'This message should show as verified');
    await page.click('[data-testid="send-message-button"]');
    
    await pageB.waitForSelector('[data-testid="message"]:has-text("should show as verified")', { timeout: 10000 });
    const verifiedMessage = pageB.locator('[data-testid="message"]').last();
    await expect(verifiedMessage.locator('[data-testid="signature-verified-badge"]')).toBeVisible();
    
    await contextB?.close();
  });

  test('verification rejection flow', async ({ page, context }) => {
    // Similar setup to above but with SAS mismatch simulation
    await page.goto('/');
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 });
    
    // Abbreviated setup
    await page.click('[data-testid="create-device-button"]');
    await page.fill('[data-testid="device-name-input"]', 'UserA-Reject');
    await page.fill('[data-testid="passphrase-input"]', 'rejectpass123');
    await page.click('[data-testid="create-device-confirm"]');
    
    await page.waitForSelector('[data-testid="rooms-list"]', { timeout: 15000 });
    
    // Create room and get second user
    await page.click('[data-testid="create-room-button"]');
    await page.fill('[data-testid="room-name-input"]', 'Rejection Test');
    await page.click('[data-testid="create-room-confirm"]');
    
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10000 });
    
    await page.click('[data-testid="invite-users-button"]');
    await page.click('[data-testid="generate-invite-button"]');
    const inviteLink = await page.textContent('[data-testid="invitation-link"]');
    
    const contextB = await context.browser()?.newContext();
    const pageB = await contextB?.newPage();
    if (!pageB) throw new Error('Failed to create second context');
    
    await pageB.goto(inviteLink!);
    await pageB.click('[data-testid="create-device-button"]');
    await pageB.fill('[data-testid="device-name-input"]', 'UserB-Reject');
    await pageB.fill('[data-testid="passphrase-input"]', 'rejectpass456');
    await pageB.click('[data-testid="create-device-confirm"]');
    
    await pageB.waitForSelector('[data-testid="chat-view"]', { timeout: 15000 });
    
    // Start verification but reject at SAS stage
    await page.click('[data-testid="room-members-button"]');
    const userBInList = page.locator('[data-testid="member-item"]').filter({ hasText: 'UserB' });
    await userBInList.click();
    await page.click('[data-testid="verify-key-button"]');
    await page.click('[data-testid="show-qr-option"]');
    
    await page.waitForSelector('[data-testid="qr-code-display"]', { timeout: 5000 });
    
    // Simulate QR scan and SAS display
    const qrPayload = await page.evaluate(() => window.__TEST_QR_PAYLOAD);
    
    await pageB.click('[data-testid="room-members-button"]');
    const userAInList = pageB.locator('[data-testid="member-item"]').filter({ hasText: 'UserA' });
    await userAInList.click();
    await pageB.click('[data-testid="verify-key-button"]');
    await pageB.click('[data-testid="scan-qr-option"]');
    
    await pageB.evaluate((payload) => {
      window.dispatchEvent(new CustomEvent('qr-scanned', { detail: payload }));
    }, qrPayload);
    
    await page.waitForSelector('[data-testid="sas-verification"]', { timeout: 5000 });
    await pageB.waitForSelector('[data-testid="sas-verification"]', { timeout: 5000 });
    
    // User A rejects (simulating SAS mismatch)
    await page.click('[data-testid="sas-reject-button"]');
    
    // Should show rejection message
    await page.waitForSelector('[data-testid="verification-rejected"]', { timeout: 5000 });
    await pageB.waitForSelector('[data-testid="verification-cancelled"]', { timeout: 5000 });
    
    // Users should remain unverified
    await page.click('[data-testid="close-verification"]');
    await page.click('[data-testid="room-members-button"]');
    const unverifiedMember = page.locator('[data-testid="member-item"]').filter({ hasText: 'UserB' });
    await expect(unverifiedMember.locator('[data-testid="verified-badge"]')).not.toBeVisible();
    
    await contextB?.close();
  });
});