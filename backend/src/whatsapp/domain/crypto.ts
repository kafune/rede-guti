import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const REDACTED = '[REDACTED]';
const ENVELOPE_VERSION = 'v1';

const ENCRYPTION_KEY_ERROR = 'Encryption key must be 64 hex characters or base64 encoding exactly 32 bytes.';

export function decodeEncryptionKey(value: string): Buffer {
  const key = value.trim();
  if (/^[0-9a-f]{64}$/i.test(key)) {
    return Buffer.from(key, 'hex');
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    const decoded = Buffer.from(key, 'base64');
    const canonical = decoded.toString('base64').replace(/=+$/, '');
    if (decoded.length === 32 && canonical === key.replace(/=+$/, '')) {
      return decoded;
    }
  }

  throw new Error(ENCRYPTION_KEY_ERROR);
}

export function encryptSecret(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeEncryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    authenticationTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(envelope: string, key: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split(':');
  if (version !== ENVELOPE_VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
    throw new Error('Invalid encrypted secret envelope.');
  }

  const decipher = createDecipheriv('aes-256-gcm', decodeEncryptionKey(key), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isCredentialKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'authorization'
    || normalized === 'auth'
    || normalized.endsWith('auth')
    || normalized.includes('token')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('apikey')
    || normalized.includes('encryptionkey')
    || normalized.includes('credential')
    || normalized.includes('cookie')
    || normalized.includes('privatekey');
}

export function sanitizeCredentials<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCredentials(item)) as T;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    isCredentialKey(key) ? REDACTED : sanitizeCredentials(nested),
  ])) as T;
}
