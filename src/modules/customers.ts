import Stripe from 'stripe';
import { BaseModule } from '../core/BaseModule';
import { assertValidEmail, normalizeEmail } from '../core/validation';
import { toStripeOperationError, NotFoundError } from '../core/errors';
import { nowUtcIso } from '../core/timezone';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  KitCustomerRecord,
} from '../types/customer';

function mapAddress(address?: Stripe.Address | null) {
  if (!address) return null;
  return {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postal_code,
    country: address.country,
  };
}

function mapCustomer(customer: Stripe.Customer, userId?: string | number | null): KitCustomerRecord {
  return {
    id: customer.id,
    userId: userId ?? null,
    email: customer.email,
    name: customer.name ?? null,
    phone: customer.phone ?? null,
    description: customer.description ?? null,
    address: mapAddress(customer.address),
    defaultPaymentMethodId:
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id ?? null,
    metadata: customer.metadata ?? {},
    createdAtUtc: new Date(customer.created * 1000).toISOString(),
    deleted: false,
  };
}

export class CustomersModule extends BaseModule {
  async create(input: CreateCustomerInput): Promise<KitCustomerRecord> {
    assertValidEmail(input.email);
    const email = normalizeEmail(input.email);

    try {
      const customer = await this.stripe.customers.create({
        email,
        name: input.name,
        phone: input.phone,
        description: input.description,
        address: input.address
          ? {
              line1: input.address.line1 ?? undefined,
              line2: input.address.line2 ?? undefined,
              city: input.address.city ?? undefined,
              state: input.address.state ?? undefined,
              postal_code: input.address.postalCode ?? undefined,
              country: input.address.country ?? undefined,
            }
          : undefined,
        tax_id_data: input.taxId ? [{ type: 'eu_vat', value: input.taxId }] : undefined,
        metadata: { source: 'stripekit', ...(input.metadata ?? {}) },
      });

      const record = mapCustomer(customer, input.userId);
      await this.storage?.saveCustomer?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, 'Could not create Stripe customer.');
    }
  }

  async findOrCreateByEmail(email: string, extra: Omit<CreateCustomerInput, 'email'> = {}): Promise<KitCustomerRecord> {
    const normalized = normalizeEmail(email);
    const existingUser = await this.storage?.findUserByEmail?.(normalized);

    if (existingUser?.stripeCustomerId) {
      return this.retrieve(existingUser.stripeCustomerId);
    }

    const existing = await this.stripe.customers.list({ email: normalized, limit: 1 });
    if (existing.data.length > 0) {
      return mapCustomer(existing.data[0], existingUser?.id);
    }

    return this.create({ email: normalized, userId: existingUser?.id, ...extra });
  }

  async retrieve(customerId: string): Promise<KitCustomerRecord> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        throw new NotFoundError(`Customer "${customerId}" has been deleted in Stripe.`);
      }
      return mapCustomer(customer as Stripe.Customer);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw toStripeOperationError(error, `Could not retrieve customer "${customerId}".`);
    }
  }

  async update(customerId: string, input: UpdateCustomerInput): Promise<KitCustomerRecord> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        email: input.email ? normalizeEmail(input.email) : undefined,
        name: input.name,
        phone: input.phone,
        description: input.description,
        address: input.address
          ? {
              line1: input.address.line1 ?? undefined,
              line2: input.address.line2 ?? undefined,
              city: input.address.city ?? undefined,
              state: input.address.state ?? undefined,
              postal_code: input.address.postalCode ?? undefined,
              country: input.address.country ?? undefined,
            }
          : undefined,
        invoice_settings: input.defaultPaymentMethodId
          ? { default_payment_method: input.defaultPaymentMethodId }
          : undefined,
        metadata: input.metadata,
      });

      const record = mapCustomer(customer);
      await this.storage?.saveCustomer?.(record);
      return record;
    } catch (error) {
      throw toStripeOperationError(error, `Could not update customer "${customerId}".`);
    }
  }

  async delete(customerId: string): Promise<{ id: string; deleted: true }> {
    try {
      const result = await this.stripe.customers.del(customerId);
      await this.storage?.saveCustomer?.({
        id: customerId,
        userId: null,
        email: null,
        name: null,
        phone: null,
        description: null,
        address: null,
        defaultPaymentMethodId: null,
        metadata: {},
        createdAtUtc: nowUtcIso(),
        deleted: true,
      });
      return { id: result.id, deleted: true };
    } catch (error) {
      throw toStripeOperationError(error, `Could not delete customer "${customerId}".`);
    }
  }

  async list(params: { email?: string; limit?: number; startingAfter?: string } = {}): Promise<KitCustomerRecord[]> {
    try {
      const result = await this.stripe.customers.list({
        email: params.email ? normalizeEmail(params.email) : undefined,
        limit: params.limit ?? 20,
        starting_after: params.startingAfter,
      });
      return result.data.map((customer) => mapCustomer(customer));
    } catch (error) {
      throw toStripeOperationError(error, 'Could not list customers.');
    }
  }

  async sync(customerId: string): Promise<KitCustomerRecord> {
    const record = await this.retrieve(customerId);
    await this.storage?.saveCustomer?.(record);
    return record;
  }
}
