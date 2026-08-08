import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { toStripeOperationError, ValidationError } from '../core/errors';
import { unixToTimezone, unixToUtcIso, addDaysUtcIso, nowUtcIso } from '../core/timezone';
import { validateCustomFieldSchema } from '../core/validation';
import type {
  CreateSubscriptionInput,
  KitSubscriptionRecord,
  CancelSubscriptionInput,
  ToggleCollectionMethodInput,
  UpdateSubscriptionFieldsInput,
} from '../types/subscription';

function extractFieldValuesFromMetadata(metadata: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('field_')) out[key.slice(6)] = value;
  }
  return out;
}

export class SubscriptionsModule extends BaseModule {
  private mapSubscription(sub: Stripe.Subscription, userId?: string | number | null): KitSubscriptionRecord {
    const item = sub.items.data[0];
    const timezone = this.config.timezone;

    const periodStart = unixToTimezone(sub.current_period_start, timezone);
    const periodEnd = unixToTimezone(sub.current_period_end, timezone);

    return {
      id: sub.id,
      userId: userId ?? null,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
      priceId: item?.price?.id ?? null,
      status: sub.status,
      currentPeriodStartUtc: periodStart.utc,
      currentPeriodEndUtc: periodEnd.utc,
      currentPeriodStartLocal: periodStart.local,
      currentPeriodEndLocal: periodEnd.local,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAtUtc: unixToUtcIso(sub.canceled_at),
      trialEndUtc: unixToUtcIso(sub.trial_end),
      collectionMethod: sub.collection_method ?? null,
      metadata: sub.metadata ?? {},
      fieldValues: extractFieldValuesFromMetadata(sub.metadata ?? {}),
      createdAtUtc: unixToUtcIso(sub.created) ?? nowUtcIso(),
    };
  }

  async create(input: CreateSubscriptionInput): Promise<KitSubscriptionRecord> {
    const metadata: Record<string, string> = { source: 'stripekit', ...(input.metadata ?? {}) };
    for (const [key, value] of Object.entries(input.fieldValues ?? {})) metadata[`field_${key}`] = value;

    try {
      const sub = await this.stripe.subscriptions.create({
        customer: input.customerId,
        items: [{ price: input.priceId, quantity: input.quantity ?? 1 }],
        trial_period_days: input.trialPeriodDays,
        collection_method: input.collectionMethod ?? 'charge_automatically',
        days_until_due: input.collectionMethod === 'send_invoice' ? input.daysUntilDue ?? 7 : undefined,
        default_payment_method: input.defaultPaymentMethodId,
        promotion_code: input.promotionCode,
        metadata,
        expand: ['items.data'],
      });

      const record = this.mapSubscription(sub, input.userId);
      await this.storage?.saveSubscription?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, 'Could not create subscription.');
    }
  }

  async retrieve(subscriptionId: string, userId?: string | number): Promise<KitSubscriptionRecord> {
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data'] });
      return this.mapSubscription(sub, userId);
    } catch (error) {
      throw toStripeOperationError(error, `Could not retrieve subscription "${subscriptionId}".`);
    }
  }

  async cancel(input: CancelSubscriptionInput): Promise<KitSubscriptionRecord> {
    try {
      const sub = input.atPeriodEnd
        ? await this.stripe.subscriptions.update(input.subscriptionId, {
            cancel_at_period_end: true,
            cancellation_details: input.cancellationReason ? { comment: input.cancellationReason } : undefined,
          })
        : await this.stripe.subscriptions.cancel(input.subscriptionId, {
            cancellation_details: input.cancellationReason ? { comment: input.cancellationReason } : undefined,
          });

      const record = this.mapSubscription(sub);
      await this.storage?.saveSubscription?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not cancel subscription "${input.subscriptionId}".`);
    }
  }

  async resume(subscriptionId: string): Promise<KitSubscriptionRecord> {
    try {
      const sub = await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      const record = this.mapSubscription(sub);
      await this.storage?.saveSubscription?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not resume subscription "${subscriptionId}".`);
    }
  }

  async toggleCollectionMethod(input: ToggleCollectionMethodInput): Promise<KitSubscriptionRecord> {
    try {
      const sub = await this.stripe.subscriptions.update(input.subscriptionId, {
        collection_method: input.collectionMethod,
        days_until_due: input.collectionMethod === 'send_invoice' ? input.daysUntilDue ?? 7 : undefined,
      });
      const record = this.mapSubscription(sub);
      await this.storage?.saveSubscription?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not update collection method for subscription "${input.subscriptionId}".`);
    }
  }

  async updateFields(input: UpdateSubscriptionFieldsInput): Promise<{ fieldValues: Record<string, string>; nextUpdateAvailableAtUtc: string }> {
    if (input.schema) {
      const { values, errors } = validateCustomFieldSchema(input.schema, input.fieldValues);
      if (Object.keys(errors).length > 0) throw new ValidationError('Custom field validation failed.', errors);
      input = { ...input, fieldValues: values };
    }

    const metadataPatch: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.fieldValues)) metadataPatch[`field_${key}`] = value;

    try {
      const sub = await this.stripe.subscriptions.update(input.subscriptionId, { metadata: metadataPatch });
      const record = this.mapSubscription(sub);
      await this.storage?.saveSubscription?.(record);

      return {
        fieldValues: input.fieldValues,
        nextUpdateAvailableAtUtc: addDaysUtcIso(nowUtcIso(), input.intervalDays ?? 30),
      };
    } catch (error) {
      throw toStripeOperationError(error, `Could not update custom fields for subscription "${input.subscriptionId}".`);
    }
  }

  async applyPromotionCode(subscriptionId: string, stripePromotionCodeId: string): Promise<KitSubscriptionRecord> {
    try {
      const sub = await this.stripe.subscriptions.update(subscriptionId, { promotion_code: stripePromotionCodeId });
      const record = this.mapSubscription(sub);
      await this.storage?.saveSubscription?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not apply promotion code to subscription "${subscriptionId}".`);
    }
  }

  async listByCustomer(customerId: string, status?: Stripe.SubscriptionListParams.Status): Promise<KitSubscriptionRecord[]> {
    try {
      const result = await this.stripe.subscriptions.list({ customer: customerId, status, expand: ['data.items.data'] });
      return result.data.map((sub) => this.mapSubscription(sub));
    } catch (error) {
      throw toStripeOperationError(error, `Could not list subscriptions for customer "${customerId}".`);
    }
  }

  async findByMetadata(key: string, value: string): Promise<KitSubscriptionRecord | null> {
    try {
      const result = await this.stripe.subscriptions.search({
        query: `metadata['${key}']:'${value}' AND status:'active'`,
        limit: 1,
      });
      const match = result.data[0];
      return match ? this.mapSubscription(match) : null;
    } catch (error) {
      throw toStripeOperationError(error, `Could not search subscriptions by metadata "${key}".`);
    }
  }

  async sync(subscriptionId: string, userId?: string | number): Promise<KitSubscriptionRecord> {
    const record = await this.retrieve(subscriptionId, userId);
    await this.storage?.saveSubscription?.(record);
    return record;
  }
}
