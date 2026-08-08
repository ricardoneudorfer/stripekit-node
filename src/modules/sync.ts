import { BaseModule } from '../core/BaseModule';
import type { CustomersModule } from './customers';
import type { SubscriptionsModule } from './subscriptions';
import type { PaymentsModule } from './payments';
import type { InvoicesModule } from './invoices';
import type { PaymentMethodsModule } from './paymentMethods';
import type { KitCustomerRecord } from '../types/customer';
import type { KitSubscriptionRecord } from '../types/subscription';
import type { KitPaymentRecord } from '../types/payment';
import type { KitInvoiceRecord } from '../types/invoice';
import type { KitPaymentMethodRecord } from '../types/paymentMethod';

interface SyncDependencies {
  customers: CustomersModule;
  subscriptions: SubscriptionsModule;
  payments: PaymentsModule;
  invoices: InvoicesModule;
  paymentMethods: PaymentMethodsModule;
}

export class SyncModule extends BaseModule {
  private readonly customers: CustomersModule;
  private readonly subscriptions: SubscriptionsModule;
  private readonly payments: PaymentsModule;
  private readonly invoices: InvoicesModule;
  private readonly paymentMethods: PaymentMethodsModule;

  constructor(stripe: ConstructorParameters<typeof BaseModule>[0], config: ConstructorParameters<typeof BaseModule>[1], logger: ConstructorParameters<typeof BaseModule>[2], deps: SyncDependencies) {
    super(stripe, config, logger);
    this.customers = deps.customers;
    this.subscriptions = deps.subscriptions;
    this.payments = deps.payments;
    this.invoices = deps.invoices;
    this.paymentMethods = deps.paymentMethods;
  }

  async customer(customerId: string): Promise<KitCustomerRecord> {
    return this.customers.sync(customerId);
  }

  async subscription(subscriptionId: string, userId?: string | number): Promise<KitSubscriptionRecord> {
    return this.subscriptions.sync(subscriptionId, userId);
  }

  async payment(paymentIntentId: string, userId?: string | number): Promise<KitPaymentRecord> {
    return this.payments.sync(paymentIntentId, userId);
  }

  async invoice(invoiceId: string, userId?: string | number): Promise<KitInvoiceRecord> {
    return this.invoices.sync(invoiceId, userId);
  }

  async paymentMethods_(customerId: string, userId?: string | number): Promise<KitPaymentMethodRecord[]> {
    return this.paymentMethods.sync(customerId, userId);
  }

  async everythingForCustomer(customerId: string, userId?: string | number): Promise<{
    customer: KitCustomerRecord;
    subscriptions: KitSubscriptionRecord[];
    invoices: KitInvoiceRecord[];
    paymentMethods: KitPaymentMethodRecord[];
  }> {
    const [customer, subscriptions, invoices, methods] = await Promise.all([
      this.customers.sync(customerId),
      this.subscriptions.listByCustomer(customerId),
      this.invoices.listByCustomer(customerId),
      this.paymentMethods.sync(customerId, userId),
    ]);

    for (const sub of subscriptions) await this.storage?.saveSubscription?.(sub);
    for (const inv of invoices) await this.storage?.saveInvoice?.(inv);

    return { customer, subscriptions, invoices, paymentMethods: methods };
  }
}
