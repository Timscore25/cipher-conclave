// Global feature flags injected at build time
declare const __FEATURE_TELEMETRY__: boolean;
declare const __FEATURE_PASSKEY_UNLOCK__: boolean;

// WebAuthn types for better TypeScript support
interface PublicKeyCredential extends Credential {
  readonly rawId: ArrayBuffer;
  readonly response: AuthenticatorResponse;
}

interface AuthenticatorResponse {
  readonly clientDataJSON: ArrayBuffer;
}

interface AuthenticatorAttestationResponse extends AuthenticatorResponse {
  readonly attestationObject: ArrayBuffer;
}

interface AuthenticatorAssertionResponse extends AuthenticatorResponse {
  readonly authenticatorData: ArrayBuffer;
  readonly signature: ArrayBuffer;
  readonly userHandle: ArrayBuffer | null;
}

interface PublicKeyCredentialCreationOptions {
  challenge: BufferSource;
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntity;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptor[];
  extensions?: AuthenticationExtensionsClientInputs;
  attestation?: AttestationConveyancePreference;
}

interface PublicKeyCredentialRequestOptions {
  challenge: BufferSource;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptor[];
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
}

interface CredentialsContainer {
  create(options?: CredentialCreationOptions): Promise<Credential | null>;
  get(options?: CredentialRequestOptions): Promise<Credential | null>;
}

interface CredentialCreationOptions {
  publicKey?: PublicKeyCredentialCreationOptions;
}

interface CredentialRequestOptions {
  publicKey?: PublicKeyCredentialRequestOptions;
}

// Service worker message types
interface ServiceWorkerMessage {
  type: string;
  data?: any;
}

// Testing globals
interface Window {
  __TEST_QR_PAYLOAD?: any;
  trustedTypes?: {
    createPolicy: (name: string, policy: any) => any;
  };
}