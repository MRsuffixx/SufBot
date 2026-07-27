ALTER TABLE "Guild"
ADD COLUMN "botUserId" VARCHAR(20),
ADD COLUMN "botPermissionBitfield" VARCHAR(32),
ADD COLUMN "botHasAdministrator" BOOLEAN,
ADD COLUMN "botHighestRolePosition" INTEGER,
ADD COLUMN "botStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN "botLastSeenAt" TIMESTAMP(3),
ADD COLUMN "commandRegistrationMode" VARCHAR(32),
ADD COLUMN "commandRegistrationStatus" VARCHAR(32),
ADD COLUMN "registeredCommandCount" INTEGER,
ADD COLUMN "commandSchemaHash" CHAR(64),
ADD COLUMN "commandRegistrationUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Guild_botUserId_botLastSeenAt_idx"
ON "Guild"("botUserId", "botLastSeenAt");
