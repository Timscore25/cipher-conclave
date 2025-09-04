import QRCode from 'qrcode';
import { createHash } from 'crypto';

export interface DeviceQRPayload {
  fpr: string;
  userId: string;
  deviceLabel: string;
  publicKeyArmored: string;
  timestamp: number;
}

export function generateDeviceQRPayload(
  fingerprint: string,
  userId: string,
  deviceLabel: string,
  publicKeyArmored: string
): DeviceQRPayload {
  return {
    fpr: fingerprint,
    userId,
    deviceLabel,
    publicKeyArmored,
    timestamp: Date.now(),
  };
}

export async function generateQRCode(payload: DeviceQRPayload): Promise<string> {
  const jsonPayload = JSON.stringify(payload);
  const base64Payload = btoa(jsonPayload);
  const qrData = `pgprooms://verify/${base64Payload}`;
  
  return QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.92,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    width: 256,
  });
}

export function parseQRPayload(qrData: string): DeviceQRPayload | null {
  try {
    if (!qrData.startsWith('pgprooms://verify/')) {
      return null;
    }
    
    const base64Payload = qrData.replace('pgprooms://verify/', '');
    const jsonPayload = atob(base64Payload);
    const payload = JSON.parse(jsonPayload);
    
    // Validate required fields
    if (!payload.fpr || !payload.userId || !payload.deviceLabel || !payload.publicKeyArmored) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('Failed to parse QR payload:', error);
    return null;
  }
}

export function computeShortAuthString(fpr1: string, fpr2: string): Promise<string> {
  // Create deterministic ordering
  const [first, second] = [fpr1, fpr2].sort();
  const combined = first + second;
  
  // Use Web Crypto API for SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  
  return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Return first 6 characters
    return hashHex.substring(0, 6).toUpperCase();
  });
}

export async function computeShortAuthStringSync(fpr1: string, fpr2: string): Promise<string> {
  return computeShortAuthString(fpr1, fpr2);
}