const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
  'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
}

export function toMinorUnits(amount: number, currency: string): number {
  return isZeroDecimalCurrency(currency) ? Math.round(amount) : Math.round(amount * 100);
}

export function toMajorUnits(amountInMinorUnits: number, currency: string): number {
  return isZeroDecimalCurrency(currency) ? amountInMinorUnits : amountInMinorUnits / 100;
}

export function formatMoney(amountInMinorUnits: number, currency: string, locale = 'en-US'): string {
  const major = toMajorUnits(amountInMinorUnits, currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(major);
}
