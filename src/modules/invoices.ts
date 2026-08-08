import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { toStripeOperationError, ValidationError } from '../core/errors';
import { unixToTimezone, unixToUtcIso, nowUtcIso } from '../core/timezone';
import type { KitInvoiceRecord, KitInvoiceLineItem, PayInvoiceWithSavedMethodInput } from '../types/invoice';
import type { KitPaymentResult } from '../types/payment';

export class InvoicesModule extends BaseModule {
  private mapInvoice(inv: Stripe.Invoice, userId?: string | number | null): KitInvoiceRecord {
    const timezone = this.config.timezone;

    const lineItems: KitInvoiceLineItem[] = inv.lines.data.map((line) => ({
      description: line.description ?? 'Invoice item',
      amount: line.amount ?? 0,
      currency: (line.currency ?? inv.currency ?? this.config.currency) as string,
      quantity: line.quantity ?? 1,
      taxAmount: (line.tax_amounts ?? []).reduce((sum, tax) => sum + (tax.amount ?? 0), 0),
    }));

    const subtotal = inv.subtotal ?? lineItems.reduce((sum, l) => sum + l.amount, 0);
    const taxAmount = inv.tax ?? lineItems.reduce((sum, l) => sum + l.taxAmount, 0);

    const dueAt = unixToTimezone(inv.due_date, timezone);
    const paidAt = unixToTimezone(inv.status_transitions?.paid_at, timezone);
    const issuedAt = unixToTimezone(inv.created, timezone);

    return {
      id: inv.id ?? '',
      userId: userId ?? null,
      customerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null,
      subscriptionId: typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id ?? null,
      paymentIntentId: typeof inv.payment_intent === 'string' ? inv.payment_intent : inv.payment_intent?.id ?? null,
      number: inv.number,
      amountDue: inv.amount_due,
      amountPaid: inv.amount_paid,
      subtotal,
      taxAmount,
      taxRate: null,
      currency: inv.currency,
      status: inv.status ?? 'draft',
      description: inv.description ?? lineItems[0]?.description ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      lineItems,
      dueAtUtc: dueAt.utc,
      paidAtUtc: paidAt.utc,
      issuedAtUtc: issuedAt.utc ?? nowUtcIso(),
      dueAtLocal: dueAt.local,
      paidAtLocal: paidAt.local,
      issuedAtLocal: issuedAt.local ?? nowUtcIso(),
    };
  }

  async retrieve(invoiceId: string, userId?: string | number): Promise<KitInvoiceRecord> {
    try {
      const inv = await this.stripe.invoices.retrieve(invoiceId, {
        expand: ['lines.data', 'payment_intent', 'customer'],
      });
      return this.mapInvoice(inv, userId);
    } catch (error) {
      throw toStripeOperationError(error, `Could not retrieve invoice "${invoiceId}".`);
    }
  }

  async listByCustomer(customerId: string, status?: Stripe.InvoiceListParams.Status): Promise<KitInvoiceRecord[]> {
    try {
      const result = await this.stripe.invoices.list({ customer: customerId, status, limit: 100, expand: ['data.lines.data'] });
      return result.data.map((inv) => this.mapInvoice(inv));
    } catch (error) {
      throw toStripeOperationError(error, `Could not list invoices for customer "${customerId}".`);
    }
  }

  async listBySubscription(subscriptionId: string): Promise<KitInvoiceRecord[]> {
    try {
      const result = await this.stripe.invoices.list({ subscription: subscriptionId, limit: 100, expand: ['data.lines.data'] });
      return result.data.map((inv) => this.mapInvoice(inv));
    } catch (error) {
      throw toStripeOperationError(error, `Could not list invoices for subscription "${subscriptionId}".`);
    }
  }

  async payWithSavedMethod(input: PayInvoiceWithSavedMethodInput): Promise<KitPaymentResult> {
    try {
      const invoice = await this.stripe.invoices.retrieve(input.invoiceId);
      if (invoice.status === 'paid') {
        throw new ValidationError(`Invoice "${input.invoiceId}" is already paid.`);
      }
      if (invoice.status !== 'open') {
        throw new ValidationError(`Invoice "${input.invoiceId}" is not open (status: ${invoice.status}).`);
      }

      const paid = await this.stripe.invoices.pay(input.invoiceId, {
        payment_method: input.paymentMethodId,
        off_session: true,
      });

      const paymentIntentId =
        typeof paid.payment_intent === 'string' ? paid.payment_intent : paid.payment_intent?.id ?? null;

      let status = 'succeeded';
      let clientSecret: string | null = null;
      let requiresAction = false;

      if (paymentIntentId) {
        const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
        status = pi.status;
        clientSecret = pi.client_secret;
        requiresAction = pi.status === 'requires_action';
      }

      return {
        id: paymentIntentId ?? paid.id ?? input.invoiceId,
        mode: 'elements',
        status,
        amount: paid.amount_due,
        currency: paid.currency,
        clientSecret,
        hostedUrl: null,
        requiresAction,
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw toStripeOperationError(error, `Could not pay invoice "${input.invoiceId}" with the saved payment method.`);
    }
  }

  async voidInvoice(invoiceId: string): Promise<KitInvoiceRecord> {
    try {
      const inv = await this.stripe.invoices.voidInvoice(invoiceId);
      return this.mapInvoice(inv);
    } catch (error) {
      throw toStripeOperationError(error, `Could not void invoice "${invoiceId}".`);
    }
  }

  async finalize(invoiceId: string): Promise<KitInvoiceRecord> {
    try {
      const inv = await this.stripe.invoices.finalizeInvoice(invoiceId);
      return this.mapInvoice(inv);
    } catch (error) {
      throw toStripeOperationError(error, `Could not finalize invoice "${invoiceId}".`);
    }
  }

  async sync(invoiceId: string, userId?: string | number): Promise<KitInvoiceRecord> {
    const record = await this.retrieve(invoiceId, userId);
    await this.storage?.saveInvoice?.(record);
    return record;
  }
}
