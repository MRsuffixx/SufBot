-- The legacy Subscription table was a non-functional placeholder with no purchaser or payment
-- lineage. Refuse to discard rows that an operator may have populated manually.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Subscription" LIMIT 1) THEN
    RAISE EXCEPTION
      'Billing foundation migration stopped: legacy Subscription contains rows. Export and reconcile them before deployment.';
  END IF;
END
$$;

DROP TABLE "Subscription";
DROP TYPE "SubscriptionStatus";

CREATE TYPE "BillingProviderName" AS ENUM ('STRIPE', 'PAYTR');
CREATE TYPE "BillingInterval" AS ENUM ('MONTH');
CREATE TYPE "BillingCustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "GuildSubscriptionStatus" AS ENUM (
  'PENDING',
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
  'REFUNDED'
);
CREATE TYPE "CancellationStatus" AS ENUM ('NONE', 'SCHEDULED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
  'REVERSED',
  'UNKNOWN'
);
CREATE TYPE "PaymentTransactionType" AS ENUM (
  'INITIAL',
  'RENEWAL',
  'RETRY',
  'REFUND',
  'PARTIAL_REFUND',
  'CHARGEBACK',
  'REVERSAL'
);
CREATE TYPE "BillingProviderEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'IGNORED',
  'DEAD_LETTERED'
);
CREATE TYPE "CheckoutSessionState" AS ENUM (
  'CREATED',
  'PROVIDER_PENDING',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
  'FAILED'
);
CREATE TYPE "GuildEntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "GuildEntitlementSource" AS ENUM (
  'SUBSCRIPTION',
  'MANUAL_PROMOTION',
  'ADMIN_OVERRIDE'
);
CREATE TYPE "BillingAuditActorType" AS ENUM ('USER', 'SYSTEM', 'WORKER', 'PROVIDER', 'STAFF');

ALTER TABLE "Guild"
ADD COLUMN "billingEntitlementVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "BillingPlan" (
  "id" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "displayName" VARCHAR(100) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "interval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  "currency" CHAR(3) NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "featureSetVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingPlan_amountMinor_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "BillingPlan_intervalCount_monthly" CHECK ("intervalCount" = 1),
  CONSTRAINT "BillingPlan_currency_uppercase" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "BillingPlan_featureSetVersion_positive" CHECK ("featureSetVersion" > 0)
);

CREATE TABLE "BillingCustomer" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerCustomerId" VARCHAR(255) NOT NULL,
  "emailSnapshot" VARCHAR(320),
  "status" "BillingCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuildSubscription" (
  "id" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "purchaserUserId" UUID NOT NULL,
  "billingPlanId" UUID NOT NULL,
  "billingCustomerId" UUID,
  "planCode" VARCHAR(64) NOT NULL,
  "planDisplayNameSnapshot" VARCHAR(100) NOT NULL,
  "amountMinorSnapshot" INTEGER NOT NULL,
  "currencySnapshot" CHAR(3) NOT NULL,
  "featureSetVersion" INTEGER NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerCustomerId" VARCHAR(255),
  "providerSubscriptionId" VARCHAR(255),
  "providerPriceId" VARCHAR(255),
  "status" "GuildSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "cancellationStatus" "CancellationStatus" NOT NULL DEFAULT 'NONE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "gracePeriodEndsAt" TIMESTAMP(3),
  "latestPaymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "providerStateVersion" VARCHAR(128),
  "providerUpdatedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuildSubscription_amountMinor_positive" CHECK ("amountMinorSnapshot" > 0),
  CONSTRAINT "GuildSubscription_currency_uppercase" CHECK ("currencySnapshot" ~ '^[A-Z]{3}$'),
  CONSTRAINT "GuildSubscription_featureSetVersion_positive" CHECK ("featureSetVersion" > 0),
  CONSTRAINT "GuildSubscription_version_positive" CHECK ("version" > 0),
  CONSTRAINT "GuildSubscription_period_order" CHECK (
    "currentPeriodStart" IS NULL OR
    "currentPeriodEnd" IS NULL OR
    "currentPeriodStart" < "currentPeriodEnd"
  ),
  CONSTRAINT "GuildSubscription_grace_requires_end" CHECK (
    "gracePeriodEndsAt" IS NULL OR
    "currentPeriodEnd" IS NULL OR
    "gracePeriodEndsAt" >= "currentPeriodEnd"
  )
);

CREATE TABLE "GuildEntitlement" (
  "id" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "entitlementKey" VARCHAR(100) NOT NULL,
  "source" "GuildEntitlementSource" NOT NULL,
  "sourceReference" VARCHAR(128) NOT NULL,
  "subscriptionId" UUID,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" "GuildEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuildEntitlement_period_order" CHECK ("endsAt" IS NULL OR "startsAt" < "endsAt"),
  CONSTRAINT "GuildEntitlement_subscription_source" CHECK (
    ("source" = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL) OR
    ("source" <> 'SUBSCRIPTION')
  )
);

CREATE TABLE "PaymentTransaction" (
  "id" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "purchaserUserId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerPaymentId" VARCHAR(255),
  "providerInvoiceId" VARCHAR(255),
  "merchantOrderId" VARCHAR(64),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "type" "PaymentTransactionType" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amountMinor" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "failureCode" VARCHAR(100),
  "failureMessageSanitized" VARCHAR(500),
  "paidAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "disputedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTransaction_amount_positive" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentTransaction_currency_uppercase" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "BillingProviderEvent" (
  "id" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerEventId" VARCHAR(255) NOT NULL,
  "eventType" VARCHAR(128) NOT NULL,
  "environment" VARCHAR(32) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "payloadSummary" JSONB NOT NULL DEFAULT '{}',
  "signatureVerified" BOOLEAN NOT NULL,
  "processingStatus" "BillingProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerEventCreatedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "failureCode" VARCHAR(100),
  "lastErrorSanitized" VARCHAR(500),
  "correlationId" VARCHAR(128) NOT NULL,
  CONSTRAINT "BillingProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingProviderEvent_payloadHash_hex" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "BillingProviderEvent_attempt_nonnegative" CHECK ("attemptCount" >= 0),
  CONSTRAINT "BillingProviderEvent_environment" CHECK (
    "environment" IN ('development', 'test', 'production')
  )
);

CREATE TABLE "CheckoutSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "planCode" VARCHAR(64) NOT NULL,
  "environment" VARCHAR(32) NOT NULL,
  "state" "CheckoutSessionState" NOT NULL DEFAULT 'CREATED',
  "nonceHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "providerSessionId" VARCHAR(255),
  "amountMinorSnapshot" INTEGER NOT NULL,
  "currencySnapshot" CHAR(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckoutSession_amount_positive" CHECK ("amountMinorSnapshot" > 0),
  CONSTRAINT "CheckoutSession_currency_uppercase" CHECK ("currencySnapshot" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CheckoutSession_nonceHash_hex" CHECK ("nonceHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CheckoutSession_version_positive" CHECK ("version" > 0),
  CONSTRAINT "CheckoutSession_environment" CHECK (
    "environment" IN ('development', 'test', 'production')
  ),
  CONSTRAINT "CheckoutSession_expiry_after_creation" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "BillingAuditEvent" (
  "id" UUID NOT NULL,
  "actorType" "BillingAuditActorType" NOT NULL,
  "actorUserId" UUID,
  "guildId" VARCHAR(20),
  "subscriptionId" UUID,
  "action" VARCHAR(128) NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "requestId" VARCHAR(128) NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "ipAddressHash" CHAR(64),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPlan_code_key" ON "BillingPlan"("code");
CREATE INDEX "BillingPlan_active_code_idx" ON "BillingPlan"("active", "code");

CREATE UNIQUE INDEX "BillingCustomer_provider_providerCustomerId_key"
ON "BillingCustomer"("provider", "providerCustomerId");
CREATE UNIQUE INDEX "BillingCustomer_userId_provider_key"
ON "BillingCustomer"("userId", "provider");
CREATE INDEX "BillingCustomer_status_idx" ON "BillingCustomer"("status");

CREATE UNIQUE INDEX "GuildSubscription_provider_providerSubscriptionId_key"
ON "GuildSubscription"("provider", "providerSubscriptionId");
CREATE UNIQUE INDEX "GuildSubscription_one_effective_per_guild"
ON "GuildSubscription"("guildId")
WHERE "status" IN (
  'PENDING',
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'DISPUTED'
);
CREATE INDEX "GuildSubscription_guildId_status_idx"
ON "GuildSubscription"("guildId", "status");
CREATE INDEX "GuildSubscription_purchaserUserId_status_idx"
ON "GuildSubscription"("purchaserUserId", "status");
CREATE INDEX "GuildSubscription_provider_providerCustomerId_idx"
ON "GuildSubscription"("provider", "providerCustomerId");
CREATE INDEX "GuildSubscription_currentPeriodEnd_idx"
ON "GuildSubscription"("currentPeriodEnd");
CREATE INDEX "GuildSubscription_gracePeriodEndsAt_idx"
ON "GuildSubscription"("gracePeriodEndsAt");

CREATE UNIQUE INDEX "GuildEntitlement_guildId_key_source_reference_key"
ON "GuildEntitlement"("guildId", "entitlementKey", "source", "sourceReference");
CREATE INDEX "GuildEntitlement_guildId_status_startsAt_endsAt_idx"
ON "GuildEntitlement"("guildId", "status", "startsAt", "endsAt");
CREATE INDEX "GuildEntitlement_subscriptionId_status_idx"
ON "GuildEntitlement"("subscriptionId", "status");
CREATE INDEX "GuildEntitlement_endsAt_idx" ON "GuildEntitlement"("endsAt");

CREATE UNIQUE INDEX "PaymentTransaction_provider_idempotencyKey_key"
ON "PaymentTransaction"("provider", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentTransaction_provider_merchantOrderId_key"
ON "PaymentTransaction"("provider", "merchantOrderId");
CREATE UNIQUE INDEX "PaymentTransaction_provider_providerPaymentId_key"
ON "PaymentTransaction"("provider", "providerPaymentId");
CREATE UNIQUE INDEX "PaymentTransaction_provider_providerInvoiceId_type_key"
ON "PaymentTransaction"("provider", "providerInvoiceId", "type");
CREATE INDEX "PaymentTransaction_guildId_createdAt_idx"
ON "PaymentTransaction"("guildId", "createdAt" DESC);
CREATE INDEX "PaymentTransaction_subscriptionId_createdAt_idx"
ON "PaymentTransaction"("subscriptionId", "createdAt" DESC);
CREATE INDEX "PaymentTransaction_status_createdAt_idx"
ON "PaymentTransaction"("status", "createdAt");

CREATE UNIQUE INDEX "BillingProviderEvent_provider_providerEventId_key"
ON "BillingProviderEvent"("provider", "providerEventId");
CREATE INDEX "BillingProviderEvent_processingStatus_receivedAt_idx"
ON "BillingProviderEvent"("processingStatus", "receivedAt");
CREATE INDEX "BillingProviderEvent_provider_eventType_receivedAt_idx"
ON "BillingProviderEvent"("provider", "eventType", "receivedAt" DESC);
CREATE INDEX "BillingProviderEvent_correlationId_idx"
ON "BillingProviderEvent"("correlationId");

CREATE UNIQUE INDEX "CheckoutSession_provider_providerSessionId_key"
ON "CheckoutSession"("provider", "providerSessionId");
CREATE UNIQUE INDEX "CheckoutSession_nonceHash_key" ON "CheckoutSession"("nonceHash");
CREATE UNIQUE INDEX "CheckoutSession_one_open_per_guild"
ON "CheckoutSession"("guildId")
WHERE "state" IN ('CREATED', 'PROVIDER_PENDING');
CREATE INDEX "CheckoutSession_userId_createdAt_idx"
ON "CheckoutSession"("userId", "createdAt" DESC);
CREATE INDEX "CheckoutSession_guildId_state_idx"
ON "CheckoutSession"("guildId", "state");
CREATE INDEX "CheckoutSession_state_expiresAt_idx"
ON "CheckoutSession"("state", "expiresAt");

CREATE INDEX "BillingAuditEvent_guildId_createdAt_idx"
ON "BillingAuditEvent"("guildId", "createdAt" DESC);
CREATE INDEX "BillingAuditEvent_subscriptionId_createdAt_idx"
ON "BillingAuditEvent"("subscriptionId", "createdAt" DESC);
CREATE INDEX "BillingAuditEvent_actorUserId_createdAt_idx"
ON "BillingAuditEvent"("actorUserId", "createdAt" DESC);
CREATE INDEX "BillingAuditEvent_action_createdAt_idx"
ON "BillingAuditEvent"("action", "createdAt" DESC);
CREATE INDEX "BillingAuditEvent_requestId_idx" ON "BillingAuditEvent"("requestId");

ALTER TABLE "BillingCustomer"
ADD CONSTRAINT "BillingCustomer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuildSubscription"
ADD CONSTRAINT "GuildSubscription_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildSubscription"
ADD CONSTRAINT "GuildSubscription_purchaserUserId_fkey"
FOREIGN KEY ("purchaserUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildSubscription"
ADD CONSTRAINT "GuildSubscription_billingPlanId_fkey"
FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildSubscription"
ADD CONSTRAINT "GuildSubscription_billingCustomerId_fkey"
FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuildEntitlement"
ADD CONSTRAINT "GuildEntitlement_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuildEntitlement"
ADD CONSTRAINT "GuildEntitlement_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "GuildSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_purchaserUserId_fkey"
FOREIGN KEY ("purchaserUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction"
ADD CONSTRAINT "PaymentTransaction_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "GuildSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckoutSession"
ADD CONSTRAINT "CheckoutSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutSession"
ADD CONSTRAINT "CheckoutSession_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CheckoutSession"
ADD CONSTRAINT "CheckoutSession_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "GuildSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingAuditEvent"
ADD CONSTRAINT "BillingAuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingAuditEvent"
ADD CONSTRAINT "BillingAuditEvent_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingAuditEvent"
ADD CONSTRAINT "BillingAuditEvent_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "GuildSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
