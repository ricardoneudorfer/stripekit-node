export interface StripeKitElementsConfig {
  publishableKey: string;
  clientSecret: string;
  appearance?: {
    theme?: 'stripe' | 'night' | 'flat';
    variables?: Record<string, string>;
  };
  locale?: string;
}

export interface MountPaymentElementOptions {
  containerSelector: string;
  layout?: 'tabs' | 'accordion';
  fields?: {
    billingDetails?: 'auto' | 'never';
  };
}

export interface ConfirmPaymentOptions {
  returnUrl: string;
  receiptEmail?: string;
  redirect?: 'always' | 'if_required';
}

export interface ConfirmPaymentResult {
  success: boolean;
  error?: string;
  paymentIntentId?: string;
  status?: string;
}
