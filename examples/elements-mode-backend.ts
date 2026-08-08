import { StripeKit } from '@ricardoneudorfer/stripekit';
import express from 'express';

const kit = StripeKit.init({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
  mode: 'elements',
  timezone: 'America/New_York',
  currency: 'usd',
});

const app = express();
app.use(express.json());

app.get('/billing/client-config', (_req, res) => {
  res.json(kit.toClientConfig());
});

app.post('/billing/checkout', async (req, res) => {
  const { email, priceId, mode } = req.body;

  const checkout = await kit.checkout.create({
    mode,
    priceId,
    amount: mode === 'payment' ? 4900 : undefined,
    email,
  });

  res.json({
    checkoutId: checkout.id,
    clientSecret: checkout.clientSecret,
  });
});

app.post('/billing/payment-methods', async (req, res) => {
  const { customerId } = req.body;
  const methods = await kit.paymentMethods.list(customerId);
  res.json(methods);
});

app.post('/billing/pay-with-saved-method', async (req, res) => {
  const { customerId, paymentMethodId, amount } = req.body;

  const result = await kit.payments.payWithSavedMethod({
    customerId,
    paymentMethodId,
    amount,
    currency: 'usd',
  });

  res.json(result);
});

app.listen(3000);
