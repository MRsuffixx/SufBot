CREATE TABLE "BillingRiskBlock" (
  "id" UUID NOT NULL,
  "targetType" VARCHAR(16) NOT NULL,
  "targetId" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "revokedByUserId" UUID,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRiskBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingRiskBlock_target_type_check" CHECK ("targetType" IN ('USER', 'GUILD')),
  CONSTRAINT "BillingRiskBlock_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);

CREATE INDEX "BillingRiskBlock_targetType_targetId_status_expiresAt_idx"
ON "BillingRiskBlock"("targetType", "targetId", "status", "expiresAt");

CREATE INDEX "BillingRiskBlock_createdAt_idx"
ON "BillingRiskBlock"("createdAt" DESC);
