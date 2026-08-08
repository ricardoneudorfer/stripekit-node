export interface KitInvoiceLineItem {
  description: string;
  amount: number;
  currency: string;
  quantity: number;
  taxAmount: number;
}

export interface KitInvoiceRecord {
  id: string;
  userId?: string | number | null;
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  subtotal: number;
  taxAmount: number;
  taxRate: number | null;
  currency: string;
  status: string;
  description: string | null;
  hostedInvoiceUrl: string | null;
  lineItems: KitInvoiceLineItem[];
  dueAtUtc: string | null;
  paidAtUtc: string | null;
  issuedAtUtc: string;
  dueAtLocal: string | null;
  paidAtLocal: string | null;
  issuedAtLocal: string;
}

export interface PayInvoiceWithSavedMethodInput {
  invoiceId: string;
  customerId: string;
  paymentMethodId: string;
  returnUrl?: string;
}
