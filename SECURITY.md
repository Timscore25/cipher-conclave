# Security Documentation - PGP Rooms

## Overview

PGP Rooms implements end-to-end encryption with OpenPGP, device verification, and strict security policies. This document outlines the security architecture and measures in place.

## Encryption Architecture

### Message Encryption
- **Algorithm**: OpenPGP with RSA-4096 keys
- **AEAD**: AES-GCM for symmetric encryption
- **Hash**: SHA-256 for integrity verification
- **Key Exchange**: Each message uses a unique symmetric key, encrypted for each recipient device

### Private Key Protection
- **At Rest**: Private keys are encrypted with Argon2id (passphrase-based)
- **Optional**: WebAuthn passkey provides additional wrapping layer
- **In Memory**: Unlocked keys are stored temporarily and cleared on lock/logout
- **Network**: Private keys and passphrases NEVER transmitted

## Row-Level Security (RLS) Policies

### Messages Table
- **SELECT**: Only room members can view messages
- **INSERT**: Only authenticated room members can send messages
- **UPDATE/DELETE**: Prohibited (messages are immutable)
- **Time Restriction**: Messages older than 30 days are not accessible via RLS

### Rooms Table
- **SELECT**: Only room members can view room details
- **INSERT**: Any authenticated user can create rooms
- **UPDATE**: Only room owners can modify rooms
- **DELETE**: Prohibited

### Room Members Table
- **SELECT**: Users can see their own memberships and other members of their rooms
- **INSERT/UPDATE/DELETE**: Only room admins can manage membership

### Devices Table
- **SELECT**: All users can view all device public keys (required for encryption)
- **INSERT/UPDATE/DELETE**: Users can only manage their own devices

### Key Verifications Table
- **SELECT**: Users can view their own verifications
- **INSERT**: Users can create verifications only for devices in common rooms
- **UPDATE/DELETE**: Prohibited (verifications are immutable)

### Attachments Table
- **SELECT**: Only room members can view attachment metadata
- **INSERT**: Only message authors can create attachments
- **UPDATE/DELETE**: Prohibited

### Room Invites Table
- **SELECT**: Anyone can view valid (non-expired, non-exhausted) invites by token
- **INSERT**: Only room members can create invites
- **UPDATE**: Only invite creators can modify their invites
- **DELETE**: Automatic cleanup via database functions

## Content Security Policy (CSP)

```
default-src 'self';
script-src 'self' 'nonce-<runtime>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:;
connect-src 'self' https://*.supabase.co;
font-src 'self';
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self';
require-trusted-types-for 'script';
```

### CSP Protection Features
- **Script Injection**: Blocked via nonce-based script loading
- **XSS Prevention**: Strict-dynamic and nonce requirements
- **Data Exfiltration**: Limited connection destinations
- **Clickjacking**: Frame-ancestors 'none'
- **Trusted Types**: Enforced for script execution

## Browser Security Features

### Subresource Integrity (SRI)
- All external scripts and stylesheets include integrity hashes
- Build process automatically generates and injects SRI hashes
- Prevents tampering with external dependencies

### Trusted Types
- Default policy prevents dangerous innerHTML/script injections
- All dynamic content creation goes through trusted type policies
- Blocks eval() and other dangerous dynamic script execution

### Additional Headers
- `X-Frame-Options: DENY` - Prevents embedding in frames
- `X-Content-Type-Options: nosniff` - Prevents MIME type confusion
- `Referrer-Policy: strict-origin-when-cross-origin` - Limits referrer information

## WebAuthn (Passkey) Security

### Local-Only Operation
- Passkeys never leave the user's device
- WebAuthn operations are purely local (no server interaction)
- Derived keys are used for local encryption wrapping only

### Key Derivation
- WebAuthn response data (authenticatorData + clientDataJSON)
- HKDF-SHA256 for consistent key derivation
- 256-bit AES-GCM keys for private key wrapping

### Fallback Security
- Passkey is optional additional layer
- Original passphrase-based unlocking always available
- Disabling passkey doesn't affect existing encrypted data

## Attachment Security

### Storage Model
- Attachments stored in Supabase Storage (private bucket)
- Metadata stored in attachments table with RLS
- File access requires room membership verification

### Access Control
- Short-lived signed URLs (60 seconds)
- Edge function verifies room membership before signing
- Path-based access control (roomId/messageId/filename)
- SHA-256 verification of downloaded content

### Edge Function Security
- JWT authentication required
- Room membership verification
- Message existence verification
- Audit logging of access attempts

## Database Security

### Function Security
- All functions use `SECURITY DEFINER` with fixed `search_path`
- Input validation and sanitization
- Proper error handling without information leakage
- Transaction isolation for atomic operations

### Cleanup and Maintenance
- Automatic cleanup of expired invitations
- Secure token generation using `gen_random_bytes()`
- Database functions prevent SQL injection

## Network Security

### API Endpoints
- All endpoints require JWT authentication
- CORS headers properly configured
- Rate limiting implemented (via Supabase)
- HTTPS enforcement

### Real-time Subscriptions
- Row-level security enforced on real-time updates
- Subscription authentication via JWT
- Automatic connection cleanup on authentication loss

## Development Security

### Testing Security
- Network spy prevents private key leakage in tests
- Mocked crypto operations for deterministic testing
- Security invariant tests for sensitive data transmission

### Build Security
- Dependency audit on CI/CD
- Pinned versions for crypto libraries
- SRI hash generation at build time
- CSP nonce generation per deployment

## Threat Model

### Protected Against
- **Man-in-the-Middle**: End-to-end encryption with signature verification
- **Server Compromise**: Zero-knowledge architecture, server never sees plaintext
- **Device Theft**: Passphrase/passkey required for key unlocking
- **Session Hijacking**: JWT-based authentication with short expiry
- **XSS Attacks**: CSP and Trusted Types enforcement
- **Data Scraping**: RLS with time-based restrictions
- **Unauthorized Access**: Multi-layer access control verification

### Not Protected Against
- **Client-Side Malware**: If user's device is compromised, plaintext is accessible
- **Phishing**: Users could be tricked into entering credentials on fake sites
- **Social Engineering**: Users could be manipulated into sharing sensitive information
- **Quantum Attacks**: RSA keys vulnerable to sufficiently powerful quantum computers
- **Side-Channel Attacks**: Timing attacks on crypto operations possible

## Security Maintenance

### Regular Updates
- Dependency security audits
- Crypto library version monitoring
- Security policy reviews
- Penetration testing recommendations

### Monitoring
- Failed authentication attempt logging
- Unusual access pattern detection
- Database performance monitoring for potential attacks
- CSP violation reporting

### Incident Response
- Immediate key rotation procedures
- User notification protocols
- Forensic data collection procedures
- Recovery and continuity planning

## Compliance Notes

### Privacy
- No personally identifiable information stored in plaintext
- Message content never accessible to service operators
- Optional telemetry is disabled by default
- User data deletion procedures documented

### Cryptographic Standards
- OpenPGP RFC 4880 compliance
- NIST-approved cryptographic algorithms
- Secure random number generation
- Proper key lifecycle management

---

**Last Updated**: 2025-01-05  
**Version**: 1.0.0  
**Review Date**: 2025-07-05