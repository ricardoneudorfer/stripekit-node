import Stripe from 'stripe';
import type { ResolvedStripeKitConfig } from '../types/config';
import type { StorageAdapter } from '../types/storage';
import { KitLogger } from './logger';

export class BaseModule {
  protected readonly stripe: Stripe;
  protected readonly config: ResolvedStripeKitConfig;
  protected readonly storage?: StorageAdapter;
  protected readonly logger: KitLogger;

  constructor(stripe: Stripe, config: ResolvedStripeKitConfig, logger: KitLogger) {
    this.stripe = stripe;
    this.config = config;
    this.storage = config.storage;
    this.logger = logger;
  }
}
