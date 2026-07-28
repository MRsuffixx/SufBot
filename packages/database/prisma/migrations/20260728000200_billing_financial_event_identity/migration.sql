DROP INDEX IF EXISTS "PaymentTransaction_provider_providerPaymentId_key";

CREATE UNIQUE INDEX "PaymentTransaction_provider_providerPaymentId_type_key"
ON "PaymentTransaction"("provider", "providerPaymentId", "type");
