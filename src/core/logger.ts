export class KitLogger {
  constructor(private readonly enabled: boolean) {}

  debug(...args: unknown[]): void {
    if (this.enabled) console.debug('[StripeKit]', ...args);
  }

  info(...args: unknown[]): void {
    if (this.enabled) console.info('[StripeKit]', ...args);
  }

  warn(...args: unknown[]): void {
    console.warn('[StripeKit]', ...args);
  }

  error(...args: unknown[]): void {
    console.error('[StripeKit]', ...args);
  }
}
