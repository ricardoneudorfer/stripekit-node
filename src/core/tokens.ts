import { randomBytes, createHash } from 'crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateCheckoutId(): string {
  return `cs_kit_${randomBytes(20).toString('hex')}`;
}

export function generateInvoiceNumber(prefix = 'INV'): string {
  const year = new Date().getUTCFullYear();
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${year}-${suffix}`;
}
