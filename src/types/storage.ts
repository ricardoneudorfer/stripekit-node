import type { KitCustomerRecord } from './customer';
import type { KitSubscriptionRecord } from './subscription';
import type { KitPaymentRecord } from './payment';
import type { KitInvoiceRecord } from './invoice';
import type { KitPaymentMethodRecord } from './paymentMethod';
import type { KitCouponRecord } from './coupon';

export interface StoredCheckoutSessionData {
  id: string;
  mode: 'payment' | 'subscription';
  flow: 'api' | 'elements';
  amount: number;
  currency: string;
  priceId: string | null;
  description: string | null;
  metadata: Record<string, string>;
  customFields: unknown;
  fieldValues: Record<string, string>;
  email: string | null;
  userId: string | number | null;
  couponCode: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  clientSecret: string | null;
  hostedUrl: string | null;
  status: 'open' | 'complete' | 'expired';
  createdAtUtc: string;
  expiresAtUtc: string;
}

export interface StorageAdapter {
  saveCheckoutSession?(session: StoredCheckoutSessionData): Promise<void>;
  getCheckoutSession?(checkoutId: string): Promise<StoredCheckoutSessionData | null>;

  findUserByEmail?(email: string): Promise<{ id: string | number; stripeCustomerId?: string | null } | null>;
  findUserByStripeCustomerId?(customerId: string): Promise<{ id: string | number; stripeCustomerId?: string | null } | null>;
  findUserById?(id: string | number): Promise<{ id: string | number; stripeCustomerId?: string | null } | null>;

  saveCustomer?(record: KitCustomerRecord): Promise<void>;
  saveSubscription?(record: KitSubscriptionRecord): Promise<void>;
  savePayment?(record: KitPaymentRecord): Promise<void>;
  saveInvoice?(record: KitInvoiceRecord): Promise<void>;
  savePaymentMethods?(userId: string | number, records: KitPaymentMethodRecord[]): Promise<void>;
  saveCoupon?(record: KitCouponRecord): Promise<void>;

  markInvoiceDeleted?(stripeInvoiceId: string): Promise<void>;

  hasProcessedWebhookEvent?(eventId: string): Promise<boolean>;
  markWebhookEventProcessed?(eventId: string, type: string): Promise<void>;
}

export type WebhookEventSeenChecker = (eventId: string) => Promise<boolean>;
export type WebhookEventMarkSeen = (eventId: string, type: string) => Promise<void>;
