import Stripe from 'stripe';
import type { StripeKitConfig, ResolvedStripeKitConfig } from './types/config';
import { ConfigurationError } from './core/errors';
import { assertValidTimezone, DEFAULT_TIMEZONE } from './core/timezone';
import { KitLogger } from './core/logger';

import { CustomersModule } from './modules/customers';
import { PaymentMethodsModule } from './modules/paymentMethods';
import { PaymentsModule } from './modules/payments';
import { CheckoutModule } from './modules/checkout';
import { SubscriptionsModule } from './modules/subscriptions';
import { InvoicesModule } from './modules/invoices';
import { CouponsModule } from './modules/coupons';
import { WebhooksModule } from './modules/webhooks';
import { SyncModule } from './modules/sync';

function resolveConfig(input: StripeKitConfig): ResolvedStripeKitConfig {
  if (!input.secretKey || typeof input.secretKey !== 'string') {
    throw new ConfigurationError('`secretKey` is required to initiate StripeKit. Pass your Stripe secret key (sk_live_... or sk_test_...).');
  }

  if (input.secretKey.startsWith('pk_')) {
    throw new ConfigurationError('You passed a publishable key as `secretKey`. Use your Stripe secret key here, and put the publishable key in `publishableKey`.');
  }

  if (!input.mode || !['api', 'elements', 'both'].includes(input.mode)) {
    throw new ConfigurationError('`mode` is required and must be one of "api", "elements" or "both". "api" returns a hosted Stripe link, "elements" waits for confirmation from Stripe Elements on your own frontend, "both" lets you choose per call.');
  }

  if (input.mode !== 'api' && !input.publishableKey) {
    console.warn('[StripeKit] `publishableKey` was not provided. It is required on the frontend to mount Stripe Elements, even though StripeKit itself does not need it server-side.');
  }

  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  assertValidTimezone(timezone);

  return {
    secretKey: input.secretKey,
    publishableKey: input.publishableKey,
    webhookSecret: input.webhookSecret,
    mode: input.mode,
    timezone,
    apiVersion: input.apiVersion,
    appInfo: input.appInfo,
    currency: (input.currency ?? 'usd').toLowerCase(),
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    storage: input.storage,
    debug: input.debug ?? false,
    maxNetworkRetries: input.maxNetworkRetries ?? 2,
    timeout: input.timeout,
  };
}

export class StripeKit {
  public readonly config: ResolvedStripeKitConfig;
  public readonly raw: Stripe;

  public readonly customers: CustomersModule;
  public readonly paymentMethods: PaymentMethodsModule;
  public readonly payments: PaymentsModule;
  public readonly checkout: CheckoutModule;
  public readonly subscriptions: SubscriptionsModule;
  public readonly invoices: InvoicesModule;
  public readonly coupons: CouponsModule;
  public readonly webhooks: WebhooksModule;
  public readonly sync: SyncModule;

  private constructor(config: ResolvedStripeKitConfig) {
    this.config = config;

    this.raw = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion,
      appInfo: config.appInfo,
      maxNetworkRetries: config.maxNetworkRetries,
      timeout: config.timeout,
    });

    const logger = new KitLogger(config.debug);

    this.customers = new CustomersModule(this.raw, config, logger);
    this.paymentMethods = new PaymentMethodsModule(this.raw, config, logger);
    this.payments = new PaymentsModule(this.raw, config, logger);
    this.checkout = new CheckoutModule(this.raw, config, logger);
    this.subscriptions = new SubscriptionsModule(this.raw, config, logger);
    this.invoices = new InvoicesModule(this.raw, config, logger);
    this.coupons = new CouponsModule(this.raw, config, logger);

    this.checkout.attachCouponsModule(this.coupons);

    this.sync = new SyncModule(this.raw, config, logger, {
      customers: this.customers,
      subscriptions: this.subscriptions,
      payments: this.payments,
      invoices: this.invoices,
      paymentMethods: this.paymentMethods,
    });

    this.webhooks = new WebhooksModule(this.raw, config, logger, {
      subscriptions: this.subscriptions,
      payments: this.payments,
      invoices: this.invoices,
      paymentMethods: this.paymentMethods,
    });
  }

  static init(config: StripeKitConfig): StripeKit {
    return new StripeKit(resolveConfig(config));
  }

  get isElementsEnabled(): boolean {
    return this.config.mode === 'elements' || this.config.mode === 'both';
  }

  get isApiEnabled(): boolean {
    return this.config.mode === 'api' || this.config.mode === 'both';
  }

  toClientConfig(): { publishableKey: string | undefined; mode: string; timezone: string } {
    return {
      publishableKey: this.config.publishableKey,
      mode: this.config.mode,
      timezone: this.config.timezone,
    };
  }
}
