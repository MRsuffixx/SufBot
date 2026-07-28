CREATE TYPE "OnboardingVerificationStatus" AS ENUM (
  'PENDING',
  'CHALLENGE_CREATED',
  'FAILED',
  'LOCKED',
  'VERIFIED',
  'EXPIRED',
  'MANUALLY_VERIFIED',
  'BYPASSED'
);

CREATE TYPE "OnboardingEventStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED'
);

CREATE TYPE "OnboardingResourceHealth" AS ENUM (
  'NOT_CONFIGURED',
  'PENDING',
  'HEALTHY',
  'PARTIAL',
  'BROKEN'
);

CREATE TYPE "VerificationSetupMode" AS ENUM (
  'EVERYONE_VISIBLE',
  'DEDICATED_UNVERIFIED_ROLE'
);

CREATE TYPE "OnboardingCaptchaType" AS ENUM (
  'IMAGE_TEXT',
  'ARITHMETIC',
  'BUTTON_SEQUENCE',
  'MODAL_TEXT'
);

CREATE TYPE "OnboardingRoleGrantCondition" AS ENUM (
  'CAPTCHA_ONLY',
  'SCREENING_ONLY',
  'EITHER',
  'BOTH'
);

CREATE TABLE "GuildOnboardingConfig" (
  "guildId" VARCHAR(20) NOT NULL,
  "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "goodbyeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "verificationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "autoRoleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "welcomeCardEnabled" BOOLEAN NOT NULL DEFAULT false,
  "verificationChannelId" VARCHAR(20),
  "verifiedRoleId" VARCHAR(20),
  "unverifiedRoleId" VARCHAR(20),
  "verificationMessageId" VARCHAR(20),
  "setupMode" "VerificationSetupMode" NOT NULL DEFAULT 'EVERYONE_VISIBLE',
  "captchaType" "OnboardingCaptchaType" NOT NULL DEFAULT 'IMAGE_TEXT',
  "roleGrantCondition" "OnboardingRoleGrantCondition" NOT NULL DEFAULT 'CAPTCHA_ONLY',
  "resourceHealth" "OnboardingResourceHealth" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "welcomeConfig" JSONB NOT NULL DEFAULT '{}',
  "goodbyeConfig" JSONB NOT NULL DEFAULT '{}',
  "verificationConfig" JSONB NOT NULL DEFAULT '{}',
  "autoRoleConfig" JSONB NOT NULL DEFAULT '{}',
  "welcomeCardConfig" JSONB NOT NULL DEFAULT '{}',
  "setupSnapshot" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastWelcomeAt" TIMESTAMP(3),
  "lastGoodbyeAt" TIMESTAMP(3),
  "lastVerificationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildOnboardingConfig_pkey" PRIMARY KEY ("guildId"),
  CONSTRAINT "GuildOnboardingConfig_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "MemberVerification" (
  "id" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "userId" VARCHAR(20) NOT NULL,
  "status" "OnboardingVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "method" "OnboardingCaptchaType",
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "captchaVerified" BOOLEAN NOT NULL DEFAULT false,
  "membershipScreeningCompleted" BOOLEAN NOT NULL DEFAULT false,
  "rolesGranted" BOOLEAN NOT NULL DEFAULT false,
  "welcomeSent" BOOLEAN NOT NULL DEFAULT false,
  "dmSent" BOOLEAN NOT NULL DEFAULT false,
  "lastAttemptAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verifiedBy" VARCHAR(20),
  "failureReason" VARCHAR(100),
  "roleGrantedAt" TIMESTAMP(3),
  "unverifiedRoleRemovedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemberVerification_attemptCount_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "OnboardingEvent" (
  "id" UUID NOT NULL,
  "guildId" VARCHAR(20) NOT NULL,
  "userId" VARCHAR(20),
  "eventType" VARCHAR(64) NOT NULL,
  "status" "OnboardingEventStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "correlationId" VARCHAR(128) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(64),
  "failureReason" VARCHAR(255),
  "details" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnboardingEvent_attemptCount_nonnegative" CHECK ("attemptCount" >= 0)
);

CREATE INDEX "GuildOnboardingConfig_verificationEnabled_resourceHealth_idx"
ON "GuildOnboardingConfig"("verificationEnabled", "resourceHealth");
CREATE INDEX "GuildOnboardingConfig_welcomeEnabled_idx"
ON "GuildOnboardingConfig"("welcomeEnabled");
CREATE INDEX "GuildOnboardingConfig_goodbyeEnabled_idx"
ON "GuildOnboardingConfig"("goodbyeEnabled");

CREATE UNIQUE INDEX "MemberVerification_guildId_userId_key"
ON "MemberVerification"("guildId", "userId");
CREATE INDEX "MemberVerification_guildId_status_idx"
ON "MemberVerification"("guildId", "status");
CREATE INDEX "MemberVerification_guildId_verifiedAt_idx"
ON "MemberVerification"("guildId", "verifiedAt");
CREATE INDEX "MemberVerification_createdAt_idx"
ON "MemberVerification"("createdAt");

CREATE UNIQUE INDEX "OnboardingEvent_idempotencyKey_key"
ON "OnboardingEvent"("idempotencyKey");
CREATE INDEX "OnboardingEvent_guildId_occurredAt_idx"
ON "OnboardingEvent"("guildId", "occurredAt" DESC);
CREATE INDEX "OnboardingEvent_guildId_eventType_occurredAt_idx"
ON "OnboardingEvent"("guildId", "eventType", "occurredAt" DESC);
CREATE INDEX "OnboardingEvent_status_createdAt_idx"
ON "OnboardingEvent"("status", "createdAt");
CREATE INDEX "OnboardingEvent_userId_createdAt_idx"
ON "OnboardingEvent"("userId", "createdAt" DESC);

ALTER TABLE "GuildOnboardingConfig"
ADD CONSTRAINT "GuildOnboardingConfig_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberVerification"
ADD CONSTRAINT "MemberVerification_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnboardingEvent"
ADD CONSTRAINT "OnboardingEvent_guildId_fkey"
FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
