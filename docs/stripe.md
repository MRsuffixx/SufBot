# Stripe billing

The repository uses `stripe` 22.3.2 and hosted Checkout in `subscription` mode.

## Required setup

1. Create one monthly Stripe Price. Do not create products or prices at application startup.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, and, for payment method
   management, a restricted `STRIPE_PORTAL_CONFIGURATION_ID`.
3. The Price must be active, recurring monthly with interval count 1, and exactly match
   `billing.plan.priceMinor` and currency.
4. Configure `/v1/webhooks/stripe` and select the lifecycle, invoice, refund, and dispute events
   listed below.
5. Restrict the Billing Portal so customers cannot switch to unsupported products or intervals.

Handled events:

- `checkout.session.completed`
- `customer.subscription.created|updated|deleted|paused|resumed`
- `invoice.paid|payment_succeeded|payment_failed|payment_action_required`
- `charge.refunded`
- `charge.dispute.created|closed`

The API verifies `Stripe-Signature` against the exact raw bytes with a five-minute tolerance and
rejects cross-mode events. Checkout completion only binds identifiers and remains non-entitling.
Paid invoice/subscription state activates or renews through transactional reconciliation. Events are
deduplicated by `(provider, providerEventId)` and older state cannot overwrite newer provider state.

Run:

```bash
pnpm billing:stripe:check
pnpm billing:test:webhooks
```

The diagnostics command retrieves the configured Price when credentials are present. It cannot prove
external webhook reachability; perform a Stripe test-mode delivery and retain its event ID and
request reference as deployment evidence.
