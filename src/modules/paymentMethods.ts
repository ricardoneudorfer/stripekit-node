import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { toStripeOperationError } from '../core/errors';
import type {
  KitPaymentMethodRecord,
  AttachPaymentMethodInput,
  CreateSetupIntentInput,
  KitSetupIntentResult,
} from '../types/paymentMethod';

function mapPaymentMethod(
  pm: Stripe.PaymentMethod,
  defaultId: string | null,
  userId?: string | number | null,
): KitPaymentMethodRecord {
  const isCard = pm.type === 'card' && pm.card;
  const isSepa = pm.type === 'sepa_debit' && pm.sepa_debit;

  return {
    id: pm.id,
    userId: userId ?? null,
    customerId: typeof pm.customer === 'string' ? pm.customer : pm.customer?.id ?? null,
    type: pm.type,
    brand: isCard ? pm.card!.brand : null,
    last4: isCard ? pm.card!.last4 : isSepa ? pm.sepa_debit!.last4 : null,
    expMonth: isCard ? pm.card!.exp_month : null,
    expYear: isCard ? pm.card!.exp_year : null,
    isDefault: defaultId === pm.id,
    createdAtUtc: new Date(pm.created * 1000).toISOString(),
  };
}

export class PaymentMethodsModule extends BaseModule {
  async list(customerId: string, userId?: string | number): Promise<KitPaymentMethodRecord[]> {
    try {
      const [methods, customer] = await Promise.all([
        this.stripe.paymentMethods.list({ customer: customerId, limit: 100 }),
        this.stripe.customers.retrieve(customerId),
      ]);

      let defaultId: string | null = null;
      if (!customer.deleted) {
        const dpm = customer.invoice_settings?.default_payment_method;
        defaultId = typeof dpm === 'string' ? dpm : dpm?.id ?? null;
      }

      const records = methods.data.map((pm) => mapPaymentMethod(pm, defaultId, userId));
      if (userId !== undefined) await this.storage?.savePaymentMethods?.(userId, records);
      return records;
    } catch (error) {
      throw toStripeOperationError(error, `Could not list payment methods for customer "${customerId}".`);
    }
  }

  async attach(input: AttachPaymentMethodInput): Promise<KitPaymentMethodRecord> {
    try {
      const pm = await this.stripe.paymentMethods.attach(input.paymentMethodId, {
        customer: input.customerId,
      });

      if (input.setAsDefault) {
        await this.stripe.customers.update(input.customerId, {
          invoice_settings: { default_payment_method: input.paymentMethodId },
        });
      }

      return mapPaymentMethod(pm, input.setAsDefault ? input.paymentMethodId : null);
    } catch (error) {
      throw toStripeOperationError(error, `Could not attach payment method "${input.paymentMethodId}".`);
    }
  }

  async detach(paymentMethodId: string): Promise<{ id: string; detached: true }> {
    try {
      const pm = await this.stripe.paymentMethods.detach(paymentMethodId);
      return { id: pm.id, detached: true };
    } catch (error) {
      throw toStripeOperationError(error, `Could not detach payment method "${paymentMethodId}".`);
    }
  }

  async setDefault(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (error) {
      throw toStripeOperationError(error, `Could not set default payment method for customer "${customerId}".`);
    }
  }

  async createSetupIntent(input: CreateSetupIntentInput): Promise<KitSetupIntentResult> {
    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: input.customerId,
        usage: input.usage ?? 'off_session',
        automatic_payment_methods: { enabled: true },
        metadata: input.metadata,
      });

      return {
        id: setupIntent.id,
        clientSecret: setupIntent.client_secret,
        status: setupIntent.status,
      };
    } catch (error) {
      throw toStripeOperationError(error, 'Could not create setup intent.');
    }
  }

  async sync(customerId: string, userId?: string | number): Promise<KitPaymentMethodRecord[]> {
    return this.list(customerId, userId);
  }
}
