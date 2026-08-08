import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { toStripeOperationError, ValidationError } from '../core/errors';
import { unixToUtcIso } from '../core/timezone';
import { formatMoney } from '../core/money';
import type { CreateCouponInput, KitCouponRecord } from '../types/coupon';

export class CouponsModule extends BaseModule {
  private describe(record: Omit<KitCouponRecord, 'description'>): string {
    let description =
      record.discountType === 'percent'
        ? `${record.discountValue}% off`
        : `${formatMoney(Math.round(record.discountValue * 100), record.currency ?? this.config.currency)} off`;

    if (record.duration === 'forever') description += ' forever';
    else if (record.duration === 'repeating') description += ` for ${record.durationInMonths} month(s)`;
    else description += ' (first payment)';

    return description;
  }

  async create(input: CreateCouponInput): Promise<KitCouponRecord> {
    const code = input.code.trim().toUpperCase();
    if (!code || input.discountValue <= 0) {
      throw new ValidationError('A coupon `code` and a positive `discountValue` are required.');
    }

    try {
      const stripeParams: Stripe.CouponCreateParams = {
        duration: input.duration ?? 'once',
        name: input.name ?? code,
      };

      if (input.discountType === 'percent') {
        stripeParams.percent_off = input.discountValue;
      } else {
        stripeParams.amount_off = Math.round(input.discountValue * 100);
        stripeParams.currency = (input.currency ?? this.config.currency).toLowerCase();
      }

      if (stripeParams.duration === 'repeating') {
        stripeParams.duration_in_months = input.durationInMonths ?? 1;
      }
      if (input.maxRedemptions) stripeParams.max_redemptions = input.maxRedemptions;

      const coupon = await this.stripe.coupons.create(stripeParams);
      const promotionCode = await this.stripe.promotionCodes.create({
        coupon: coupon.id,
        code,
        expires_at: input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : undefined,
      });

      const record: Omit<KitCouponRecord, 'description'> = {
        code,
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promotionCode.id,
        name: input.name ?? code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        currency: coupon.currency ?? null,
        duration: coupon.duration as KitCouponRecord['duration'],
        durationInMonths: coupon.duration_in_months ?? null,
        maxRedemptions: coupon.max_redemptions ?? null,
        timesRedeemed: coupon.times_redeemed ?? 0,
        expiresAtUtc: unixToUtcIso(promotionCode.expires_at),
        active: true,
      };

      const full: KitCouponRecord = { ...record, description: this.describe(record) };
      await this.storage?.saveCoupon?.(full);
      return full;
    } catch (error) {
      throw toStripeOperationError(error, `Could not create coupon "${code}".`);
    }
  }

  async validate(code: string): Promise<KitCouponRecord | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;

    try {
      const promotionCodes = await this.stripe.promotionCodes.list({
        code: normalized,
        limit: 1,
        expand: ['data.coupon'],
      });

      const promo = promotionCodes.data[0];
      if (!promo || promo.active === false) return null;

      const coupon = promo.coupon;
      if (!coupon) return null;

      const record: Omit<KitCouponRecord, 'description'> = {
        code: normalized,
        stripeCouponId: coupon.id,
        stripePromotionCodeId: promo.id,
        name: coupon.name ?? normalized,
        discountType: coupon.percent_off !== null ? 'percent' : 'amount',
        discountValue: coupon.percent_off ?? Math.round((coupon.amount_off ?? 0) / 100),
        currency: coupon.currency ?? null,
        duration: coupon.duration as KitCouponRecord['duration'],
        durationInMonths: coupon.duration_in_months ?? null,
        maxRedemptions: promo.max_redemptions ?? null,
        timesRedeemed: promo.times_redeemed ?? 0,
        expiresAtUtc: unixToUtcIso(promo.expires_at),
        active: true,
      };

      const full: KitCouponRecord = { ...record, description: this.describe(record) };
      await this.storage?.saveCoupon?.(full);
      return full;
    } catch (error) {
      this.logger.warn(`Coupon validation failed for code "${normalized}":`, error);
      return null;
    }
  }

  async applyToSubscription(subscriptionId: string, stripePromotionCodeId: string): Promise<boolean> {
    try {
      await this.stripe.subscriptions.update(subscriptionId, { promotion_code: stripePromotionCodeId });
      return true;
    } catch (error) {
      throw toStripeOperationError(error, `Could not apply coupon to subscription "${subscriptionId}".`);
    }
  }

  async list(limit = 50): Promise<KitCouponRecord[]> {
    try {
      const result = await this.stripe.promotionCodes.list({ limit, expand: ['data.coupon'] });
      return result.data
        .filter((promo) => promo.coupon)
        .map((promo) => {
          const coupon = promo.coupon;
          const record: Omit<KitCouponRecord, 'description'> = {
            code: promo.code,
            stripeCouponId: coupon.id,
            stripePromotionCodeId: promo.id,
            name: coupon.name ?? promo.code,
            discountType: coupon.percent_off !== null ? 'percent' : 'amount',
            discountValue: coupon.percent_off ?? Math.round((coupon.amount_off ?? 0) / 100),
            currency: coupon.currency ?? null,
            duration: coupon.duration as KitCouponRecord['duration'],
            durationInMonths: coupon.duration_in_months ?? null,
            maxRedemptions: promo.max_redemptions ?? null,
            timesRedeemed: promo.times_redeemed ?? 0,
            expiresAtUtc: unixToUtcIso(promo.expires_at),
            active: promo.active,
          };
          return { ...record, description: this.describe(record) };
        });
    } catch (error) {
      throw toStripeOperationError(error, 'Could not list coupons.');
    }
  }

  async deactivate(stripePromotionCodeId: string): Promise<{ ok: true }> {
    try {
      await this.stripe.promotionCodes.update(stripePromotionCodeId, { active: false });
      return { ok: true };
    } catch (error) {
      throw toStripeOperationError(error, `Could not deactivate promotion code "${stripePromotionCodeId}".`);
    }
  }
}
