import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createHtmlPlugin } from 'vite-plugin-html';
import crypto from 'crypto';

// Generate CSP nonce for runtime
const generateNonce = () => crypto.randomBytes(16).toString('base64');

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const nonce = generateNonce();
  
  return {
    server: {
      host: "::",
      port: 8080,
      headers: {
        // Security headers
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      createHtmlPlugin({
        inject: {
          data: {
            nonce,
            cspMeta: mode === 'development' ? `
              <meta http-equiv="Content-Security-Policy" content="
                default-src 'self';
                script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
                style-src 'self' 'unsafe-inline';
                img-src 'self' blob: data:;
                connect-src 'self' https://*.supabase.co ws://localhost:* wss://localhost:*;
                font-src 'self';
                object-src 'none';
                base-uri 'none';
                frame-ancestors 'none';
                form-action 'self';
                require-trusted-types-for 'script';
              ">
            ` : '',
          },
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      // Feature flags
      __FEATURE_TELEMETRY__: JSON.stringify(process.env.FEATURE_TELEMETRY === 'true'),
      __FEATURE_PASSKEY_UNLOCK__: JSON.stringify(process.env.FEATURE_PASSKEY_UNLOCK !== 'false'),
    },
  };
});
