import type Stripe from 'stripe';

export interface WebhookHandlerContext {
  event: Stripe.Event;
}

export type WebhookHandler<T = unknown> = (object: T, context: WebhookHandlerContext) => Promise<void> | void;

export interface WebhookHandlers {
  onPaymentSucceeded?: WebhookHandler<Stripe.PaymentIntent>;
  onPaymentFailed?: WebhookHandler<Stripe.PaymentIntent>;
  onInvoiceCreated?: WebhookHandler<Stripe.Invoice>;
  onInvoiceUpdated?: WebhookHandler<Stripe.Invoice>;
  onInvoicePaid?: WebhookHandler<Stripe.Invoice>;
  onInvoicePaymentFailed?: WebhookHandler<Stripe.Invoice>;
  onInvoiceVoided?: WebhookHandler<Stripe.Invoice>;
  onInvoiceDeleted?: WebhookHandler<Stripe.Invoice>;
  onSubscriptionCreated?: WebhookHandler<Stripe.Subscription>;
  onSubscriptionUpdated?: WebhookHandler<Stripe.Subscription>;
  onSubscriptionDeleted?: WebhookHandler<Stripe.Subscription>;
  onSetupIntentSucceeded?: WebhookHandler<Stripe.SetupIntent>;
  onCheckoutSessionCompleted?: WebhookHandler<Stripe.Checkout.Session>;
  onUnhandledEvent?: WebhookHandler<unknown>;
}

export interface ProcessWebhookInput {
  payload: string | Buffer;
  signature: string;
  handlers?: WebhookHandlers;
  autoSync?: boolean;
}

export interface ProcessWebhookResult {
  received: boolean;
  duplicate: boolean;
  eventId: string;
  eventType: string;
}
