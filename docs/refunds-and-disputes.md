# Refunds and disputes

Policy is explicit:

- A full verified refund transitions the subscription to `REFUNDED` and revokes paid entitlements.
- A partial refund records `PARTIAL_REFUND` and preserves access pending written product/support
  policy.
- A confirmed dispute transitions to `DISPUTED`, records a chargeback transaction, and suspends
  Premium.
- A won/reversed dispute triggers provider retrieval; access returns only if the authoritative
  subscription is active, paid, and within its period.
- Duplicate refunds/charges are separate auditable financial events and are deduplicated by provider
  event identity.

Do not automatically ban a Discord user. Repeated failures or disputes can trigger a temporary,
generic checkout cooldown. Staff may add or revoke an auditable review block using immutable
billing-admin authorization. Restoration requires provider reconciliation; there is no “mark paid”
control.

Before production, legal/accounting owners must decide refund windows, partial-refund behavior,
tax/invoice treatment, chargeback evidence retention, and customer communications. Those decisions
must be reflected in public Terms and the provider dashboards.
