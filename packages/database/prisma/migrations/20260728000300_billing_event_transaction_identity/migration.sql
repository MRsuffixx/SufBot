-- Provider payment and invoice objects legitimately produce more than one
-- financial lifecycle event (for example paid + refunded, or paid event aliases).
-- Provider event and merchant-order idempotency remain the uniqueness boundaries.
DROP INDEX IF EXISTS "PaymentTransaction_provider_providerPaymentId_type_key";
DROP INDEX IF EXISTS "PaymentTransaction_provider_providerInvoiceId_type_key";

CREATE INDEX "PaymentTransaction_provider_providerPaymentId_idx"
ON "PaymentTransaction"("provider", "providerPaymentId");

CREATE INDEX "PaymentTransaction_provider_providerInvoiceId_idx"
ON "PaymentTransaction"("provider", "providerInvoiceId");
