export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  email?: string;
  userId?: string | number;
  description?: string;
  metadata?: Record<string, string>;
  paymentMethodId?: string;
  receiptEmail?: string;
  offSession?: boolean;
  confirm?: boolean;
  captureMethod?: 'automatic' | 'manual';
  statementDescriptor?: string;
  applicationFeeAmount?: number;
  returnUrl?: string;
  mode?: 'api' | 'elements';
}

export interface KitPaymentResult {
  id: string;
  mode: 'api' | 'elements';
  status: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  hostedUrl: string | null;
  requiresAction: boolean;
}

export interface PayWithSavedMethodInput {
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
  customerId: string;
  paymentMethodId: string;
  description?: string;
  metadata?: Record<string, string>;
  returnUrl?: string;
}

export interface KitPaymentRecord {
  id: string;
  userId?: string | number | null;
  customerId: string | null;
  invoiceId: string | null;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  paymentMethodType: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  receiptEmail: string | null;
  metadata: Record<string, string>;
  createdAtUtc: string;
}
