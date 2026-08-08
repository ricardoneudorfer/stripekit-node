import { loadStripe, type Stripe as StripeJs, type StripeElements } from '@stripe/stripe-js';
import type { StripeKitElementsConfig } from './types';

let cachedStripePromise: Promise<StripeJs | null> | null = null;

export function loadStripeKitJs(publishableKey: string): Promise<StripeJs | null> {
  if (!cachedStripePromise) {
    cachedStripePromise = loadStripe(publishableKey);
  }
  return cachedStripePromise;
}

export async function createElements(config: StripeKitElementsConfig): Promise<{
  stripe: StripeJs;
  elements: StripeElements;
}> {
  const stripe = await loadStripeKitJs(config.publishableKey);
  if (!stripe) {
    throw new Error('Stripe.js failed to load. Check your publishable key and network connection.');
  }

  const elements = stripe.elements({
    clientSecret: config.clientSecret,
    appearance: config.appearance,
    locale: config.locale as never,
  });

  return { stripe, elements };
}
