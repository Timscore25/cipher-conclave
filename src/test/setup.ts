import { beforeEach, vi } from 'vitest';

// Mock IndexedDB
const mockIDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};

Object.defineProperty(window, 'indexedDB', {
  value: mockIDB,
  writable: true,
});

// Mock crypto.subtle for tests
Object.defineProperty(window, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn(),
      generateKey: vi.fn(),
      importKey: vi.fn(),
      exportKey: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    },
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  },
  writable: true,
});

// Mock fetch to prevent network calls in tests
const mockFetch = vi.fn();
Object.defineProperty(window, 'fetch', {
  value: mockFetch,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  
  // Setup default mock responses
  mockFetch.mockImplementation(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    })
  );
});

// Security invariant: Spy on fetch to ensure no private keys/passphrases are sent
export const createNetworkSecuritySpy = () => {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  
  mockFetch.mockImplementation((url, options = {}) => {
    const body = options.body ? 
      (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) 
      : '';
    
    calls.push({
      url: url.toString(),
      body,
      headers: options.headers || {},
    });
    
    // Check for private key leakage
    const privateKeyIndicators = [
      'BEGIN PGP PRIVATE KEY',
      '-----BEGIN',
      'passphrase',
      'privateKey',
      'unlocked',
    ];
    
    const bodyStr = body.toLowerCase();
    for (const indicator of privateKeyIndicators) {
      if (bodyStr.includes(indicator.toLowerCase())) {
        throw new Error(`SECURITY VIOLATION: Private key material detected in network request: ${indicator}`);
      }
    }
    
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      headers: new Headers(),
    });
  });
  
  return {
    getCalls: () => calls,
    hasPrivateKeyLeakage: () => {
      return calls.some(call => {
        const bodyStr = call.body.toLowerCase();
        return ['begin pgp private key', '-----begin', 'passphrase'].some(indicator => 
          bodyStr.includes(indicator)
        );
      });
    },
  };
};