import { ValidationError } from './errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_REGEX = /^[a-z]{3}$/;

export function assertValidEmail(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError(`Invalid email address: "${email}".`);
  }
}

export function assertValidCurrency(currency: string): void {
  if (!CURRENCY_REGEX.test(currency.toLowerCase())) {
    throw new ValidationError(`Invalid currency code: "${currency}". Expected a 3-letter ISO code such as "usd" or "eur".`);
  }
}

export function assertMinimumAmount(amountInMinorUnits: number, minimum = 50): void {
  if (!Number.isInteger(amountInMinorUnits) || amountInMinorUnits < minimum) {
    throw new ValidationError(`Amount must be an integer of at least ${minimum} minor currency units.`);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugifyFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function validateCustomFieldSchema(
  schema: { key: string; label: string; type?: string; required?: boolean; pattern?: string; patternHint?: string }[],
  submitted: Record<string, string>,
): { values: Record<string, string>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};

  for (const field of schema) {
    const raw = submitted?.[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (field.required && value === '') {
      errors[field.key] = `${field.label || field.key} is required.`;
      continue;
    }

    if (value !== '' && field.pattern) {
      const regex = new RegExp(field.pattern);
      if (!regex.test(value)) {
        errors[field.key] = field.patternHint || `${field.label} format is invalid.`;
        continue;
      }
    }

    if (value !== '') values[field.key] = value;
  }

  return { values, errors };
}
