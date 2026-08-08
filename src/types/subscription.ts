export type KitSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface CreateSubscriptionInput {
  customerId: string;
  priceId: string;
  userId?: string | number;
  quantity?: number;
  trialPeriodDays?: number;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  daysUntilDue?: number;
  defaultPaymentMethodId?: string;
  promotionCode?: string;
  metadata?: Record<string, string>;
  fieldValues?: Record<string, string>;
}

export interface UpdateSubscriptionFieldsInput {
  subscriptionId: string;
  fieldValues: Record<string, string>;
  schema?: import('./checkout').CheckoutCustomField[];
  intervalDays?: number;
}

export interface KitSubscriptionRecord {
  id: string;
  userId?: string | number | null;
  customerId: string | null;
  priceId: string | null;
  status: KitSubscriptionStatus;
  currentPeriodStartUtc: string | null;
  currentPeriodEndUtc: string | null;
  currentPeriodStartLocal: string | null;
  currentPeriodEndLocal: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAtUtc: string | null;
  trialEndUtc: string | null;
  collectionMethod: string | null;
  metadata: Record<string, string>;
  fieldValues: Record<string, string>;
  createdAtUtc: string;
}

export interface CancelSubscriptionInput {
  subscriptionId: string;
  atPeriodEnd?: boolean;
  cancellationReason?: string;
}

export interface ToggleCollectionMethodInput {
  subscriptionId: string;
  collectionMethod: 'charge_automatically' | 'send_invoice';
  daysUntilDue?: number;
}
