export type KitCouponDuration = 'once' | 'repeating' | 'forever';
export type KitCouponDiscountType = 'percent' | 'amount';

export interface CreateCouponInput {
  code: string;
  name?: string;
  discountType: KitCouponDiscountType;
  discountValue: number;
  currency?: string;
  duration?: KitCouponDuration;
  durationInMonths?: number;
  maxRedemptions?: number;
  expiresAt?: string;
}

export interface KitCouponRecord {
  code: string;
  stripeCouponId: string;
  stripePromotionCodeId: string;
  name: string;
  discountType: KitCouponDiscountType;
  discountValue: number;
  currency: string | null;
  duration: KitCouponDuration;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  expiresAtUtc: string | null;
  active: boolean;
  description: string;
}
