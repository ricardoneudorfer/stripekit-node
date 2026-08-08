import type { Stripe as StripeJs, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { createElements } from './loadElements';
import type {
  StripeKitElementsConfig,
  MountPaymentElementOptions,
  ConfirmPaymentOptions,
  ConfirmPaymentResult,
} from './types';

export class PaymentElementController {
  private stripe: StripeJs | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;

  static async create(config: StripeKitElementsConfig): Promise<PaymentElementController> {
    const controller = new PaymentElementController();
    const { stripe, elements } = await createElements(config);
    controller.stripe = stripe;
    controller.elements = elements;
    return controller;
  }

  mount(options: MountPaymentElementOptions): StripePaymentElement {
    if (!this.elements) {
      throw new Error('PaymentElementController is not initialized. Call PaymentElementController.create() first.');
    }

    this.paymentElement = this.elements.create('payment', {
      layout: options.layout ?? 'tabs',
      fields: {
        billingDetails: options.fields?.billingDetails ?? 'auto',
      },
    });

    this.paymentElement.mount(options.containerSelector);
    return this.paymentElement;
  }

  unmount(): void {
    this.paymentElement?.unmount();
    this.paymentElement = null;
  }

  async confirmPayment(options: ConfirmPaymentOptions): Promise<ConfirmPaymentResult> {
    if (!this.stripe || !this.elements) {
      throw new Error('PaymentElementController is not initialized.');
    }

    const confirmParams = {
      return_url: options.returnUrl,
      receipt_email: options.receiptEmail,
    };

    const result =
      options.redirect === 'always'
        ? await this.stripe.confirmPayment({ elements: this.elements, confirmParams, redirect: 'always' })
        : await this.stripe.confirmPayment({ elements: this.elements, confirmParams, redirect: 'if_required' });

    if (result.error) {
      return { success: false, error: result.error.message ?? 'Payment confirmation failed.' };
    }

    const paymentIntent = result.paymentIntent;

    return {
      success: paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing',
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    };
  }

  async confirmSetup(options: ConfirmPaymentOptions): Promise<ConfirmPaymentResult> {
    if (!this.stripe || !this.elements) {
      throw new Error('PaymentElementController is not initialized.');
    }

    const confirmParams = { return_url: options.returnUrl };

    const result =
      options.redirect === 'always'
        ? await this.stripe.confirmSetup({ elements: this.elements, confirmParams, redirect: 'always' })
        : await this.stripe.confirmSetup({ elements: this.elements, confirmParams, redirect: 'if_required' });

    if (result.error) {
      return { success: false, error: result.error.message ?? 'Setup confirmation failed.' };
    }

    const setupIntent = result.setupIntent;

    return {
      success: setupIntent.status === 'succeeded',
      paymentIntentId: setupIntent.id,
      status: setupIntent.status,
    };
  }
}
