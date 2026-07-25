-- CreateTable
CREATE TABLE "PlatformConfiguration" (
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfiguration_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ModuleDefinition" (
    "key" VARCHAR(64) NOT NULL,
    "enabledByDefault" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LocaleDefinition" (
    "code" VARCHAR(5) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocaleDefinition_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "LocaleDefinition_enabled_idx" ON "LocaleDefinition"("enabled");

-- CreateIndex
CREATE INDEX "LocaleDefinition_isDefault_idx" ON "LocaleDefinition"("isDefault");
