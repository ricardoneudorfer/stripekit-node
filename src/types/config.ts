import Stripe from 'stripe';
import type { StorageAdapter } from './storage';

export type StripeKitMode = 'api' | 'elements' | 'both';

export interface StripeKitConfig {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
  mode: StripeKitMode;
  timezone?: string;
  apiVersion?: Stripe.LatestApiVersion;
  appInfo?: {
    name: string;
    version?: string;
    url?: string;
  };
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
  storage?: StorageAdapter;
  debug?: boolean;
  maxNetworkRetries?: number;
  timeout?: number;
}

export interface ResolvedStripeKitConfig extends Required<Pick<StripeKitConfig,
  'secretKey' | 'mode' | 'timezone' | 'currency' | 'debug' | 'maxNetworkRetries'>> {
  publishableKey?: string;
  webhookSecret?: string;
  apiVersion?: Stripe.LatestApiVersion;
  appInfo?: StripeKitConfig['appInfo'];
  successUrl?: string;
  cancelUrl?: string;
  storage?: StorageAdapter;
  timeout?: number;
}
