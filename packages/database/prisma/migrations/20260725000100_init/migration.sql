-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN', 'DEVELOPER', 'OWNER');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "CommandSubjectType" AS ENUM ('EVERYONE', 'USER', 'ROLE', 'CHANNEL');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'DEAD_LETTERED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "discordId" VARCHAR(20) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "avatarHash" VARCHAR(128),
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCredential" (
    "userId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'discord',
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenType" VARCHAR(32),
    "scope" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "iconHash" VARCHAR(128),
    "ownerDiscordId" VARCHAR(20) NOT NULL,
    "botInstalled" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" VARCHAR(20) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "commandPrefix" VARCHAR(5) NOT NULL DEFAULT '!',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GuildModule" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "moduleKey" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildRolePermission" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "discordRoleId" VARCHAR(20) NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildCommandOverride" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "commandName" VARCHAR(64) NOT NULL,
    "subjectType" "CommandSubjectType" NOT NULL,
    "subjectId" VARCHAR(32) NOT NULL,
    "allow" TEXT[],
    "deny" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildCommandOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildAuditLog" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20),
    "actorUserId" UUID,
    "actorDiscordId" VARCHAR(20),
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(64) NOT NULL,
    "resourceId" VARCHAR(128),
    "previousValue" JSONB,
    "newValue" JSONB,
    "ipAddressHash" CHAR(64),
    "userAgent" VARCHAR(255),
    "requestId" VARCHAR(128) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "failureReason" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildAccessGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "permissionBitfield" VARCHAR(32) NOT NULL,
    "source" VARCHAR(32) NOT NULL DEFAULT 'discord_oauth',
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardAccessLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "guildId" VARCHAR(20),
    "route" VARCHAR(255) NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "failureReason" VARCHAR(255),
    "ipAddressHash" CHAR(64),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandUsage" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20),
    "userId" UUID,
    "discordUserId" VARCHAR(20) NOT NULL,
    "commandName" VARCHAR(64) NOT NULL,
    "correlationId" VARCHAR(128) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" VARCHAR(64),
    "shardId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "guildId" VARCHAR(20),
    "name" VARCHAR(100) NOT NULL,
    "keyPrefix" VARCHAR(16) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "scopes" TEXT[],
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "guildId" VARCHAR(20) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerReference" VARCHAR(128) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "planKey" VARCHAR(64) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "scopeKey" VARCHAR(32) NOT NULL,
    "guildId" VARCHAR(20),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJobRecord" (
    "id" UUID NOT NULL,
    "queueName" VARCHAR(64) NOT NULL,
    "jobName" VARCHAR(64) NOT NULL,
    "bullJobId" VARCHAR(128),
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payloadHash" CHAR(64) NOT NULL,
    "errorCode" VARCHAR(64),
    "lastError" VARCHAR(500),
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "User_platformRole_idx" ON "User"("platformRole");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");

-- CreateIndex
CREATE INDEX "Guild_ownerDiscordId_idx" ON "Guild"("ownerDiscordId");

-- CreateIndex
CREATE INDEX "Guild_botInstalled_leftAt_idx" ON "Guild"("botInstalled", "leftAt");

-- CreateIndex
CREATE INDEX "GuildModule_guildId_enabled_idx" ON "GuildModule"("guildId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "GuildModule_guildId_moduleKey_key" ON "GuildModule"("guildId", "moduleKey");

-- CreateIndex
CREATE INDEX "GuildRolePermission_guildId_idx" ON "GuildRolePermission"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildRolePermission_guildId_discordRoleId_key" ON "GuildRolePermission"("guildId", "discordRoleId");

-- CreateIndex
CREATE INDEX "GuildCommandOverride_guildId_commandName_idx" ON "GuildCommandOverride"("guildId", "commandName");

-- CreateIndex
CREATE UNIQUE INDEX "GuildCommandOverride_guildId_commandName_subjectType_subjec_key" ON "GuildCommandOverride"("guildId", "commandName", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "GuildAuditLog_guildId_createdAt_idx" ON "GuildAuditLog"("guildId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GuildAuditLog_actorUserId_createdAt_idx" ON "GuildAuditLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GuildAuditLog_action_createdAt_idx" ON "GuildAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GuildAuditLog_requestId_idx" ON "GuildAuditLog"("requestId");

-- CreateIndex
CREATE INDEX "GuildAccessGrant_guildId_expiresAt_idx" ON "GuildAccessGrant"("guildId", "expiresAt");

-- CreateIndex
CREATE INDEX "GuildAccessGrant_userId_expiresAt_idx" ON "GuildAccessGrant"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuildAccessGrant_userId_guildId_key" ON "GuildAccessGrant"("userId", "guildId");

-- CreateIndex
CREATE INDEX "DashboardAccessLog_userId_createdAt_idx" ON "DashboardAccessLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DashboardAccessLog_guildId_createdAt_idx" ON "DashboardAccessLog"("guildId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommandUsage_guildId_commandName_createdAt_idx" ON "CommandUsage"("guildId", "commandName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommandUsage_discordUserId_createdAt_idx" ON "CommandUsage"("discordUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommandUsage_createdAt_idx" ON "CommandUsage"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_status_idx" ON "ApiKey"("userId", "status");

-- CreateIndex
CREATE INDEX "ApiKey_guildId_status_idx" ON "ApiKey"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerReference_key" ON "Subscription"("providerReference");

-- CreateIndex
CREATE INDEX "Subscription_guildId_status_idx" ON "Subscription"("guildId", "status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "FeatureFlag_guildId_enabled_idx" ON "FeatureFlag"("guildId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_scopeKey_key" ON "FeatureFlag"("key", "scopeKey");

-- CreateIndex
CREATE INDEX "BackgroundJobRecord_status_scheduledFor_idx" ON "BackgroundJobRecord"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "BackgroundJobRecord_queueName_createdAt_idx" ON "BackgroundJobRecord"("queueName", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJobRecord_queueName_idempotencyKey_key" ON "BackgroundJobRecord"("queueName", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "OAuthCredential" ADD CONSTRAINT "OAuthCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildModule" ADD CONSTRAINT "GuildModule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildRolePermission" ADD CONSTRAINT "GuildRolePermission_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildCommandOverride" ADD CONSTRAINT "GuildCommandOverride_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildAuditLog" ADD CONSTRAINT "GuildAuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildAuditLog" ADD CONSTRAINT "GuildAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildAccessGrant" ADD CONSTRAINT "GuildAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildAccessGrant" ADD CONSTRAINT "GuildAccessGrant_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAccessLog" ADD CONSTRAINT "DashboardAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAccessLog" ADD CONSTRAINT "DashboardAccessLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandUsage" ADD CONSTRAINT "CommandUsage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandUsage" ADD CONSTRAINT "CommandUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
