# PayTR billing

PayTR is isolated from Stripe and is not treated as an equivalent subscription API.

## Capability gate

Set merchant secrets only in the environment:

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `PAYTR_CALLBACK_URL`
- `PAYTR_IFRAME_ENABLED`
- `PAYTR_APPROVED_CURRENCIES`
- `PAYTR_CARD_STORAGE_ENABLED`
- `PAYTR_RECURRING_ENABLED`

Flags represent reviewed merchant configuration, not proof by themselves. The current recurrence
adapter is intentionally disabled. Even with both recurring flags set, capability diagnostics return
`PAYTR_RECURRING_ADAPTER_DISABLED`. Never label the iFrame one-time charge as automatically
renewing.

The documented iFrame flow can be exposed only when product configuration explicitly selects
`manual_renewal`, merchant credentials and HTTPS callback are configured, iFrame capability is
approved, and the exact configured currency is listed as merchant-approved. A separate PayTR amount
or currency that differs from the internal plan currently fails readiness; no exchange rate or
silent conversion occurs.

## Initial payment and callback

The server derives the minor-unit amount, basket, unique alphanumeric merchant order ID, URLs, and
HMAC. It sends billing contact data only to PayTR and never accepts or stores card fields.

`/v1/webhooks/paytr` accepts a bounded form-encoded machine callback without a user session. It:

1. parses one value per supported field;
2. verifies
   `base64(HMAC-SHA256(merchant_oid + merchant_salt + status + total_amount, merchant_key))` using
   constant-time comparison;
3. checks test/production mode;
4. binds the merchant order to the internal checkout UUID;
5. validates `payment_amount`, collected amount, and currency against the purchase snapshot;
6. durably deduplicates and reconciles state; and
7. replies with exactly plain text `OK`.

Browser success/failure redirects never activate or cancel Premium. Repeated callbacks return `OK`
only after matching the original durable event.

Run `pnpm billing:paytr:check`. A real merchant test remains required before enabling iFrame
payments. Registered-card recurrence is a separate milestone requiring PayTR approval, token
lifecycle, documented status inquiry, ambiguous-outcome reconciliation, and merchant test evidence.
