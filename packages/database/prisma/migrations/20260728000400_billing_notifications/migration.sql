CREATE TABLE "BillingNotification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "eventKey" VARCHAR(128) NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingNotification_eventKey_key"
ON "BillingNotification"("eventKey");

CREATE INDEX "BillingNotification_userId_readAt_createdAt_idx"
ON "BillingNotification"("userId", "readAt", "createdAt" DESC);

CREATE INDEX "BillingNotification_guildId_createdAt_idx"
ON "BillingNotification"("guildId", "createdAt" DESC);

CREATE INDEX "BillingNotification_subscriptionId_createdAt_idx"
ON "BillingNotification"("subscriptionId", "createdAt" DESC);

ALTER TABLE "BillingNotification"
ADD CONSTRAINT "BillingNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingNotification"
ADD CONSTRAINT "BillingNotification_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingNotification"
ADD CONSTRAINT "BillingNotification_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "GuildSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
