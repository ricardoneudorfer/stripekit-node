import type { StorageAdapter } from '@ricardoneudorfer/stripekit';
import { Pool } from 'pg';

const pool = new Pool();

export const postgresStorageAdapter: StorageAdapter = {
  async findUserByEmail(email) {
    const { rows } = await pool.query(
      'SELECT id, stripe_customer_id FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, stripeCustomerId: rows[0].stripe_customer_id };
  },

  async findUserByStripeCustomerId(customerId) {
    const { rows } = await pool.query(
      'SELECT id, stripe_customer_id FROM users WHERE stripe_customer_id = $1 LIMIT 1',
      [customerId],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, stripeCustomerId: rows[0].stripe_customer_id };
  },

  async findUserById(id) {
    const { rows } = await pool.query(
      'SELECT id, stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
      [id],
    );
    if (!rows[0]) return null;
    return { id: rows[0].id, stripeCustomerId: rows[0].stripe_customer_id };
  },

  async saveCustomer(record) {
    await pool.query(
      `INSERT INTO stripe_customers (id, user_id, email, name, deleted, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET email = $3, name = $4, deleted = $5, updated_at = now()`,
      [record.id, record.userId, record.email, record.name, record.deleted],
    );
  },

  async saveSubscription(record) {
    await pool.query(
      `INSERT INTO subscriptions (id, user_id, customer_id, status, current_period_end_utc, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET status = $4, current_period_end_utc = $5, updated_at = now()`,
      [record.id, record.userId, record.customerId, record.status, record.currentPeriodEndUtc],
    );
  },

  async savePayment(record) {
    await pool.query(
      `INSERT INTO payments (id, user_id, customer_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET status = $6`,
      [record.id, record.userId, record.customerId, record.amount, record.currency, record.status, record.createdAtUtc],
    );
  },

  async saveInvoice(record) {
    await pool.query(
      `INSERT INTO invoices (id, user_id, customer_id, amount_due, amount_paid, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET amount_paid = $5, status = $6, updated_at = now()`,
      [record.id, record.userId, record.customerId, record.amountDue, record.amountPaid, record.status],
    );
  },

  async hasProcessedWebhookEvent(eventId) {
    const { rows } = await pool.query('SELECT 1 FROM webhook_events WHERE id = $1', [eventId]);
    return rows.length > 0;
  },

  async markWebhookEventProcessed(eventId, type) {
    await pool.query(
      'INSERT INTO webhook_events (id, type, processed_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING',
      [eventId, type],
    );
  },
};
