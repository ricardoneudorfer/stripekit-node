export type KitPaymentMethodType =
  | 'card'
  | 'sepa_debit'
  | 'ideal'
  | 'bancontact'
  | 'sofort'
  | 'us_bank_account'
  | 'link'
  | 'paypal'
  | string;

export interface KitPaymentMethodRecord {
  id: string;
  userId?: string | number | null;
  customerId: string | null;
  type: KitPaymentMethodType;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAtUtc: string;
}

export interface AttachPaymentMethodInput {
  paymentMethodId: string;
  customerId: string;
  setAsDefault?: boolean;
}

export interface CreateSetupIntentInput {
  customerId: string;
  usage?: 'on_session' | 'off_session';
  metadata?: Record<string, string>;
}

export interface KitSetupIntentResult {
  id: string;
  clientSecret: string | null;
  status: string;
}
