import { StripeKit } from '@yourscope/stripekit';

const kit = StripeKit.init({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  mode: 'api',
  timezone: 'Europe/Amsterdam',
  currency: 'eur',
  successUrl: 'https://yourapp.com/billing/success',
  cancelUrl: 'https://yourapp.com/billing/cancel',
});

async function createOneTimePayment() {
  const payment = await kit.payments.create({
    amount: 2500,
    currency: 'eur',
    email: 'customer@example.com',
    description: 'Pro plan - one time setup fee',
  });

  console.log('Redirect the customer to:', payment.hostedUrl);
  return payment;
}

async function createSubscriptionCheckout() {
  const checkout = await kit.checkout.create({
    mode: 'subscription',
    priceId: 'price_123',
    email: 'customer@example.com',
    couponCode: 'WELCOME10',
    customFields: [
      { key: 'company_name', label: 'Company name', required: true },
      { key: 'vat_number', label: 'VAT number', required: false },
    ],
    fieldValues: {
      company_name: 'Acme BV',
    },
    successUrl: 'https://yourapp.com/billing/success',
    cancelUrl: 'https://yourapp.com/billing/cancel',
  });

  console.log('Redirect the customer to:', checkout.hostedUrl);
  return checkout;
}

async function manageCustomer() {
  const customer = await kit.customers.create({
    email: 'jane@example.com',
    name: 'Jane Doe',
  });

  await kit.customers.update(customer.id, { phone: '+31612345678' });

  const subscriptions = await kit.subscriptions.listByCustomer(customer.id);
  console.log(subscriptions);

  await kit.customers.delete(customer.id);
}

createOneTimePayment();
createSubscriptionCheckout();
manageCustomer();
