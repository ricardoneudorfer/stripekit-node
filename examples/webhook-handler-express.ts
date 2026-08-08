import { StripeKit } from '@ricardoneudorfer/stripekit';
import express from 'express';

const kit = StripeKit.init({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  mode: 'both',
  timezone: 'UTC',
});

const app = express();

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await kit.webhooks.process({
      payload: req.body,
      signature: req.headers['stripe-signature'] as string,
      handlers: {
        onPaymentSucceeded: async (paymentIntent) => {
          console.log('Payment succeeded:', paymentIntent.id);
        },
        onInvoicePaid: async (invoice) => {
          console.log('Invoice paid:', invoice.id);
        },
        onSubscriptionDeleted: async (subscription) => {
          console.log('Subscription cancelled:', subscription.id);
        },
        onSubscriptionUpdated: async (subscription) => {
          console.log('Subscription status is now:', subscription.status);
        },
      },
    });

    res.json({ received: result.received });
  } catch (error) {
    console.error(error);
    res.status(400).send('Webhook Error');
  }
});

app.listen(3000);
