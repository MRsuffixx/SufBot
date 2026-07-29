import type { DistributedCache } from '@sufbot/cache';
import { appendAuditLog } from '@sufbot/database';
import type { GuildOnboardingConfig, Prisma, PrismaClient } from '@sufbot/database/generated';
import { ConflictError, NotFoundError } from '@sufbot/shared';
import {
  AutoRoleConfigSchema,
  AutoRoleUpdateSchema,
  GoodbyeConfigSchema,
  GoodbyeUpdateSchema,
  OnboardingBasicsInputSchema,
  OnboardingConfigResponseSchema,
  VerificationConfigSchema,
  VerificationUpdateSchema,
  WelcomeCardConfigSchema,
  WelcomeCardUpdateSchema,
  WelcomeConfigSchema,
  WelcomeUpdateSchema,
  defaultAutoRoleConfig,
  defaultGoodbyeConfig,
  defaultVerificationConfig,
  defaultWelcomeCardConfig,
  defaultWelcomeConfig,
  type OnboardingConfigResponse,
  type VerificationSetupRequest,
} from './contracts.js';

export type OnboardingActor = {
  actorUserId?: string;
  actorDiscordId: string;
  requestId: string;
  source: 'dashboard' | 'api' | 'bot' | 'worker';
  userAgent?: string;
};

export type VerificationSetupResult = {
  pendingVersion: number;
  mode: VerificationSetupRequest['mode'];
  verificationChannelId: string;
  verifiedRoleId: string;
  unverifiedRoleId: string | null;
  verificationMessageId: string;
  setupSnapshot: Prisma.InputJsonValue;
  health: 'HEALTHY' | 'PARTIAL' | 'BROKEN';
};

export type VerificationResourceKind =
  | 'verification-channel'
  | 'verified-role'
  | 'unverified-role'
  | 'verification-message';

const jsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const toResponse = (record: GuildOnboardingConfig): OnboardingConfigResponse =>
  OnboardingConfigResponseSchema.parse({
    guildId: record.guildId,
    welcomeEnabled: record.welcomeEnabled,
    goodbyeEnabled: record.goodbyeEnabled,
    verificationEnabled: record.verificationEnabled,
    autoRoleEnabled: record.autoRoleEnabled,
    welcomeCardEnabled: record.welcomeCardEnabled,
    verificationChannelId: record.verificationChannelId,
    verifiedRoleId: record.verifiedRoleId,
    unverifiedRoleId: record.unverifiedRoleId,
    verificationMessageId: record.verificationMessageId,
    setupMode: record.setupMode,
    captchaType: record.captchaType,
    roleGrantCondition: record.roleGrantCondition,
    resourceHealth: record.resourceHealth,
    welcome: WelcomeConfigSchema.parse(record.welcomeConfig),
    goodbye: GoodbyeConfigSchema.parse(record.goodbyeConfig),
    verification: VerificationConfigSchema.parse(record.verificationConfig),
    autoRole: AutoRoleConfigSchema.parse(record.autoRoleConfig),
    welcomeCard: WelcomeCardConfigSchema.parse(record.welcomeCardConfig),
    version: record.version,
    lastWelcomeAt: record.lastWelcomeAt?.toISOString() ?? null,
    lastGoodbyeAt: record.lastGoodbyeAt?.toISOString() ?? null,
    lastVerificationAt: record.lastVerificationAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  });

export class OnboardingRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: Pick<DistributedCache, 'getOrLoad' | 'publish'>,
  ) {}

  public async get(guildId: string): Promise<OnboardingConfigResponse> {
    if (this.cache === undefined) return toResponse(await this.#ensure(guildId));
    return this.cache.getOrLoad(
      guildId,
      'module:onboarding',
      OnboardingConfigResponseSchema,
      async () => toResponse(await this.#ensure(guildId)),
    );
  }

  public async updateBasics(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = OnboardingBasicsInputSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      {
        welcomeEnabled: validated.welcomeEnabled,
        goodbyeEnabled: validated.goodbyeEnabled,
        verificationEnabled: validated.verificationEnabled,
        autoRoleEnabled: validated.autoRoleEnabled,
        welcomeCardEnabled: validated.welcomeCardEnabled,
      },
      'onboarding.basics.updated',
      actor,
    );
  }

  public async updateWelcome(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = WelcomeUpdateSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      { welcomeConfig: jsonValue(validated.config) },
      'onboarding.welcome.updated',
      actor,
    );
  }

  public async updateGoodbye(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = GoodbyeUpdateSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      { goodbyeConfig: jsonValue(validated.config) },
      'onboarding.goodbye.updated',
      actor,
    );
  }

  public async updateVerification(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = VerificationUpdateSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      {
        setupMode: validated.setupMode,
        captchaType: validated.captchaType,
        roleGrantCondition: validated.roleGrantCondition,
        verificationConfig: jsonValue(validated.config),
      },
      'onboarding.verification.updated',
      actor,
    );
  }

  public async updateRoles(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = AutoRoleUpdateSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      { autoRoleConfig: jsonValue(validated.config) },
      'onboarding.roles.updated',
      actor,
    );
  }

  public async updateWelcomeCard(input: unknown, guildId: string, actor: OnboardingActor) {
    const validated = WelcomeCardUpdateSchema.parse(input);
    return this.#update(
      guildId,
      validated.expectedVersion,
      { welcomeCardConfig: jsonValue(validated.config) },
      'onboarding.welcome-card.updated',
      actor,
    );
  }

  public async beginVerificationSetup(
    request: VerificationSetupRequest,
    guildId: string,
    actor: OnboardingActor,
  ): Promise<OnboardingConfigResponse> {
    await this.#ensure(guildId);
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildOnboardingConfig.findUniqueOrThrow({
        where: { guildId },
      });
      if (current.version !== request.expectedVersion || current.resourceHealth === 'PENDING') {
        throw new ConflictError('Onboarding configuration was changed by another request.');
      }
      const changed = await transaction.guildOnboardingConfig.updateMany({
        where: { guildId, version: request.expectedVersion },
        data: {
          resourceHealth: 'PENDING',
          setupMode: request.mode,
          setupSnapshot: jsonValue({
            requestId: actor.requestId,
            operation: request.operation,
            requestedAt: new Date().toISOString(),
          }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictError('Onboarding configuration was changed by another request.');
      }
      const updated = await transaction.guildOnboardingConfig.findUniqueOrThrow({
        where: { guildId },
      });
      await appendAuditLog(transaction, {
        guildId,
        ...(actor.actorUserId === undefined ? {} : { actorUserId: actor.actorUserId }),
        actorDiscordId: actor.actorDiscordId,
        action: 'onboarding.verification-setup.started',
        resourceType: 'GuildOnboardingConfig',
        resourceId: guildId,
        previousValue: current,
        newValue: {
          version: updated.version,
          operation: request.operation,
          mode: request.mode,
          channelStrategy: request.channel.strategy,
          verifiedRoleStrategy: request.verifiedRole.strategy,
          migrationMode: request.migration.mode,
        },
        requestId: actor.requestId,
        outcome: 'SUCCESS',
        metadata: { source: actor.source },
      });
      return updated;
    });
    await this.#publish(record);
    return toResponse(record);
  }

  public async completeVerificationSetup(
    result: VerificationSetupResult,
    guildId: string,
    actor: OnboardingActor,
  ): Promise<OnboardingConfigResponse> {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildOnboardingConfig.findUniqueOrThrow({
        where: { guildId },
      });
      if (current.version !== result.pendingVersion || current.resourceHealth !== 'PENDING') {
        throw new ConflictError('Verification setup no longer owns the pending configuration.');
      }
      const updated = await transaction.guildOnboardingConfig.update({
        where: { guildId },
        data: {
          verificationEnabled: true,
          setupMode: result.mode,
          verificationChannelId: result.verificationChannelId,
          verifiedRoleId: result.verifiedRoleId,
          unverifiedRoleId: result.unverifiedRoleId,
          verificationMessageId: result.verificationMessageId,
          setupSnapshot: result.setupSnapshot,
          resourceHealth: result.health,
          version: { increment: 1 },
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        actorDiscordId: actor.actorDiscordId,
        action: 'onboarding.verification-setup.completed',
        resourceType: 'GuildOnboardingConfig',
        resourceId: guildId,
        previousValue: current,
        newValue: updated,
        requestId: actor.requestId,
        outcome: result.health === 'HEALTHY' ? 'SUCCESS' : 'FAILURE',
        metadata: { source: actor.source },
        ...(result.health === 'HEALTHY'
          ? {}
          : { failureReason: 'Verification setup completed with unhealthy resources.' }),
      });
      return updated;
    });
    await this.#publish(record);
    return toResponse(record);
  }

  public async failVerificationSetup(
    guildId: string,
    pendingVersion: number,
    actor: OnboardingActor,
    reason: string,
    partial: boolean,
  ): Promise<void> {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildOnboardingConfig.findUnique({
        where: { guildId },
      });
      if (
        current === null ||
        current.version !== pendingVersion ||
        current.resourceHealth !== 'PENDING'
      ) {
        return null;
      }
      const updated = await transaction.guildOnboardingConfig.update({
        where: { guildId },
        data: {
          resourceHealth: partial ? 'PARTIAL' : 'BROKEN',
          version: { increment: 1 },
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        actorDiscordId: actor.actorDiscordId,
        action: 'onboarding.verification-setup.failed',
        resourceType: 'GuildOnboardingConfig',
        resourceId: guildId,
        previousValue: current,
        newValue: updated,
        requestId: actor.requestId,
        outcome: 'FAILURE',
        failureReason: reason,
        metadata: { source: actor.source },
      });
      return updated;
    });
    if (record !== null) await this.#publish(record);
  }

  public async markVerificationResourceDeleted(
    guildId: string,
    resource: { kind: VerificationResourceKind; id: string },
    actor: OnboardingActor,
  ): Promise<boolean> {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildOnboardingConfig.findUnique({
        where: { guildId },
      });
      if (current === null) return null;
      const matches =
        (resource.kind === 'verification-channel' &&
          current.verificationChannelId === resource.id) ||
        (resource.kind === 'verified-role' && current.verifiedRoleId === resource.id) ||
        (resource.kind === 'unverified-role' && current.unverifiedRoleId === resource.id) ||
        (resource.kind === 'verification-message' &&
          current.verificationMessageId === resource.id);
      if (!matches) return null;

      const updated = await transaction.guildOnboardingConfig.update({
        where: { guildId },
        data: {
          resourceHealth: 'BROKEN',
          version: { increment: 1 },
        },
      });
      await appendAuditLog(transaction, {
        guildId,
        actorDiscordId: actor.actorDiscordId,
        action: 'onboarding.verification-resource.deleted',
        resourceType: resource.kind,
        resourceId: resource.id,
        previousValue: {
          resourceHealth: current.resourceHealth,
          configurationVersion: current.version,
        },
        newValue: {
          resourceHealth: updated.resourceHealth,
          configurationVersion: updated.version,
        },
        requestId: actor.requestId,
        outcome: 'FAILURE',
        failureReason: 'A configured Discord verification resource was deleted.',
        metadata: { source: actor.source },
      });
      return updated;
    });
    if (record === null) return false;
    await this.#publish(record);
    return true;
  }

  async #ensure(guildId: string): Promise<GuildOnboardingConfig> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true },
    });
    if (guild === null) throw new NotFoundError('Guild');
    return this.prisma.guildOnboardingConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        welcomeConfig: jsonValue(defaultWelcomeConfig()),
        goodbyeConfig: jsonValue(defaultGoodbyeConfig()),
        verificationConfig: jsonValue(defaultVerificationConfig()),
        autoRoleConfig: jsonValue(defaultAutoRoleConfig()),
        welcomeCardConfig: jsonValue(defaultWelcomeCardConfig()),
      },
      update: {},
    });
  }

  async #update(
    guildId: string,
    expectedVersion: number,
    data: Prisma.GuildOnboardingConfigUncheckedUpdateInput,
    action: string,
    actor: OnboardingActor,
  ): Promise<OnboardingConfigResponse> {
    await this.#ensure(guildId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.guildOnboardingConfig.findUnique({ where: { guildId } });
      if (current === null) throw new NotFoundError('Onboarding configuration');
      if (current.resourceHealth === 'PENDING') {
        throw new ConflictError('Verification setup is currently in progress.');
      }
      if (current.version !== expectedVersion) {
        throw new ConflictError('Onboarding configuration was changed by another request.');
      }
      const changed = await transaction.guildOnboardingConfig.updateMany({
        where: { guildId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictError('Onboarding configuration was changed by another request.');
      }
      const record = await transaction.guildOnboardingConfig.findUniqueOrThrow({
        where: { guildId },
      });
      await appendAuditLog(transaction, {
        guildId,
        ...(actor.actorUserId === undefined ? {} : { actorUserId: actor.actorUserId }),
        actorDiscordId: actor.actorDiscordId,
        action,
        resourceType: 'GuildOnboardingConfig',
        resourceId: guildId,
        previousValue: current,
        newValue: record,
        requestId: actor.requestId,
        outcome: 'SUCCESS',
        metadata: { source: actor.source },
        ...(actor.userAgent === undefined ? {} : { userAgent: actor.userAgent }),
      });
      return record;
    });
    const response = toResponse(updated);
    await this.#publish(updated);
    return response;
  }

  async #publish(record: GuildOnboardingConfig): Promise<void> {
    if (this.cache === undefined) return;
    await this.cache.publish({
      type: 'guild.config.updated',
      guildId: record.guildId,
      module: 'onboarding',
      version: record.version,
      timestamp: new Date().toISOString(),
    });
  }
}
