export interface KitCustomerAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface CreateCustomerInput {
  email: string;
  name?: string;
  phone?: string;
  description?: string;
  address?: KitCustomerAddress;
  taxId?: string;
  metadata?: Record<string, string>;
  userId?: string | number;
}

export interface UpdateCustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  address?: KitCustomerAddress;
  defaultPaymentMethodId?: string;
  metadata?: Record<string, string>;
}

export interface KitCustomerRecord {
  id: string;
  userId?: string | number | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  description: string | null;
  address: KitCustomerAddress | null;
  defaultPaymentMethodId: string | null;
  metadata: Record<string, string>;
  createdAtUtc: string;
  deleted: boolean;
}
