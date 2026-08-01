import type { PhoneNormalization } from '../types.js';

const BRAZILIAN_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export function normalizeBrazilianPhone(value: string): PhoneNormalization {
  const digits = value.replace(/\D/g, '');
  const national = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits;

  if (national.length !== 11) {
    return { normalized: null, valid: false, reason: 'INVALID_LENGTH' };
  }

  if (!BRAZILIAN_DDDS.has(national.slice(0, 2))) {
    return { normalized: null, valid: false, reason: 'INVALID_DDD' };
  }

  if (national[2] !== '9') {
    return { normalized: null, valid: false, reason: 'INVALID_SUBSCRIBER' };
  }

  return { normalized: `55${national}`, valid: true, reason: null };
}
