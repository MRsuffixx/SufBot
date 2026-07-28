ALTER TABLE "BillingRiskBlock"
ADD CONSTRAINT "BillingRiskBlock_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingRiskBlock"
ADD CONSTRAINT "BillingRiskBlock_revokedByUserId_fkey"
FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
