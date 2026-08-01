import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const REDACTED = '[REDACTED]';
const ENVELOPE_VERSION = 'v1';

function encryptionKey(key: string): Buffer {
  if (!key) {
    throw new Error('Encryption key is required.');
  }
  return createHash('sha256').update(key, 'utf8').digest();
}

export function encryptSecret(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
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

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isCredentialKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'authorization'
    || normalized.includes('token')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('apikey')
    || normalized.includes('encryptionkey');
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
