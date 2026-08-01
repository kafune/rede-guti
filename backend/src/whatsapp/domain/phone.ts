import type { PhoneNormalization } from '../types.js';

export function normalizeBrazilianPhone(value: string): PhoneNormalization {
  const digits = value.replace(/\D/g, '');
  const hasCountryCode = (digits.length === 12 || digits.length === 13) && digits.startsWith('55');
  const national = hasCountryCode ? digits.slice(2) : digits;

  if (national.length !== 10 && national.length !== 11) {
    return { normalized: null, valid: false, reason: 'INVALID_LENGTH' };
  }

  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return { normalized: null, valid: false, reason: 'INVALID_DDD' };
  }

  if (!/[2-9]/.test(national[2])) {
    return { normalized: null, valid: false, reason: 'INVALID_SUBSCRIBER' };
  }

  return { normalized: `55${national}`, valid: true, reason: null };
}
