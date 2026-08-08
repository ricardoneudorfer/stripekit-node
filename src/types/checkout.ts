export type CheckoutFieldType = 'text' | 'email' | 'number' | 'url' | 'textarea';

export interface CheckoutCustomField {
  key: string;
  label: string;
  type?: CheckoutFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  pattern?: string;
  patternHint?: string;
}

export interface CreateCheckoutInput {
  mode: 'payment' | 'subscription';
  amount?: number;
  currency?: string;
  priceId?: string;
  email?: string;
  userId?: string | number;
  description?: string;
  metadata?: Record<string, string>;
  customFields?: CheckoutCustomField[];
  fieldValues?: Record<string, string>;
  successUrl?: string;
  cancelUrl?: string;
  couponCode?: string;
  flowOverride?: 'api' | 'elements';
}

export interface KitCheckoutResult {
  id: string;
  mode: 'payment' | 'subscription';
  flow: 'api' | 'elements';
  clientSecret: string | null;
  hostedUrl: string | null;
  paymentIntentId: string | null;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  requiresFields: boolean;
  fieldSchema: CheckoutCustomField[];
  expiresAtUtc: string;
}

export interface ApplyCouponToCheckoutInput {
  checkoutId: string;
  couponCode: string | null;
  originalAmount: number;
  paymentIntentId?: string | null;
}

export interface ApplyCouponResult {
  newAmount: number;
  isFree: boolean;
  clientSecret: string | null;
}
