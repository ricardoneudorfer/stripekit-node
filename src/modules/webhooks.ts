import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { WebhookVerificationError, ConfigurationError } from '../core/errors';
import type { ProcessWebhookInput, ProcessWebhookResult, WebhookHandlers } from '../types/webhook';
import type { SubscriptionsModule } from './subscriptions';
import type { PaymentsModule } from './payments';
import type { InvoicesModule } from './invoices';
import type { PaymentMethodsModule } from './paymentMethods';

interface WebhookDependencies {
  subscriptions: SubscriptionsModule;
  payments: PaymentsModule;
  invoices: InvoicesModule;
  paymentMethods: PaymentMethodsModule;
}

const seenEventsFallback = new Set<string>();

export class WebhooksModule extends BaseModule {
  private readonly deps: WebhookDependencies;

  constructor(
    stripe: ConstructorParameters<typeof BaseModule>[0],
    config: ConstructorParameters<typeof BaseModule>[1],
    logger: ConstructorParameters<typeof BaseModule>[2],
    deps: WebhookDependencies,
  ) {
    super(stripe, config, logger);
    this.deps = deps;
  }

  verify(payload: string | Buffer, signature: string): Stripe.Event {
    if (!this.config.webhookSecret) {
      throw new ConfigurationError('`webhookSecret` was not configured. Pass it to StripeKit.init() to verify webhooks.');
    }
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
    } catch (error) {
      throw new WebhookVerificationError('Webhook signature verification failed.', error);
    }
  }

  async process(input: ProcessWebhookInput): Promise<ProcessWebhookResult> {
    const event = this.verify(input.payload, input.signature);

    const alreadySeen = this.storage?.hasProcessedWebhookEvent
      ? await this.storage.hasProcessedWebhookEvent(event.id)
      : seenEventsFallback.has(event.id);

    if (alreadySeen) {
      return { received: true, duplicate: true, eventId: event.id, eventType: event.type };
    }

    if (this.storage?.markWebhookEventProcessed) {
      await this.storage.markWebhookEventProcessed(event.id, event.type);
    } else {
      seenEventsFallback.add(event.id);
      this.logger.warn(
        'No `storage.markWebhookEventProcessed` adapter configured. Webhook idempotency is only tracked in local process memory. Provide a storage adapter for production deployments with multiple instances.',
      );
    }

    const autoSync = input.autoSync ?? true;
    const handlers = input.handlers ?? {};

    try {
      await this.dispatch(event, handlers, autoSync);
    } catch (error) {
      this.logger.error(`Webhook handler threw for event ${event.id} (${event.type}):`, error);
      throw error;
    }

    return { received: true, duplicate: false, eventId: event.id, eventType: event.type };
  }

  private async dispatch(event: Stripe.Event, handlers: WebhookHandlers, autoSync: boolean): Promise<void> {
    const object = event.data.object;
    const context = { event };

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = object as Stripe.PaymentIntent;
        if (autoSync) await this.deps.payments.sync(pi.id);
        await handlers.onPaymentSucceeded?.(pi, context);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = object as Stripe.PaymentIntent;
        if (autoSync) await this.deps.payments.sync(pi.id);
        await handlers.onPaymentFailed?.(pi, context);
        break;
      }
      case 'invoice.created': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.deps.invoices.sync(inv.id);
        await handlers.onInvoiceCreated?.(inv, context);
        break;
      }
      case 'invoice.updated': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.deps.invoices.sync(inv.id);
        await handlers.onInvoiceUpdated?.(inv, context);
        break;
      }
      case 'invoice.paid': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.deps.invoices.sync(inv.id);
        await handlers.onInvoicePaid?.(inv, context);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.deps.invoices.sync(inv.id);
        await handlers.onInvoicePaymentFailed?.(inv, context);
        break;
      }
      case 'invoice.voided': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.deps.invoices.sync(inv.id);
        await handlers.onInvoiceVoided?.(inv, context);
        break;
      }
      case 'invoice.deleted': {
        const inv = object as Stripe.Invoice;
        if (autoSync && inv.id) await this.storage?.markInvoiceDeleted?.(inv.id);
        await handlers.onInvoiceDeleted?.(inv, context);
        break;
      }
      case 'customer.subscription.created': {
        const sub = object as Stripe.Subscription;
        if (autoSync) await this.deps.subscriptions.sync(sub.id);
        await handlers.onSubscriptionCreated?.(sub, context);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = object as Stripe.Subscription;
        if (autoSync) await this.deps.subscriptions.sync(sub.id);
        await handlers.onSubscriptionUpdated?.(sub, context);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = object as Stripe.Subscription;
        if (autoSync) await this.deps.subscriptions.sync(sub.id);
        await handlers.onSubscriptionDeleted?.(sub, context);
        break;
      }
      case 'setup_intent.succeeded': {
        const setupIntent = object as Stripe.SetupIntent;
        const customerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;
        if (autoSync && customerId) await this.deps.paymentMethods.sync(customerId);
        await handlers.onSetupIntentSucceeded?.(setupIntent, context);
        break;
      }
      case 'checkout.session.completed': {
        const session = object as Stripe.Checkout.Session;
        await handlers.onCheckoutSessionCompleted?.(session, context);
        break;
      }
      default: {
        await handlers.onUnhandledEvent?.(object, context);
        break;
      }
    }
  }
}
