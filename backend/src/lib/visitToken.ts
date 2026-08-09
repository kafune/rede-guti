import { randomBytes } from 'node:crypto';

// Token público da visita: aleatório, não sequencial, impossível de adivinhar.
// 24 bytes → 32 chars base64url. Revogável via Visit.tokenRevoked.
export const newVisitToken = (): string => randomBytes(24).toString('base64url');
