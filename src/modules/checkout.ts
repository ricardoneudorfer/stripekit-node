import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { assertMinimumAmount, assertValidCurrency, assertValidEmail, normalizeEmail, validateCustomFieldSchema } from '../core/validation';
import { toStripeOperationError, ValidationError, NotFoundError, ConfigurationError } from '../core/errors';
import { generateCheckoutId, randomToken, hashToken } from '../core/tokens';
import { addDaysUtcIso, nowUtcIso } from '../core/timezone';
import type {
  CreateCheckoutInput,
  KitCheckoutResult,
  ApplyCouponToCheckoutInput,
  ApplyCouponResult,
  CheckoutCustomField,
} from '../types/checkout';
import type { CouponsModule } from './coupons';
import type { StoredCheckoutSessionData } from '../types/storage';

const inMemoryFallbackStore = new Map<string, StoredCheckoutSessionData>();

export class CheckoutModule extends BaseModule {
  private coupons?: CouponsModule;

  attachCouponsModule(coupons: CouponsModule): void {
    this.coupons = coupons;
  }

  private async persistSession(session: StoredCheckoutSessionData): Promise<void> {
    if (this.storage?.saveCheckoutSession) {
      await this.storage.saveCheckoutSession(session);
    } else {
      inMemoryFallbackStore.set(session.id, session);
      this.logger.warn(
        'No `storage.saveCheckoutSession` adapter configured. Checkout sessions are held in local process memory and will not survive a restart or work across multiple instances. Provide a storage adapter for production deployments.',
      );
    }
  }

  private async loadSession(checkoutId: string): Promise<StoredCheckoutSessionData | null> {
    if (this.storage?.getCheckoutSession) {
      return this.storage.getCheckoutSession(checkoutId);
    }
    return inMemoryFallbackStore.get(checkoutId) ?? null;
  }

  private resolveFlow(override?: 'api' | 'elements'): 'api' | 'elements' {
    if (override) return override;
    if (this.config.mode === 'both') return 'api';
    return this.config.mode;
  }

  async create(input: CreateCheckoutInput): Promise<KitCheckoutResult> {
    if (input.mode !== 'payment' && input.mode !== 'subscription') {
      throw new ValidationError('Checkout `mode` must be "payment" or "subscription".');
    }

    const flow = this.resolveFlow(input.flowOverride);
    const currency = (input.currency ?? this.config.currency).toLowerCase();
    assertValidCurrency(currency);

    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (email) assertValidEmail(email);

    let customerId: string | undefined;
    let storedUser: { id: string | number; stripeCustomerId?: string | null } | null = null;

    if (input.userId !== undefined) {
      storedUser = (await this.storage?.findUserById?.(input.userId)) ?? null;
      customerId = storedUser?.stripeCustomerId ?? undefined;
    } else if (email) {
      storedUser = (await this.storage?.findUserByEmail?.(email)) ?? null;
      customerId = storedUser?.stripeCustomerId ?? undefined;
    }

    if (!customerId && email) {
      const customer = await this.stripe.customers.create({
        email,
        metadata: { source: 'stripekit_guest_checkout' },
      });
      customerId = customer.id;
    }

    const fieldSchema: CheckoutCustomField[] = input.customFields ?? [];
    let fieldValues: Record<string, string> = {};

    if (input.fieldValues && fieldSchema.length > 0) {
      const { values, errors } = validateCustomFieldSchema(fieldSchema, input.fieldValues);
      if (Object.keys(errors).length > 0) {
        throw new ValidationError('Custom field validation failed.', errors);
      }
      fieldValues = values;
    }

    const checkoutId = generateCheckoutId();
    const metadata: Record<string, string> = { source: 'stripekit_checkout', checkout_id: checkoutId, ...(input.metadata ?? {}) };
    for (const [key, value] of Object.entries(fieldValues)) metadata[`field_${key}`] = value;

    let result: KitCheckoutResult;

    try {
      if (input.mode === 'subscription') {
        if (!input.priceId) throw new ValidationError('Subscriptions require a `priceId`.');
        if (!customerId) throw new ValidationError('Subscriptions require an `email` or an existing `userId` with a Stripe customer.');

        if (flow === 'api') {
          const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: input.priceId, quantity: 1 }],
            metadata,
            subscription_data: { metadata },
            discounts: input.couponCode ? [{ promotion_code: await this.resolvePromotionCodeId(input.couponCode) }] : undefined,
            success_url: `${input.successUrl ?? this.config.successUrl ?? 'https://example.com/success'}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: input.cancelUrl ?? this.config.cancelUrl ?? 'https://example.com/cancel',
          });

          result = {
            id: session.id,
            mode: 'subscription',
            flow: 'api',
            clientSecret: null,
            hostedUrl: session.url,
            paymentIntentId: null,
            subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            amount: 0,
            currency,
            requiresFields: fieldSchema.length > 0 && Object.keys(fieldValues).length === 0,
            fieldSchema,
            expiresAtUtc: addDaysUtcIso(nowUtcIso(), 1),
          };
        } else {
          if (!input.amount) throw new ValidationError('An initial `amount` is required to open a subscription in Elements mode.');
          assertMinimumAmount(input.amount);

          const paymentIntent = await this.stripe.paymentIntents.create({
            amount: input.amount,
            currency,
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            description: input.description ?? 'Subscription setup',
            setup_future_usage: 'off_session',
            metadata,
          });

          result = {
            id: checkoutId,
            mode: 'subscription',
            flow: 'elements',
            clientSecret: paymentIntent.client_secret,
            hostedUrl: null,
            paymentIntentId: paymentIntent.id,
            subscriptionId: null,
            amount: input.amount,
            currency,
            requiresFields: fieldSchema.length > 0 && Object.keys(fieldValues).length === 0,
            fieldSchema,
            expiresAtUtc: addDaysUtcIso(nowUtcIso(), 1),
          };
        }
      } else {
        if (!input.amount) throw new ValidationError('Payment checkouts require an `amount` in minor currency units.');
        assertMinimumAmount(input.amount);

        if (flow === 'api') {
          const session = await this.stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            customer_email: !customerId && email ? email : undefined,
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
            metadata,
            payment_intent_data: { metadata },
            discounts: input.couponCode ? [{ promotion_code: await this.resolvePromotionCodeId(input.couponCode) }] : undefined,
            success_url: `${input.successUrl ?? this.config.successUrl ?? 'https://example.com/success'}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: input.cancelUrl ?? this.config.cancelUrl ?? 'https://example.com/cancel',
          });

          result = {
            id: session.id,
            mode: 'payment',
            flow: 'api',
            clientSecret: null,
            hostedUrl: session.url,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            subscriptionId: null,
            amount: input.amount,
            currency,
            requiresFields: fieldSchema.length > 0 && Object.keys(fieldValues).length === 0,
            fieldSchema,
            expiresAtUtc: addDaysUtcIso(nowUtcIso(), 1),
          };
        } else {
          const paymentIntent = await this.stripe.paymentIntents.create({
            amount: input.amount,
            currency,
            customer: customerId,
            receipt_email: email,
            description: input.description,
            automatic_payment_methods: { enabled: true },
            metadata,
          });

          result = {
            id: checkoutId,
            mode: 'payment',
            flow: 'elements',
            clientSecret: paymentIntent.client_secret,
            hostedUrl: null,
            paymentIntentId: paymentIntent.id,
            subscriptionId: null,
            amount: input.amount,
            currency,
            requiresFields: fieldSchema.length > 0 && Object.keys(fieldValues).length === 0,
            fieldSchema,
            expiresAtUtc: addDaysUtcIso(nowUtcIso(), 1),
          };
        }
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw toStripeOperationError(error, 'Could not create checkout.');
    }

    await this.persistSession({
      id: checkoutId,
      mode: input.mode,
      flow,
      amount: result.amount,
      currency,
      priceId: input.priceId ?? null,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      customFields: fieldSchema,
      fieldValues,
      email: email ?? null,
      userId: input.userId ?? storedUser?.id ?? null,
      couponCode: input.couponCode ?? null,
      stripePaymentIntentId: result.paymentIntentId,
      stripeSubscriptionId: result.subscriptionId,
      clientSecret: result.clientSecret,
      hostedUrl: result.hostedUrl,
      status: 'open',
      createdAtUtc: nowUtcIso(),
      expiresAtUtc: result.expiresAtUtc,
    });

    return result;
  }

  async get(checkoutId: string): Promise<KitCheckoutResult & { fieldValues: Record<string, string>; status: string }> {
    const session = await this.loadSession(checkoutId);
    if (!session) throw new NotFoundError(`Checkout session "${checkoutId}" was not found.`);

    return {
      id: session.id,
      mode: session.mode,
      flow: session.flow,
      clientSecret: session.clientSecret,
      hostedUrl: session.hostedUrl,
      paymentIntentId: session.stripePaymentIntentId,
      subscriptionId: session.stripeSubscriptionId,
      amount: session.amount,
      currency: session.currency,
      requiresFields: (session.customFields as CheckoutCustomField[]).length > 0 && Object.keys(session.fieldValues).length === 0,
      fieldSchema: session.customFields as CheckoutCustomField[],
      expiresAtUtc: session.expiresAtUtc,
      fieldValues: session.fieldValues,
      status: session.status,
    };
  }

  async submitFields(checkoutId: string, submitted: Record<string, string>): Promise<Record<string, string>> {
    const session = await this.loadSession(checkoutId);
    if (!session) throw new NotFoundError(`Checkout session "${checkoutId}" was not found.`);
    if (session.status !== 'open') throw new ValidationError('This checkout session is no longer open.');

    const { values, errors } = validateCustomFieldSchema(session.customFields as CheckoutCustomField[], submitted);
    if (Object.keys(errors).length > 0) throw new ValidationError('Custom field validation failed.', errors);

    session.fieldValues = values;

    const metadataPatch: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) metadataPatch[`field_${key}`] = value;

    try {
      if (session.stripePaymentIntentId) {
        await this.stripe.paymentIntents.update(session.stripePaymentIntentId, { metadata: metadataPatch });
      } else if (session.stripeSubscriptionId) {
        await this.stripe.subscriptions.update(session.stripeSubscriptionId, { metadata: metadataPatch });
      }
    } catch {
    }

    await this.persistSession(session);
    return values;
  }

  private async resolvePromotionCodeId(code: string): Promise<string> {
    if (!this.coupons) throw new ConfigurationError('Coupons module is not attached to Checkout module.');
    const coupon = await this.coupons.validate(code);
    if (!coupon) throw new ValidationError(`Coupon code "${code}" is invalid or expired.`);
    return coupon.stripePromotionCodeId;
  }

  async applyCoupon(input: ApplyCouponToCheckoutInput): Promise<ApplyCouponResult> {
    const session = await this.loadSession(input.checkoutId);
    if (!session) throw new NotFoundError(`Checkout session "${input.checkoutId}" was not found.`);

    if (!input.couponCode) {
      session.couponCode = null;
      if (session.stripePaymentIntentId) {
        const pi = await this.stripe.paymentIntents.update(session.stripePaymentIntentId, {
          amount: input.originalAmount,
        });
        session.amount = input.originalAmount;
        session.clientSecret = pi.client_secret;
        await this.persistSession(session);
        return { newAmount: input.originalAmount, isFree: false, clientSecret: pi.client_secret };
      }
      await this.persistSession(session);
      return { newAmount: input.originalAmount, isFree: false, clientSecret: session.clientSecret };
    }

    if (!this.coupons) throw new ConfigurationError('Coupons module is not attached to Checkout module.');
    const coupon = await this.coupons.validate(input.couponCode);
    if (!coupon) throw new ValidationError(`Coupon code "${input.couponCode}" is invalid or expired.`);

    const newAmount =
      coupon.discountType === 'percent'
        ? Math.max(0, Math.round(input.originalAmount * (1 - coupon.discountValue / 100)))
        : Math.max(0, input.originalAmount - Math.round(coupon.discountValue * 100));

    session.couponCode = input.couponCode;

    if (newAmount === 0) {
      session.amount = 0;
      await this.persistSession(session);
      return { newAmount: 0, isFree: true, clientSecret: null };
    }

    if (!session.stripePaymentIntentId) throw new ValidationError('This checkout session has no active payment intent to discount.');

    const pi = await this.stripe.paymentIntents.update(session.stripePaymentIntentId, { amount: newAmount });
    session.amount = newAmount;
    session.clientSecret = pi.client_secret;
    await this.persistSession(session);

    return { newAmount, isFree: false, clientSecret: pi.client_secret };
  }

  async markComplete(checkoutId: string): Promise<void> {
    const session = await this.loadSession(checkoutId);
    if (session) {
      session.status = 'complete';
      await this.persistSession(session);
    }
  }

  createGuestClaimToken(email: string): { token: string; hashedToken: string } {
    const token = randomToken(32);
    return { token, hashedToken: hashToken(token) };
  }
}
