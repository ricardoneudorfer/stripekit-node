# StripeKit

A complete, production-ready Stripe toolkit for Node.js and TypeScript. StripeKit wraps the official `stripe` SDK with a simple, opinionated layer for customers, payment methods, payments, checkout, subscriptions, invoices, coupons and webhooks — so you can integrate Stripe into your own interface without becoming a Stripe API expert.

You stay in full control of your database and UI. StripeKit only talks to Stripe: it creates and reads Stripe objects, normalizes the responses into clean, timezone-aware records, and — if you give it a storage adapter — persists that normalized state for you.

## Why StripeKit

- **One `init()` call.** Provide your secret key, choose `api` or `elements` mode, optionally set a timezone, and every module is ready to use.
- **You choose the flow.** In `api` mode, payment and checkout calls return a hosted Stripe URL you redirect the customer to. In `elements` mode, they return a `client_secret` your own frontend uses to confirm the payment with Stripe Elements. In `both` mode, you decide per call.
- **Elements are fully optional.** The browser-side helpers live in a separate `stripekit/elements` entry point. If you don't need Stripe Elements, you never import it.
- **Timezones handled correctly.** Every timestamp StripeKit returns is first normalized to UTC (Stripe's native format), then — if you configured a timezone — converted once more into that timezone for display. Both values are always returned so you never have to do the math yourself.
- **You own your data.** StripeKit never requires a database. Pass an optional `storage` adapter to persist customers, subscriptions, invoices, payments and payment methods in your own schema; without one, StripeKit still works, it just won't persist anything for you.
- **Covers the whole billing surface.** Customers, payment methods, one-off payments, checkout (payment or subscription, with custom fields and coupons), subscriptions, invoices, coupons/promotion codes, and webhooks with automatic state sync.

## Installation

```bash
npm install @ricardoneudorfer/stripekit stripe
```

If you plan to use Stripe Elements in the browser, also install:

```bash
npm install @stripe/stripe-js
```

## Quick start

```ts
import { StripeKit } from '@ricardoneudorfer/stripekit';

const kit = StripeKit.init({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  mode: 'api',
  timezone: 'Europe/Amsterdam',
  currency: 'eur',
});

const payment = await kit.payments.create({
  amount: 2500,
  currency: 'eur',
  email: 'customer@example.com',
  description: 'Pro plan',
});

console.log(payment.hostedUrl);
```

Every action StripeKit can perform is available under `kit.<module>.<action>()`. Import `StripeKit` anywhere in your codebase and initiate it once (see [Initialization](#initialization) for sharing a single instance across your app).

## Initialization

```ts
StripeKit.init({
  secretKey: string,
  publishableKey?: string,
  webhookSecret?: string,
  mode: 'api' | 'elements' | 'both',
  timezone?: string,
  currency?: string,
  successUrl?: string,
  cancelUrl?: string,
  storage?: StorageAdapter,
  apiVersion?: string,
  appInfo?: { name: string; version?: string; url?: string },
  debug?: boolean,
  maxNetworkRetries?: number,
  timeout?: number,
});
```

| Option | Required | Description |
| --- | --- | --- |
| `secretKey` | Yes | Your Stripe secret key (`sk_live_...` / `sk_test_...`). Never expose this in the browser. |
| `mode` | Yes | `'api'`, `'elements'`, or `'both'`. Explained below. |
| `publishableKey` | Only for `elements`/`both` | Your Stripe publishable key. Not used server-side, but returned via `kit.toClientConfig()` so your frontend can fetch it from your own backend instead of hardcoding it. |
| `webhookSecret` | Only if using `kit.webhooks` | Your endpoint's signing secret from the Stripe Dashboard. |
| `timezone` | No, defaults to `"UTC"` | Any IANA timezone, e.g. `"Europe/Amsterdam"`, `"America/New_York"`. See [Timezones](#timezones). |
| `currency` | No, defaults to `"usd"` | Default 3-letter ISO currency for calls that don't specify one. |
| `successUrl` / `cancelUrl` | No | Default redirect URLs used by hosted Checkout Sessions when not passed per call. |
| `storage` | No | A `StorageAdapter` implementation. See [Storage adapter](#storage-adapter). |

If required options are missing or invalid, `StripeKit.init()` throws a `ConfigurationError` immediately, so misconfiguration is caught at boot time rather than mid-request.

### Choosing a mode

This is the single most important decision StripeKit asks you to make, because it decides what your payment and checkout calls hand back to you:

- **`mode: 'api'`** — StripeKit creates a Stripe-hosted Checkout Session and returns `hostedUrl`. You redirect the customer there; Stripe hosts the entire payment form. Nothing to build on your frontend.
- **`mode: 'elements'`** — StripeKit creates a `PaymentIntent` (or `SetupIntent`) and returns `clientSecret`. You mount your own Stripe Elements form (using the optional `stripekit/elements` helpers, or your own code) and confirm the payment yourself. Full control over your UI.
- **`mode: 'both'`** — StripeKit defaults to the `'api'` behavior, but every call that creates a payment or checkout accepts a `mode` (or `flowOverride`) argument to choose per call.

```ts
await kit.payments.create({ amount: 1000, mode: 'elements' }); // works even if global mode is 'api', as long as it's 'both'
```

## Timezones

Stripe stores every timestamp as a Unix epoch — which is UTC by definition. StripeKit always does the conversion in two explicit steps, never one:

1. **Normalize to UTC.** The raw Unix timestamp is converted into an ISO-8601 UTC string. This is always available as the `...Utc` field (e.g. `currentPeriodEndUtc`, `issuedAtUtc`, `paidAtUtc`).
2. **Convert to your configured timezone.** If you set a `timezone` on init (anything other than `"UTC"`, the default), that UTC value is converted once more into your chosen timezone and exposed as the matching `...Local` field (e.g. `currentPeriodEndLocal`).

```ts
const kit = StripeKit.init({ secretKey, mode: 'api', timezone: 'Asia/Tokyo' });

const sub = await kit.subscriptions.retrieve('sub_123');
console.log(sub.currentPeriodEndUtc);   // "2026-09-01T00:00:00.000Z"
console.log(sub.currentPeriodEndLocal); // "2026-09-01T09:00:00" in Asia/Tokyo
```

If you don't set a `timezone`, both fields are UTC, and no double conversion happens. You can also use the exported helpers directly:

```ts
import { unixToTimezone, nowInTimezone } from '@ricardoneudorfer/stripekit';

unixToTimezone(1735689600, 'Europe/Amsterdam');
nowInTimezone('Europe/Amsterdam');
```

## Storage adapter

StripeKit does not require a database, but every module that creates or reads Stripe state will call into an optional `storage` adapter if you provide one, so your own database always reflects reality without you writing that glue code yourself.

```ts
import type { StorageAdapter } from '@yourscope/stripekit';

const storage: StorageAdapter = {
  async findUserByEmail(email) { /* return { id, stripeCustomerId } | null */ },
  async findUserById(id) { /* ... */ },
  async saveCustomer(record) { /* upsert into your users/customers table */ },
  async saveSubscription(record) { /* upsert into your subscriptions table */ },
  async savePayment(record) { /* upsert into your payments table */ },
  async saveInvoice(record) { /* upsert into your invoices table */ },
  async savePaymentMethods(userId, records) { /* replace the user's saved methods */ },
  async saveCoupon(record) { /* cache coupon/promo code metadata */ },
  async markInvoiceDeleted(invoiceId) { /* soft-delete */ },
  async hasProcessedWebhookEvent(eventId) { /* idempotency check, recommended in production */ },
  async markWebhookEventProcessed(eventId, type) { /* ... */ },
  async saveCheckoutSession(session) { /* persist in-flight custom checkout sessions */ },
  async getCheckoutSession(id) { /* ... */ },
};

const kit = StripeKit.init({ secretKey, mode: 'api', storage });
```

Every method on the adapter is optional — implement only what you need. See `examples/storage-adapter-postgres.ts` for a full Postgres-backed implementation.

> **Note on statelessness:** `kit.checkout` and `kit.webhooks` fall back to in-process memory for checkout sessions and webhook idempotency when no storage adapter is supplied. That's fine for local development or a single-instance deployment, but for production deployments running multiple instances or serverless functions, provide `saveCheckoutSession`/`getCheckoutSession` and `hasProcessedWebhookEvent`/`markWebhookEventProcessed` so state is shared correctly. StripeKit will log a warning whenever it falls back.

## Modules

### `kit.customers`

```ts
await kit.customers.create({ email, name?, phone?, address?, metadata? });
await kit.customers.findOrCreateByEmail(email);
await kit.customers.retrieve(customerId);
await kit.customers.update(customerId, { name?, phone?, address?, defaultPaymentMethodId?, metadata? });
await kit.customers.delete(customerId);
await kit.customers.list({ email?, limit?, startingAfter? });
await kit.customers.sync(customerId); // re-pull from Stripe and persist via storage
```

### `kit.paymentMethods`

```ts
await kit.paymentMethods.list(customerId);
await kit.paymentMethods.attach({ paymentMethodId, customerId, setAsDefault? });
await kit.paymentMethods.detach(paymentMethodId);
await kit.paymentMethods.setDefault(customerId, paymentMethodId);
await kit.paymentMethods.createSetupIntent({ customerId, usage? }); // to save a card for later, via Elements
await kit.paymentMethods.sync(customerId);
```

### `kit.payments`

One-off payments (PaymentIntents), respecting the `mode` you configured.

```ts
const payment = await kit.payments.create({
  amount: 1999,            // minor currency units (cents)
  currency: 'usd',
  email: 'customer@example.com',
  description: 'One-time purchase',
});
// payment.hostedUrl   -> set when the resolved flow is 'api'
// payment.clientSecret -> set when the resolved flow is 'elements'

await kit.payments.retrieve(paymentIntentId);
await kit.payments.confirm(paymentIntentId, paymentMethodId?);
await kit.payments.cancel(paymentIntentId);

// Charge a card the customer already saved, without any customer interaction:
await kit.payments.payWithSavedMethod({
  customerId,
  paymentMethodId,
  amount: 999,
  currency: 'usd',
});
```

### `kit.checkout`

The high-level module for building your own checkout flow: one-off payments or subscriptions, with optional custom fields and coupon codes, in either flow.

```ts
const checkout = await kit.checkout.create({
  mode: 'subscription',              // or 'payment'
  priceId: 'price_123',              // required for subscriptions
  amount: 4900,                      // required for one-off payments (and for subscriptions in 'elements' mode)
  email: 'customer@example.com',
  couponCode: 'WELCOME10',
  customFields: [
    { key: 'company_name', label: 'Company name', required: true },
  ],
  fieldValues: { company_name: 'Acme BV' },
});

await kit.checkout.get(checkout.id);
await kit.checkout.submitFields(checkout.id, { company_name: 'Acme BV' });
await kit.checkout.applyCoupon({ checkoutId: checkout.id, couponCode: 'SAVE20', originalAmount: 4900 });
await kit.checkout.markComplete(checkout.id);
```

### `kit.subscriptions`

```ts
await kit.subscriptions.create({ customerId, priceId, quantity?, trialPeriodDays?, collectionMethod? });
await kit.subscriptions.retrieve(subscriptionId);
await kit.subscriptions.cancel({ subscriptionId, atPeriodEnd? });
await kit.subscriptions.resume(subscriptionId);
await kit.subscriptions.toggleCollectionMethod({ subscriptionId, collectionMethod: 'send_invoice', daysUntilDue: 14 });
await kit.subscriptions.updateFields({ subscriptionId, fieldValues: { seats: '10' } });
await kit.subscriptions.applyPromotionCode(subscriptionId, promotionCodeId);
await kit.subscriptions.listByCustomer(customerId);
await kit.subscriptions.sync(subscriptionId);
```

### `kit.invoices`

```ts
await kit.invoices.retrieve(invoiceId);
await kit.invoices.listByCustomer(customerId, status?);
await kit.invoices.listBySubscription(subscriptionId);
await kit.invoices.payWithSavedMethod({ invoiceId, customerId, paymentMethodId });
await kit.invoices.voidInvoice(invoiceId);
await kit.invoices.finalize(invoiceId);
await kit.invoices.sync(invoiceId);
```

Invoices include a normalized `lineItems` array and both UTC and local timestamps for `dueAt`, `paidAt` and `issuedAt`.

### `kit.coupons`

```ts
await kit.coupons.create({ code: 'SUMMER25', discountType: 'percent', discountValue: 25, duration: 'once' });
await kit.coupons.validate('SUMMER25'); // returns null if invalid, expired or inactive
await kit.coupons.applyToSubscription(subscriptionId, stripePromotionCodeId);
await kit.coupons.list();
await kit.coupons.deactivate(stripePromotionCodeId);
```

### `kit.webhooks`

```ts
const result = await kit.webhooks.process({
  payload: rawRequestBody, // Buffer or string, must be the raw, unparsed body
  signature: req.headers['stripe-signature'],
  handlers: {
    onPaymentSucceeded: async (paymentIntent) => { /* ... */ },
    onInvoicePaid: async (invoice) => { /* ... */ },
    onSubscriptionUpdated: async (subscription) => { /* ... */ },
    onSubscriptionDeleted: async (subscription) => { /* ... */ },
  },
});
```

`kit.webhooks.process()` verifies the Stripe signature, deduplicates by event ID, and — unless you pass `autoSync: false` — automatically re-syncs the relevant object (payment, invoice, subscription, or payment methods) via your storage adapter before calling your handler. This means your database is always updated even if you don't implement a handler for a given event.

### `kit.sync`

A convenience module for pulling the full current state of a customer from Stripe on demand, e.g. after a support request or a manual reconciliation job:

```ts
const state = await kit.sync.everythingForCustomer(customerId, userId);
// state.customer, state.subscriptions, state.invoices, state.paymentMethods
```

## Stripe Elements (optional, browser-side)

Import from the separate `stripekit/elements` entry point only where you need it — it is never bundled into your server code.

```ts
import { PaymentElementController } from '@ricardoneudorfer/stripekit/elements';

const controller = await PaymentElementController.create({
  publishableKey,   // fetch this from your backend via kit.toClientConfig()
  clientSecret,     // returned by kit.payments.create() or kit.checkout.create() in 'elements' mode
  appearance: { theme: 'stripe' },
});

controller.mount({ containerSelector: '#payment-element' });

const result = await controller.confirmPayment({
  returnUrl: 'https://yourapp.com/billing/success',
});

if (!result.success) {
  console.error(result.error);
}
```

See `examples/elements-mode-frontend.html` for a full working page, and `examples/elements-mode-backend.ts` for the matching Express backend.

## Error handling

Every module throws typed errors you can catch and branch on:

```ts
import { ValidationError, NotFoundError, StripeOperationError, ConfigurationError } from '@ricardoneudorfer/stripekit';

try {
  await kit.payments.create({ amount: 10, currency: 'usd' });
} catch (error) {
  if (error instanceof ValidationError) {
    // amount below Stripe's minimum, bad email, etc. error.fieldErrors may be set.
  } else if (error instanceof StripeOperationError) {
    // Stripe itself rejected the request; error.cause holds the original Stripe error.
  }
}
```

## Currency and amounts

All amounts are always in minor currency units (cents), matching Stripe's own convention, so there's never ambiguity between `19.99` and `1999`. Helpers are exported if you need to convert:

```ts
import { toMinorUnits, toMajorUnits, formatMoney } from '@ricardoneudorfer/stripekit';

toMinorUnits(19.99, 'usd');      // 1999
toMajorUnits(1999, 'usd');       // 19.99
formatMoney(1999, 'usd');        // "$19.99"
```

## Project structure

```
src/
  StripeKit.ts            Main class, init() and module wiring
  index.ts                Package entry point
  types/                  All public TypeScript types
  core/                   Timezone, money, validation, errors, logging, tokens
  modules/
    customers.ts
    paymentMethods.ts
    payments.ts
    checkout.ts
    subscriptions.ts
    invoices.ts
    coupons.ts
    webhooks.ts
    sync.ts
  elements/                Optional browser-side entry point (stripekit/elements)
    index.ts
    loadElements.ts
    PaymentElementController.ts
    types.ts
examples/
  basic-api-mode.ts
  elements-mode-backend.ts
  elements-mode-frontend.html
  webhook-handler-express.ts
  storage-adapter-postgres.ts
```

## Building from source

```bash
npm install
npm run typecheck
npm run build
```

## License

MIT
