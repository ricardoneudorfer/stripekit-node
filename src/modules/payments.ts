import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { assertMinimumAmount, assertValidCurrency, normalizeEmail } from '../core/validation';
import { toStripeOperationError, ConfigurationError } from '../core/errors';
import type {
  CreatePaymentInput,
  KitPaymentResult,
  PayWithSavedMethodInput,
  KitPaymentRecord,
} from '../types/payment';

function mapPaymentRecord(pi: Stripe.PaymentIntent, userId?: string | number | null): KitPaymentRecord {
  const pm = pi.payment_method;
  const isExpandedCard = typeof pm === 'object' && pm !== null && pm.type === 'card' && pm.card;
  const isExpandedSepa = typeof pm === 'object' && pm !== null && pm.type === 'sepa_debit' && pm.sepa_debit;

  return {
    id: pi.id,
    userId: userId ?? null,
    customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null,
    invoiceId: typeof pi.invoice === 'string' ? pi.invoice : pi.invoice?.id ?? null,
    amount: pi.amount,
    currency: pi.currency,
    status: pi.status,
    description: pi.description,
    paymentMethodType: typeof pm === 'object' && pm !== null ? pm.type : null,
    paymentMethodBrand: isExpandedCard ? pm.card!.brand : null,
    paymentMethodLast4: isExpandedCard ? pm.card!.last4 : isExpandedSepa ? pm.sepa_debit!.last4 : null,
    receiptEmail: pi.receipt_email,
    metadata: pi.metadata ?? {},
    createdAtUtc: new Date(pi.created * 1000).toISOString(),
  };
}

export class PaymentsModule extends BaseModule {
  async create(input: CreatePaymentInput): Promise<KitPaymentResult> {
    const currency = (input.currency ?? this.config.currency).toLowerCase();
    assertValidCurrency(currency);
    assertMinimumAmount(input.amount);

    const flow = input.mode ?? (this.config.mode === 'both' ? 'api' : this.config.mode);
    if (flow !== 'api' && flow !== 'elements') {
      throw new ConfigurationError('Payment flow must resolve to either "api" or "elements". Set `mode` on init or pass `mode` per call.');
    }

    const metadata = { source: 'stripekit', ...(input.metadata ?? {}) };

    try {
      if (flow === 'api') {
        const session = await this.stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: input.amount,
                product_data: { name: input.description ?? 'Payment' },
              },
              quantity: 1,
            },
          ],
          customer: input.customerId,
          customer_email: !input.customerId && input.email ? normalizeEmail(input.email) : undefined,
          metadata,
          payment_intent_data: { metadata },
          success_url: `${this.config.successUrl ?? 'https://example.com/success'}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: this.config.cancelUrl ?? 'https://example.com/cancel',
        });

        return {
          id: session.id,
          mode: 'api',
          status: session.payment_status,
          amount: input.amount,
          currency,
          clientSecret: null,
          hostedUrl: session.url,
          requiresAction: false,
        };
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: input.amount,
        currency,
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        receipt_email: input.receiptEmail ?? (input.email ? normalizeEmail(input.email) : undefined),
        description: input.description,
        statement_descriptor: input.statementDescriptor,
        application_fee_amount: input.applicationFeeAmount,
        capture_method: input.captureMethod ?? 'automatic',
        automatic_payment_methods: input.paymentMethodId ? undefined : { enabled: true },
        confirm: input.confirm ?? Boolean(input.paymentMethodId && input.offSession),
        off_session: input.offSession,
        metadata,
      });

      const record = mapPaymentRecord(paymentIntent, input.userId);
      await this.storage?.savePayment?.(record);

      return {
        id: paymentIntent.id,
        mode: 'elements',
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        clientSecret: paymentIntent.client_secret,
        hostedUrl: null,
        requiresAction: paymentIntent.status === 'requires_action',
      };
    } catch (error) {
      throw toStripeOperationError(error, 'Could not create payment.');
    }
  }

  async retrieve(paymentIntentId: string): Promise<KitPaymentRecord> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['payment_method'],
      });
      return mapPaymentRecord(pi);
    } catch (error) {
      throw toStripeOperationError(error, `Could not retrieve payment "${paymentIntentId}".`);
    }
  }

  async confirm(paymentIntentId: string, paymentMethodId?: string): Promise<KitPaymentRecord> {
    try {
      const pi = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });
      const record = mapPaymentRecord(pi);
      await this.storage?.savePayment?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not confirm payment "${paymentIntentId}".`);
    }
  }

  async cancel(paymentIntentId: string): Promise<KitPaymentRecord> {
    try {
      const pi = await this.stripe.paymentIntents.cancel(paymentIntentId);
      return mapPaymentRecord(pi);
    } catch (error) {
      throw toStripeOperationError(error, `Could not cancel payment "${paymentIntentId}".`);
    }
  }

  async payWithSavedMethod(input: PayWithSavedMethodInput): Promise<KitPaymentResult> {
    try {
      let pi: Stripe.PaymentIntent;

      if (input.paymentIntentId) {
        pi = await this.stripe.paymentIntents.confirm(input.paymentIntentId, {
          payment_method: input.paymentMethodId,
          off_session: true,
          return_url: input.returnUrl,
        });
      } else {
        if (!input.amount || !input.currency) {
          throw new ConfigurationError('`amount` and `currency` are required when no existing paymentIntentId is provided.');
        }
        assertValidCurrency(input.currency);
        assertMinimumAmount(input.amount);

        pi = await this.stripe.paymentIntents.create({
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          customer: input.customerId,
          payment_method: input.paymentMethodId,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          description: input.description,
          confirm: true,
          off_session: true,
          metadata: { source: 'stripekit_saved_method', ...(input.metadata ?? {}) },
        });
      }

      const record = mapPaymentRecord(pi);
      await this.storage?.savePayment?.(record);

      return {
        id: pi.id,
        mode: 'elements',
        status: pi.status,
        amount: pi.amount,
        currency: pi.currency,
        clientSecret: pi.client_secret,
        hostedUrl: null,
        requiresAction: pi.status === 'requires_action',
      };
    } catch (error) {
      throw toStripeOperationError(error, 'Could not charge the saved payment method.');
    }
  }

  async sync(paymentIntentId: string, userId?: string | number): Promise<KitPaymentRecord> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] });
    const record = mapPaymentRecord(pi, userId);
    await this.storage?.savePayment?.(record);
    return record;
  }
}
