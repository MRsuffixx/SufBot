import { createHmac, randomBytes } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  DiscordAPIError,
  PermissionFlagsBits,
  type APIEmbed,
  type Client,
  type Guild,
  type GuildMember,
  type MessageCreateOptions,
  type Role,
  type TextChannel,
} from 'discord.js';
import { appendAuditLog } from '@sufbot/database';
import {
  OnboardingEventJournal,
  OnboardingRepository,
  deduplicateRoleIds,
  evaluateOnboardingRole,
  isPostVerificationConditionSatisfied,
  renderOnboardingMessage,
  safeTemplateText,
  type OnboardingConfigResponse,
  type OnboardingTemplateVariables,
  type RenderedOnboardingMessage,
  type VerificationSetupRequest,
} from '@sufbot/onboarding';
import {
  DeadLetterJobSchema,
  OnboardingJobSchema,
  QueueName,
  createQueueIdentity,
  type OnboardingJob,
  type QueueRegistry,
} from '@sufbot/queue';
import { sha256 } from '@sufbot/shared';
import type { BotServices } from './services.js';

const requiredChannelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

type RoleAssignmentResult = {
  assigned: string[];
  alreadyAssigned: string[];
  failed: { roleId: string; code: string }[];
};

const buttonStyle = (style: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER'): ButtonStyle => {
  switch (style) {
    case 'PRIMARY':
      return ButtonStyle.Primary;
    case 'SECONDARY':
      return ButtonStyle.Secondary;
    case 'SUCCESS':
      return ButtonStyle.Success;
    case 'DANGER':
      return ButtonStyle.Danger;
  }
};

const eventNameForJob = (job: OnboardingJob['job']): string => {
  switch (job) {
    case 'onboarding.send-welcome-channel':
      return 'welcome.channel.send';
    case 'onboarding.send-welcome-dm':
      return 'welcome.dm.send';
    case 'onboarding.assign-join-roles':
      return 'roles.join.assign';
    case 'onboarding.evaluate-member-conditions':
      return 'roles.conditions.evaluate';
    case 'onboarding.verification-setup':
      return 'verification.setup';
    case 'onboarding.verification-migrate-members':
      return 'verification.member-migration';
    case 'onboarding.test-welcome-channel':
      return 'welcome.channel.test';
    case 'onboarding.test-welcome-dm':
      return 'welcome.dm.test';
    case 'onboarding.test-goodbye-channel':
      return 'goodbye.channel.test';
    case 'onboarding.send-goodbye-channel':
      return 'goodbye.channel.send';
    case 'onboarding.delete-message':
      return 'onboarding.message.delete';
  }
};

const deliveryMatchesTrigger = (
  delivery: 'ON_JOIN' | 'AFTER_VERIFICATION' | 'BOTH',
  trigger: 'JOIN' | 'VERIFICATION',
): boolean =>
  delivery === 'BOTH' ||
  (delivery === 'ON_JOIN' && trigger === 'JOIN') ||
  (delivery === 'AFTER_VERIFICATION' && trigger === 'VERIFICATION');

const dateVariables = (now: Date, locale: 'en' | 'tr'): OnboardingTemplateVariables => {
  const language = locale === 'tr' ? 'tr-TR' : 'en-US';
  return {
    date: new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(now),
    time: new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(now),
    datetime: new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(now),
  };
};

const memberVariables = (
  guild: Guild,
  member: GuildMember,
  locale: 'en' | 'tr',
  now: Date,
): OnboardingTemplateVariables => ({
  ...dateVariables(now, locale),
  user: `<@${member.id}>`,
  'user.mention': `<@${member.id}>`,
  'user.id': member.id,
  'user.username': safeTemplateText(member.user.username),
  'user.displayName': safeTemplateText(member.displayName),
  'user.globalName': safeTemplateText(member.user.globalName ?? member.user.username),
  'user.tag': safeTemplateText(member.user.tag),
  'user.avatar': member.displayAvatarURL({ extension: 'png', size: 256 }),
  'user.createdAt': member.user.createdAt,
  'user.accountAge': Math.max(
    0,
    Math.floor((now.getTime() - member.user.createdTimestamp) / 86_400_000),
  ),
  server: safeTemplateText(guild.name),
  'server.name': safeTemplateText(guild.name),
  'server.id': guild.id,
  'server.icon': guild.iconURL({ extension: 'png', size: 256 }) ?? '',
  'server.memberCount': guild.memberCount,
  'server.ownerId': guild.ownerId,
  'member.joinedAt': member.joinedAt ?? now,
  'member.number': guild.memberCount,
  'member.roles': safeTemplateText(
    member.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((left, right) => right.position - left.position)
      .map((role) => role.name)
      .join(', '),
  ),
});

const goodbyeVariables = (
  guild: Guild,
  payload: Extract<OnboardingJob, { job: 'onboarding.send-goodbye-channel' }>,
  locale: 'en' | 'tr',
  now: Date,
): OnboardingTemplateVariables => {
  const snapshot = payload.snapshot;
  const joinedAt = snapshot.joinedAt === null ? null : new Date(snapshot.joinedAt);
  const joinDuration =
    joinedAt === null
      ? ''
      : Math.max(0, Math.floor((now.getTime() - joinedAt.getTime()) / 86_400_000));
  return {
    ...dateVariables(now, locale),
    user: safeTemplateText(snapshot.displayName),
    'user.mention': safeTemplateText(`@${snapshot.displayName}`),
    'user.id': payload.userId,
    'user.idname': safeTemplateText(`${snapshot.displayName} (${payload.userId})`),
    'user.username': safeTemplateText(snapshot.username),
    'user.displayName': safeTemplateText(snapshot.displayName),
    'user.globalName': safeTemplateText(snapshot.globalName ?? snapshot.username),
    'user.tag': safeTemplateText(snapshot.username),
    'user.avatar': snapshot.avatarUrl,
    'user.createdAt': new Date(snapshot.accountCreatedAt),
    'user.accountAge': Math.max(
      0,
      Math.floor((now.getTime() - new Date(snapshot.accountCreatedAt).getTime()) / 86_400_000),
    ),
    server: safeTemplateText(guild.name),
    'server.name': safeTemplateText(guild.name),
    'server.id': guild.id,
    'server.icon': guild.iconURL({ extension: 'png', size: 256 }) ?? '',
    'server.memberCount': guild.memberCount,
    'server.ownerId': guild.ownerId,
    'member.joinedAt': joinedAt,
    'member.number': guild.memberCount,
    'member.roles': safeTemplateText(snapshot.roleNames.join(', ')),
    'member.joinDurationDays': joinDuration,
  };
};

const asDiscordMessage = (rendered: RenderedOnboardingMessage): MessageCreateOptions => {
  const embed = rendered.embed;
  const apiEmbed: APIEmbed | undefined =
    embed === undefined
      ? undefined
      : {
          color: embed.color,
          ...(embed.author === undefined
            ? {}
            : {
                author: {
                  name: embed.author.name,
                  ...(embed.author.iconUrl === undefined ? {} : { icon_url: embed.author.iconUrl }),
                  ...(embed.author.url === undefined ? {} : { url: embed.author.url }),
                },
              }),
          ...(embed.title === undefined ? {} : { title: embed.title }),
          ...(embed.description === undefined ? {} : { description: embed.description }),
          ...(embed.thumbnailUrl === undefined ? {} : { thumbnail: { url: embed.thumbnailUrl } }),
          ...(embed.imageUrl === undefined ? {} : { image: { url: embed.imageUrl } }),
          ...(embed.footer === undefined
            ? {}
            : {
                footer: {
                  text: embed.footer.text,
                  ...(embed.footer.iconUrl === undefined ? {} : { icon_url: embed.footer.iconUrl }),
                },
              }),
          ...(embed.timestamp === undefined ? {} : { timestamp: embed.timestamp }),
          fields: embed.fields,
        };
  return {
    ...(rendered.content === undefined ? {} : { content: rendered.content }),
    ...(apiEmbed === undefined ? {} : { embeds: [apiEmbed] }),
    allowedMentions: rendered.allowedMentions,
  };
};

const asDiscordTestMessage = (rendered: RenderedOnboardingMessage): MessageCreateOptions => {
  const message = asDiscordMessage(rendered);
  const banner = '**SufBot onboarding test — no member event occurred.**';
  return {
    ...message,
    content:
      typeof message.content === 'string' && message.content.length > 0
        ? `${banner}\n${message.content}`.slice(0, 2000)
        : banner,
  };
};

const sanitizedFailure = (error: unknown): { code: string; reason: string } => {
  if (error instanceof DiscordAPIError) {
    return {
      code: `DISCORD_${String(error.code)}`.slice(0, 64),
      reason: 'Discord rejected the onboarding operation.',
    };
  }
  return { code: 'ONBOARDING_DELIVERY_FAILED', reason: 'The onboarding operation failed.' };
};

export class OnboardingService {
  readonly #repository: OnboardingRepository;
  readonly #journal: OnboardingEventJournal;
  readonly #identity;
  readonly #deadLetterQueue: Queue;
  #worker: Worker | undefined;

  public constructor(
    private readonly client: Client<true>,
    private readonly services: BotServices,
    private readonly queues: QueueRegistry,
  ) {
    this.#repository = new OnboardingRepository(services.prisma, services.cache);
    this.#journal = new OnboardingEventJournal(services.prisma);
    this.#identity = createQueueIdentity(
      services.config.queue.prefix,
      QueueName.DiscordNotifications,
    );
    const deadLetterIdentity = createQueueIdentity(
      services.config.queue.prefix,
      QueueName.DeadLetter,
    );
    this.#deadLetterQueue = new Queue(deadLetterIdentity.name, {
      connection: queues.connection,
      prefix: deadLetterIdentity.prefix,
    });
  }

  public async start(): Promise<void> {
    if (this.#worker !== undefined) return;
    this.#worker = new Worker(
      this.#identity.name,
      async (job: Job): Promise<void> => this.#process(OnboardingJobSchema.parse(job.data)),
      {
        connection: this.queues.connection,
        prefix: this.#identity.prefix,
        concurrency: 5,
        lockDuration: 60_000,
      },
    );
    this.#worker.on('failed', (job, error) => void this.#handleFailure(job, error));
    this.#worker.on('error', (error) =>
      this.services.logger.error({ err: error }, 'onboarding queue connection error'),
    );
    await this.#worker.waitUntilReady();
  }

  public async close(): Promise<void> {
    await this.#worker?.close();
    this.#worker = undefined;
    await this.#deadLetterQueue.close();
  }

  public async handleMemberAdd(member: GuildMember): Promise<void> {
    const config = await this.#repository.get(member.guild.id);
    const joinedAt = (member.joinedAt ?? new Date()).toISOString();
    if (config.verificationEnabled) {
      await this.services.prisma.memberVerification.upsert({
        where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
        create: {
          guildId: member.guild.id,
          userId: member.id,
          status: 'PENDING',
          membershipScreeningCompleted: member.pending === false,
        },
        update: {
          status: 'PENDING',
          method: null,
          attemptCount: 0,
          captchaVerified: false,
          membershipScreeningCompleted: member.pending === false,
          rolesGranted: false,
          welcomeSent: false,
          dmSent: false,
          verifiedAt: null,
          verifiedBy: null,
          failureReason: null,
          roleGrantedAt: null,
          unverifiedRoleRemovedAt: null,
          closedAt: null,
        },
      });
    }
    if (config.welcomeEnabled && (!config.welcome.ignoreBots || !member.user.bot)) {
      if (
        config.welcome.channelId !== null &&
        deliveryMatchesTrigger(config.welcome.delivery, 'JOIN')
      ) {
        await this.#enqueue({
          job: 'onboarding.send-welcome-channel',
          idempotencyKey: `welcome:channel:${member.guild.id}:${member.id}:${joinedAt}`,
          correlationId: `join:${member.guild.id}:${member.id}:${joinedAt}`,
          guildId: member.guild.id,
          userId: member.id,
          joinedAt,
          trigger: 'JOIN',
          deliverAt: new Date(Date.now() + config.welcome.delaySeconds * 1000).toISOString(),
        });
      }
      if (config.welcome.dmEnabled && deliveryMatchesTrigger(config.welcome.dmDelivery, 'JOIN')) {
        await this.#enqueue({
          job: 'onboarding.send-welcome-dm',
          idempotencyKey: `welcome:dm:${member.guild.id}:${member.id}:${joinedAt}`,
          correlationId: `join:${member.guild.id}:${member.id}:${joinedAt}`,
          guildId: member.guild.id,
          userId: member.id,
          joinedAt,
          trigger: 'JOIN',
          deliverAt: new Date(Date.now() + config.welcome.dmDelaySeconds * 1000).toISOString(),
        });
      }
    }
    if (
      config.autoRoleEnabled ||
      (config.verificationEnabled &&
        config.setupMode === 'DEDICATED_UNVERIFIED_ROLE' &&
        config.unverifiedRoleId !== null)
    ) {
      await this.#enqueue({
        job: 'onboarding.assign-join-roles',
        idempotencyKey: `roles:join:${member.guild.id}:${member.id}:${joinedAt}`,
        correlationId: `join:${member.guild.id}:${member.id}:${joinedAt}`,
        guildId: member.guild.id,
        userId: member.id,
        joinedAt,
        deliverAt: new Date(Date.now() + config.autoRole.joinDelaySeconds * 1000).toISOString(),
      });
    }
  }

  public async handleMemberUpdate(previous: GuildMember, member: GuildMember): Promise<void> {
    if (previous.pending !== true || member.pending !== false) return;
    const config = await this.#repository.get(member.guild.id);
    if (!config.verificationEnabled && !config.autoRoleEnabled) return;
    const joinedAt = (member.joinedAt ?? new Date()).toISOString();
    await this.services.prisma.memberVerification.upsert({
      where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
      create: {
        guildId: member.guild.id,
        userId: member.id,
        status: 'PENDING',
        membershipScreeningCompleted: true,
      },
      update: { membershipScreeningCompleted: true },
    });
    await this.#enqueue({
      job: 'onboarding.evaluate-member-conditions',
      idempotencyKey: `roles:screening:${member.guild.id}:${member.id}:${joinedAt}`,
      correlationId: `screening:${member.guild.id}:${member.id}:${joinedAt}`,
      guildId: member.guild.id,
      userId: member.id,
      joinedAt,
      reason: 'MEMBERSHIP_SCREENING',
      deliverAt: new Date(Date.now() + config.autoRole.verifiedDelaySeconds * 1000).toISOString(),
    });
  }

  public async handleMemberRemove(member: GuildMember): Promise<void> {
    const config = await this.#repository.get(member.guild.id);
    const leftAt = new Date().toISOString();
    const joinIdentity = member.joinedAt?.toISOString() ?? `unknown-${member.id}`;
    await this.services.prisma.memberVerification.updateMany({
      where: { guildId: member.guild.id, userId: member.id, closedAt: null },
      data: { closedAt: new Date(leftAt), status: 'EXPIRED' },
    });
    if (
      !config.goodbyeEnabled ||
      config.goodbye.channelId === null ||
      (config.goodbye.ignoreBots && member.user.bot)
    ) {
      return;
    }
    await this.#enqueue({
      job: 'onboarding.send-goodbye-channel',
      idempotencyKey: `goodbye:channel:${member.guild.id}:${member.id}:${joinIdentity}`,
      correlationId: `leave:${member.guild.id}:${member.id}:${joinIdentity}`,
      guildId: member.guild.id,
      userId: member.id,
      leftAt,
      deliverAt: new Date(Date.now() + config.goodbye.delaySeconds * 1000).toISOString(),
      snapshot: {
        username: member.user.username,
        displayName: member.displayName,
        globalName: member.user.globalName,
        avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
        accountCreatedAt: member.user.createdAt.toISOString(),
        joinedAt: member.joinedAt?.toISOString() ?? null,
        roleNames: member.roles.cache
          .filter((role) => role.id !== member.guild.id)
          .sort((left, right) => right.position - left.position)
          .first(100)
          .map((role) => role.name),
        bot: member.user.bot,
      },
    });
  }

  public async handleChannelDelete(guildId: string, channelId: string): Promise<void> {
    await this.#markDeletedResource(guildId, 'verification-channel', channelId);
  }

  public async handleRoleDelete(guildId: string, roleId: string): Promise<void> {
    const verified = await this.#markDeletedResource(guildId, 'verified-role', roleId);
    if (!verified) {
      await this.#markDeletedResource(guildId, 'unverified-role', roleId);
    }
  }

  public async handleMessageDelete(guildId: string, messageId: string): Promise<void> {
    await this.#markDeletedResource(guildId, 'verification-message', messageId);
  }

  async #markDeletedResource(
    guildId: string,
    kind:
      | 'verification-channel'
      | 'verified-role'
      | 'unverified-role'
      | 'verification-message',
    resourceId: string,
  ): Promise<boolean> {
    const changed = await this.#repository.markVerificationResourceDeleted(
      guildId,
      { kind, id: resourceId },
      {
        actorDiscordId: this.client.user.id,
        requestId: `discord-delete:${kind}:${resourceId}`,
        source: 'bot',
      },
    );
    if (changed) {
      this.services.logger.warn(
        { guildId, resourceId, resourceKind: kind },
        'configured verification resource was deleted; setup requires repair',
      );
    }
    return changed;
  }

  async #enqueue(payload: OnboardingJob): Promise<void> {
    await this.queues.enqueueOnboarding(payload);
    this.services.logger.debug(
      {
        job: payload.job,
        guildId: payload.guildId,
        userId: payload.userId,
        correlationId: payload.correlationId,
      },
      'onboarding delivery queued',
    );
  }

  async #process(payload: OnboardingJob): Promise<void> {
    const claimed = await this.#journal.claim({
      guildId: payload.guildId,
      userId: payload.userId,
      eventType: eventNameForJob(payload.job),
      idempotencyKey: payload.idempotencyKey,
      correlationId: payload.correlationId,
      details: { job: payload.job },
    });
    if (!claimed) return;
    try {
      switch (payload.job) {
        case 'onboarding.send-welcome-channel':
          await this.#sendWelcomeChannel(payload);
          return;
        case 'onboarding.send-welcome-dm':
          await this.#sendWelcomeDm(payload);
          return;
        case 'onboarding.assign-join-roles':
          await this.#assignJoinRoles(payload);
          return;
        case 'onboarding.evaluate-member-conditions':
          await this.#evaluateMemberConditions(payload);
          return;
        case 'onboarding.verification-setup':
          await this.#setupVerification(payload);
          return;
        case 'onboarding.verification-migrate-members':
          await this.#migrateVerificationMembers(payload);
          return;
        case 'onboarding.test-welcome-channel':
          await this.#sendTestWelcome(payload, false);
          return;
        case 'onboarding.test-welcome-dm':
          await this.#sendTestWelcome(payload, true);
          return;
        case 'onboarding.test-goodbye-channel':
          await this.#sendTestGoodbye(payload);
          return;
        case 'onboarding.send-goodbye-channel':
          await this.#sendGoodbye(payload);
          return;
        case 'onboarding.delete-message':
          await this.#deleteMessage(payload);
          return;
      }
    } catch (error) {
      const failure = sanitizedFailure(error);
      await this.#journal.fail({
        idempotencyKey: payload.idempotencyKey,
        errorCode: failure.code,
        failureReason: failure.reason,
      });
      throw error;
    }
  }

  async #sendWelcomeChannel(
    payload: Extract<OnboardingJob, { job: 'onboarding.send-welcome-channel' }>,
  ): Promise<void> {
    const resolved = await this.#resolveCurrentMember(
      payload.guildId,
      payload.userId,
      payload.joinedAt,
    );
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    if (
      !config.welcomeEnabled ||
      config.welcome.channelId === null ||
      !deliveryMatchesTrigger(config.welcome.delivery, payload.trigger) ||
      (config.welcome.ignoreBots && member.user.bot) ||
      !this.#accountAgeEligible(member, config)
    ) {
      return this.#skip(payload, 'CONFIGURATION_NOT_ELIGIBLE');
    }
    const channel = await guild.channels.fetch(config.welcome.channelId);
    if (channel === null || !channel.isSendable())
      throw new TypeError('WELCOME_CHANNEL_UNAVAILABLE');
    this.#assertChannelPermissions(guild, channel.id, config.welcome.attachWelcomeCard);
    const locale = await this.services.localeForGuild(guild.id);
    const rendered = renderOnboardingMessage(
      config.welcome.message,
      memberVariables(guild, member, locale, new Date()),
      member.id,
    );
    this.#logTemplateWarnings(rendered, payload);
    const sent = await channel.send(asDiscordMessage(rendered));
    await this.#completeDelivery(payload, config, 'onboarding.welcome.sent', {
      channelId: channel.id,
      messageId: sent.id,
      delivery: 'channel',
    });
    await this.services.prisma.guildOnboardingConfig.updateMany({
      where: { guildId: guild.id },
      data: { lastWelcomeAt: new Date() },
    });
    await this.services.prisma.memberVerification.updateMany({
      where: { guildId: guild.id, userId: member.id },
      data: { welcomeSent: true },
    });
    if (rendered.deleteAfterSeconds > 0) {
      await this.#enqueueDelete(payload, channel.id, sent.id, rendered.deleteAfterSeconds);
    }
  }

  async #sendWelcomeDm(
    payload: Extract<OnboardingJob, { job: 'onboarding.send-welcome-dm' }>,
  ): Promise<void> {
    const resolved = await this.#resolveCurrentMember(
      payload.guildId,
      payload.userId,
      payload.joinedAt,
    );
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    if (
      !config.welcomeEnabled ||
      !config.welcome.dmEnabled ||
      !deliveryMatchesTrigger(config.welcome.dmDelivery, payload.trigger) ||
      (config.welcome.ignoreBots && member.user.bot) ||
      !this.#accountAgeEligible(member, config)
    ) {
      return this.#skip(payload, 'CONFIGURATION_NOT_ELIGIBLE');
    }
    const locale = await this.services.localeForGuild(guild.id);
    const rendered = renderOnboardingMessage(
      config.welcome.dmMessage,
      memberVariables(guild, member, locale, new Date()),
      member.id,
    );
    this.#logTemplateWarnings(rendered, payload);
    const sent = await member.send(asDiscordMessage(rendered));
    await this.#completeDelivery(payload, config, 'onboarding.welcome-dm.sent', {
      messageId: sent.id,
      delivery: 'dm',
    });
    await this.services.prisma.memberVerification.updateMany({
      where: { guildId: guild.id, userId: member.id },
      data: { dmSent: true },
    });
  }

  async #sendGoodbye(
    payload: Extract<OnboardingJob, { job: 'onboarding.send-goodbye-channel' }>,
  ): Promise<void> {
    const guild = this.client.guilds.cache.get(payload.guildId);
    if (guild === undefined) return this.#skip(payload, 'GUILD_UNAVAILABLE');
    const config = await this.#repository.get(guild.id);
    if (
      !config.goodbyeEnabled ||
      config.goodbye.channelId === null ||
      (config.goodbye.ignoreBots && payload.snapshot.bot)
    ) {
      return this.#skip(payload, 'CONFIGURATION_NOT_ELIGIBLE');
    }
    const channel = await guild.channels.fetch(config.goodbye.channelId);
    if (channel === null || !channel.isSendable())
      throw new TypeError('GOODBYE_CHANNEL_UNAVAILABLE');
    this.#assertChannelPermissions(guild, channel.id, false);
    const locale = await this.services.localeForGuild(guild.id);
    const rendered = renderOnboardingMessage(
      config.goodbye.message,
      goodbyeVariables(guild, payload, locale, new Date()),
      payload.userId,
    );
    this.#logTemplateWarnings(rendered, payload);
    const sent = await channel.send(asDiscordMessage(rendered));
    await this.#completeDelivery(payload, config, 'onboarding.goodbye.sent', {
      channelId: channel.id,
      messageId: sent.id,
      delivery: 'channel',
    });
    await this.services.prisma.guildOnboardingConfig.updateMany({
      where: { guildId: guild.id },
      data: { lastGoodbyeAt: new Date() },
    });
    if (rendered.deleteAfterSeconds > 0) {
      await this.#enqueueDelete(payload, channel.id, sent.id, rendered.deleteAfterSeconds);
    }
  }

  async #assignJoinRoles(
    payload: Extract<OnboardingJob, { job: 'onboarding.assign-join-roles' }>,
  ): Promise<void> {
    const resolved = await this.#resolveCurrentMember(
      payload.guildId,
      payload.userId,
      payload.joinedAt,
    );
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    const configuredRoles = config.autoRoleEnabled
      ? member.user.bot
        ? config.autoRole.joinBotRoleIds
        : config.autoRole.joinHumanRoleIds
      : [];
    const roleIds = deduplicateRoleIds(
      config.verificationEnabled &&
        config.setupMode === 'DEDICATED_UNVERIFIED_ROLE' &&
        config.unverifiedRoleId !== null
        ? [config.unverifiedRoleId]
        : [],
      configuredRoles,
    );
    if (roleIds.length === 0) return this.#skip(payload, 'NO_JOIN_ROLES_CONFIGURED');
    const result = await this.#assignRoles(member, roleIds, config, payload.correlationId);
    await this.#completeRoleDelivery(payload, config, 'onboarding.roles.join-assigned', result, {});
  }

  async #evaluateMemberConditions(
    payload: Extract<OnboardingJob, { job: 'onboarding.evaluate-member-conditions' }>,
  ): Promise<void> {
    const resolved = await this.#resolveCurrentMember(
      payload.guildId,
      payload.userId,
      payload.joinedAt,
    );
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const [config, state] = await Promise.all([
      this.#repository.get(guild.id),
      this.services.prisma.memberVerification.findUnique({
        where: { guildId_userId: { guildId: guild.id, userId: member.id } },
      }),
    ]);
    if (state === null) return this.#skip(payload, 'VERIFICATION_STATE_MISSING');
    const satisfied = isPostVerificationConditionSatisfied(config.roleGrantCondition, state);
    const roleIds = deduplicateRoleIds(
      state.membershipScreeningCompleted && config.autoRoleEnabled
        ? config.autoRole.screeningCompleteRoleIds
        : [],
      satisfied && config.verificationEnabled && config.verifiedRoleId !== null
        ? [config.verifiedRoleId]
        : [],
      satisfied && config.autoRoleEnabled ? config.autoRole.verifiedRoleIds : [],
    );
    const result = await this.#assignRoles(member, roleIds, config, payload.correlationId);
    let unverifiedRoleRemoved = false;
    if (
      satisfied &&
      config.unverifiedRoleId !== null &&
      member.roles.cache.has(config.unverifiedRoleId)
    ) {
      const role = await guild.roles.fetch(config.unverifiedRoleId).catch(() => null);
      if (role !== null) {
        const decision = evaluateOnboardingRole(
          {
            id: role.id,
            guildId: role.guild.id,
            managed: role.managed,
            position: role.position,
            isEveryone: role.id === guild.id,
          },
          guild.id,
          guild.members.me?.roles.highest.position ?? -1,
        );
        if (decision.assignable) {
          await member.roles.remove(role, `SufBot onboarding ${payload.correlationId}`);
          unverifiedRoleRemoved = true;
        } else {
          result.failed.push({ roleId: role.id, code: decision.code });
        }
      }
    }
    await this.#completeRoleDelivery(
      payload,
      config,
      'onboarding.roles.conditions-evaluated',
      result,
      {
        satisfied,
        captchaVerified: state.captchaVerified,
        membershipScreeningCompleted: state.membershipScreeningCompleted,
        unverifiedRoleRemoved,
        reason: payload.reason,
      },
    );
    await this.services.prisma.memberVerification.updateMany({
      where: { guildId: guild.id, userId: member.id },
      data: {
        rolesGranted: satisfied && result.failed.length === 0,
        ...(satisfied && config.verificationEnabled
          ? { status: 'VERIFIED' as const, verifiedAt: state.verifiedAt ?? new Date() }
          : {}),
        ...(satisfied && result.failed.length === 0 ? { roleGrantedAt: new Date() } : {}),
        ...(unverifiedRoleRemoved ? { unverifiedRoleRemovedAt: new Date() } : {}),
      },
    });
    if (satisfied) await this.#enqueueVerifiedWelcome(member, config, payload);
  }

  async #assignRoles(
    member: GuildMember,
    roleIds: readonly string[],
    config: OnboardingConfigResponse,
    correlationId: string,
  ): Promise<RoleAssignmentResult> {
    const result: RoleAssignmentResult = {
      assigned: [],
      alreadyAssigned: [],
      failed: [],
    };
    if (roleIds.length === 0) return result;
    const botMember = member.guild.members.me;
    if (botMember === null || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new TypeError('BOT_MANAGE_ROLES_PERMISSION_MISSING');
    }
    let retryableError: unknown;
    for (const roleId of roleIds) {
      if (member.roles.cache.has(roleId)) {
        result.alreadyAssigned.push(roleId);
        continue;
      }
      const role = await member.guild.roles.fetch(roleId).catch(() => null);
      if (role === null) {
        result.failed.push({ roleId, code: 'ROLE_NOT_FOUND' });
        continue;
      }
      const decision = evaluateOnboardingRole(
        {
          id: role.id,
          guildId: role.guild.id,
          managed: role.managed,
          position: role.position,
          isEveryone: role.id === member.guild.id,
        },
        member.guild.id,
        botMember.roles.highest.position,
      );
      if (!decision.assignable) {
        result.failed.push({ roleId, code: decision.code });
        continue;
      }
      try {
        await member.roles.add(role, `SufBot onboarding ${correlationId}`);
        result.assigned.push(roleId);
      } catch (error) {
        result.failed.push({ roleId, code: 'DISCORD_ROLE_ASSIGNMENT_FAILED' });
        retryableError ??= error;
        if (!config.autoRole.continueOnError) break;
      }
    }
    if (retryableError !== undefined && config.autoRole.retryFailedAssignments) {
      throw retryableError;
    }
    return result;
  }

  async #completeRoleDelivery(
    payload: OnboardingJob,
    config: OnboardingConfigResponse,
    action: string,
    result: RoleAssignmentResult,
    context: Record<string, string | number | boolean>,
  ): Promise<void> {
    const details = {
      assignedRoleIds: result.assigned,
      alreadyAssignedRoleIds: result.alreadyAssigned,
      failedRoles: result.failed,
      ...context,
    };
    await this.services.prisma.$transaction(async (transaction) => {
      await transaction.onboardingEvent.update({
        where: { idempotencyKey: payload.idempotencyKey },
        data: {
          status: result.failed.length === 0 ? 'SUCCEEDED' : 'FAILED',
          processedAt: new Date(),
          details,
          errorCode: result.failed.length === 0 ? null : 'ROLE_ASSIGNMENT_PARTIAL',
          failureReason:
            result.failed.length === 0 ? null : 'One or more configured roles were not assignable.',
        },
      });
      await appendAuditLog(transaction, {
        guildId: payload.guildId,
        actorDiscordId: this.client.user.id,
        action,
        resourceType: 'OnboardingEvent',
        resourceId: payload.idempotencyKey,
        requestId: payload.correlationId,
        outcome: result.failed.length === 0 ? 'SUCCESS' : 'FAILURE',
        newValue: { ...details, configurationVersion: config.version },
        ...(result.failed.length === 0
          ? {}
          : { failureReason: 'One or more configured roles were not assignable.' }),
      });
    });
  }

  async #enqueueVerifiedWelcome(
    member: GuildMember,
    config: OnboardingConfigResponse,
    source: Extract<OnboardingJob, { job: 'onboarding.evaluate-member-conditions' }>,
  ): Promise<void> {
    if (!config.welcomeEnabled || (config.welcome.ignoreBots && member.user.bot)) return;
    if (
      config.welcome.channelId !== null &&
      deliveryMatchesTrigger(config.welcome.delivery, 'VERIFICATION')
    ) {
      await this.#enqueue({
        job: 'onboarding.send-welcome-channel',
        idempotencyKey: `welcome:channel:${member.guild.id}:${member.id}:${source.joinedAt}:verification`,
        correlationId: source.correlationId,
        guildId: member.guild.id,
        userId: member.id,
        joinedAt: source.joinedAt,
        trigger: 'VERIFICATION',
        deliverAt: new Date(Date.now() + config.welcome.delaySeconds * 1000).toISOString(),
      });
    }
    if (
      config.welcome.dmEnabled &&
      deliveryMatchesTrigger(config.welcome.dmDelivery, 'VERIFICATION')
    ) {
      await this.#enqueue({
        job: 'onboarding.send-welcome-dm',
        idempotencyKey: `welcome:dm:${member.guild.id}:${member.id}:${source.joinedAt}:verification`,
        correlationId: source.correlationId,
        guildId: member.guild.id,
        userId: member.id,
        joinedAt: source.joinedAt,
        trigger: 'VERIFICATION',
        deliverAt: new Date(Date.now() + config.welcome.dmDelaySeconds * 1000).toISOString(),
      });
    }
  }

  async #setupVerification(
    payload: Extract<OnboardingJob, { job: 'onboarding.verification-setup' }>,
  ): Promise<void> {
    const guild = this.client.guilds.cache.get(payload.guildId);
    if (guild === undefined) {
      if (payload.request.operation !== 'DRY_RUN') {
        await this.#repository.failVerificationSetup(
          payload.guildId,
          payload.pendingVersion,
          {
            actorDiscordId: payload.userId,
            requestId: payload.correlationId,
            source: 'bot',
          },
          'The bot is not installed in the guild.',
          false,
        );
      }
      return this.#skip(payload, 'GUILD_UNAVAILABLE');
    }
    const actorMember = await guild.members.fetch(payload.userId).catch(() => null);
    if (
      actorMember === null ||
      (!actorMember.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !actorMember.permissions.has(PermissionFlagsBits.Administrator))
    ) {
      if (payload.request.operation !== 'DRY_RUN') {
        await this.#repository.failVerificationSetup(
          guild.id,
          payload.pendingVersion,
          {
            actorDiscordId: payload.userId,
            requestId: payload.correlationId,
            source: 'bot',
          },
          'The initiating administrator no longer has Manage Guild.',
          false,
        );
      }
      throw new TypeError('VERIFICATION_SETUP_ACTOR_NOT_AUTHORIZED');
    }
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const request = payload.request;
    const current = await this.#repository.get(guild.id);
    if (
      (request.operation === 'DRY_RUN' && current.version !== request.expectedVersion) ||
      (request.operation !== 'DRY_RUN' && current.version !== payload.pendingVersion)
    ) {
      throw new TypeError('VERIFICATION_SETUP_VERSION_MISMATCH');
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      if (request.operation !== 'DRY_RUN') {
        await this.#repository.failVerificationSetup(
          guild.id,
          payload.pendingVersion,
          {
            actorDiscordId: payload.userId,
            requestId: payload.correlationId,
            source: 'bot',
          },
          'The bot is missing Manage Channels.',
          false,
        );
      }
      throw new TypeError('BOT_MANAGE_CHANNELS_PERMISSION_MISSING');
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      if (request.operation !== 'DRY_RUN') {
        await this.#repository.failVerificationSetup(
          guild.id,
          payload.pendingVersion,
          {
            actorDiscordId: payload.userId,
            requestId: payload.correlationId,
            source: 'bot',
          },
          'The bot is missing Manage Roles.',
          false,
        );
      }
      throw new TypeError('BOT_MANAGE_ROLES_PERMISSION_MISSING');
    }
    if (request.operation === 'DRY_RUN') {
      const preview = await this.#verificationSetupPreview(guild, request);
      await this.#journal.complete({
        idempotencyKey: payload.idempotencyKey,
        details: preview,
      });
      return;
    }

    let createdAnyResource = false;
    const createdResourceIds: string[] = [];
    try {
      const channel = await this.#resolveVerificationChannel(guild, request, payload.correlationId);
      if (request.channel.strategy === 'CREATE') {
        createdAnyResource = true;
        createdResourceIds.push(channel.id);
      }
      const verifiedRole = await this.#resolveVerificationRole(
        guild,
        request.verifiedRole,
        payload.correlationId,
      );
      if (request.verifiedRole.strategy === 'CREATE') {
        createdAnyResource = true;
        createdResourceIds.push(verifiedRole.id);
      }
      const unverifiedRole =
        request.mode === 'DEDICATED_UNVERIFIED_ROLE' && request.unverifiedRole !== null
          ? await this.#resolveVerificationRole(
              guild,
              request.unverifiedRole,
              payload.correlationId,
            )
          : null;
      if (request.unverifiedRole?.strategy === 'CREATE' && unverifiedRole !== null) {
        createdAnyResource = true;
        createdResourceIds.push(unverifiedRole.id);
      }
      const previousOverwrites = await this.#applyVerificationPermissions(
        guild,
        channel,
        verifiedRole,
        unverifiedRole,
        request,
        payload.correlationId,
      );
      const nonce = randomBytes(16).toString('base64url');
      const signature = createHmac('sha256', this.services.env.DISCORD_BOT_TOKEN)
        .update(`verify:v1:${guild.id}:${nonce}`)
        .digest('base64url')
        .slice(0, 22);
      const customId = `verify:v1:${nonce}:${signature}`;
      const locale = await this.services.localeForGuild(guild.id);
      const rendered = renderOnboardingMessage(
        current.verification.panelMessage,
        {
          ...dateVariables(new Date(), locale),
          server: safeTemplateText(guild.name),
          'server.name': safeTemplateText(guild.name),
          'server.id': guild.id,
          'server.memberCount': guild.memberCount,
          'verification.channel': `<#${channel.id}>`,
          'verification.role': `<@&${verifiedRole.id}>`,
        },
        payload.userId,
      );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(current.verification.buttonLabel)
          .setStyle(buttonStyle(current.verification.buttonStyle))
          .setDisabled(false),
      );
      const emoji = current.verification.buttonEmoji.trim();
      if (emoji !== '') row.components[0]?.setEmoji(emoji);
      const panelMessage = await channel.send({
        ...asDiscordMessage(rendered),
        allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
        components: [row],
      });
      const previousConfig = await this.services.prisma.guildOnboardingConfig.findUnique({
        where: { guildId: guild.id },
        select: { setupSnapshot: true },
      });
      await this.#repository.completeVerificationSetup(
        {
          pendingVersion: payload.pendingVersion,
          mode: request.mode,
          verificationChannelId: channel.id,
          verifiedRoleId: verifiedRole.id,
          unverifiedRoleId: unverifiedRole?.id ?? null,
          verificationMessageId: panelMessage.id,
          health: 'HEALTHY',
          setupSnapshot: {
            completedAt: new Date().toISOString(),
            operation: request.operation,
            createdResourceIds,
            restrictedChannelIds: request.restrictedChannelIds,
            previousOverwrites,
            panelNonceHash: sha256(nonce),
            previousSetupSnapshot: previousConfig?.setupSnapshot ?? {},
          },
        },
        guild.id,
        {
          actorDiscordId: payload.userId,
          requestId: payload.correlationId,
          source: 'bot',
        },
      );
      await this.#journal.complete({
        idempotencyKey: payload.idempotencyKey,
        details: {
          channelId: channel.id,
          verifiedRoleId: verifiedRole.id,
          unverifiedRoleId: unverifiedRole?.id ?? null,
          messageId: panelMessage.id,
          createdResourceCount: createdResourceIds.length,
        },
      });
      if (request.migration.mode !== 'NONE') {
        await this.#enqueue({
          job: 'onboarding.verification-migrate-members',
          idempotencyKey: `verification-migration:${guild.id}:${payload.correlationId}`,
          correlationId: payload.correlationId,
          guildId: guild.id,
          userId: payload.userId,
          deliverAt: new Date().toISOString(),
          verifiedRoleId: verifiedRole.id,
          unverifiedRoleId: unverifiedRole?.id ?? null,
          migration: request.migration,
        });
      }
      await this.services.guildStatus?.refreshGuild(guild, 'verification-setup');
    } catch (error) {
      await this.#repository.failVerificationSetup(
        guild.id,
        payload.pendingVersion,
        {
          actorDiscordId: payload.userId,
          requestId: payload.correlationId,
          source: 'bot',
        },
        'Verification setup failed while applying Discord resources.',
        createdAnyResource,
      );
      throw error;
    }
  }

  async #verificationSetupPreview(
    guild: Guild,
    request: VerificationSetupRequest,
  ): Promise<Record<string, string | number | boolean | string[]>> {
    if (
      request.channel.strategy === 'EXISTING' &&
      (request.channel.channelId === null ||
        guild.channels.cache.get(request.channel.channelId)?.type !== ChannelType.GuildText)
    ) {
      throw new TypeError('VERIFICATION_CHANNEL_INVALID');
    }
    for (const selection of [request.verifiedRole, request.unverifiedRole]) {
      if (selection === null || selection.strategy === 'CREATE') continue;
      const role = selection.roleId === null ? null : guild.roles.cache.get(selection.roleId);
      if (
        role === undefined ||
        role === null ||
        !role.editable ||
        role.managed ||
        role.id === guild.id
      ) {
        throw new TypeError('VERIFICATION_ROLE_INVALID');
      }
    }
    const candidates = await this.#selectMigrationMembers(guild, null, request.migration);
    return {
      operation: request.operation,
      mode: request.mode,
      willCreateChannel: request.channel.strategy === 'CREATE',
      willCreateVerifiedRole: request.verifiedRole.strategy === 'CREATE',
      willCreateUnverifiedRole: request.unverifiedRole?.strategy === 'CREATE',
      restrictedChannelCount: request.restrictedChannelIds.length,
      migrationCandidateCount: candidates.length,
      migrationPreview: candidates
        .slice(0, 15)
        .map((member) => `${member.id}:${member.displayName}`),
    };
  }

  async #resolveVerificationChannel(
    guild: Guild,
    request: VerificationSetupRequest,
    correlationId: string,
  ): Promise<TextChannel> {
    if (request.channel.strategy === 'CREATE') {
      return guild.channels.create({
        name: request.channel.name,
        type: ChannelType.GuildText,
        ...(request.channel.categoryId === null ? {} : { parent: request.channel.categoryId }),
        reason: `SufBot verification setup ${correlationId}`,
      });
    }
    const channel =
      request.channel.channelId === null
        ? null
        : await guild.channels.fetch(request.channel.channelId).catch(() => null);
    if (channel === null || channel.type !== ChannelType.GuildText) {
      throw new TypeError('VERIFICATION_CHANNEL_INVALID');
    }
    return channel;
  }

  async #resolveVerificationRole(
    guild: Guild,
    selection: NonNullable<VerificationSetupRequest['unverifiedRole']>,
    correlationId: string,
  ): Promise<Role> {
    if (selection.strategy === 'CREATE') {
      return guild.roles.create({
        name: selection.name,
        color: selection.color,
        hoist: selection.hoist,
        mentionable: selection.mentionable,
        reason: `SufBot verification setup ${correlationId}`,
      });
    }
    const role =
      selection.roleId === null
        ? null
        : await guild.roles.fetch(selection.roleId).catch(() => null);
    if (role === null || !role.editable || role.managed || role.id === guild.id) {
      throw new TypeError('VERIFICATION_ROLE_INVALID');
    }
    return role;
  }

  async #applyVerificationPermissions(
    guild: Guild,
    channel: TextChannel,
    verifiedRole: Role,
    unverifiedRole: Role | null,
    request: VerificationSetupRequest,
    correlationId: string,
  ): Promise<
    {
      channelId: string;
      targetId: string;
      existed: boolean;
      allow: string;
      deny: string;
    }[]
  > {
    const targets = [guild.id, verifiedRole.id, this.client.user.id];
    if (unverifiedRole !== null) targets.push(unverifiedRole.id);
    const snapshot = targets.map((targetId) => {
      const overwrite = channel.permissionOverwrites.cache.get(targetId);
      return {
        channelId: channel.id,
        targetId,
        existed: overwrite !== undefined,
        allow: overwrite?.allow.bitfield.toString() ?? '0',
        deny: overwrite?.deny.bitfield.toString() ?? '0',
      };
    });
    const reason = `SufBot verification setup ${correlationId}`;
    const denyWriting = {
      SendMessages: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false,
    } as const;
    await channel.permissionOverwrites.edit(
      guild.id,
      request.mode === 'EVERYONE_VISIBLE'
        ? {
            ViewChannel: true,
            ReadMessageHistory: true,
            UseApplicationCommands: true,
            ...denyWriting,
          }
        : { ViewChannel: false, ...denyWriting },
      { reason },
    );
    if (unverifiedRole !== null) {
      await channel.permissionOverwrites.edit(
        unverifiedRole,
        {
          ViewChannel: true,
          ReadMessageHistory: true,
          UseApplicationCommands: true,
          ...denyWriting,
        },
        { reason },
      );
    }
    await channel.permissionOverwrites.edit(verifiedRole, { ViewChannel: false }, { reason });
    await channel.permissionOverwrites.edit(
      this.client.user,
      {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ManageMessages: true,
        ReadMessageHistory: true,
      },
      { reason },
    );
    for (const restrictedChannelId of request.restrictedChannelIds) {
      const restricted = await guild.channels.fetch(restrictedChannelId).catch(() => null);
      if (restricted === null || !restricted.isTextBased() || restricted.isThread()) {
        throw new TypeError('RESTRICTED_CHANNEL_INVALID');
      }
      for (const targetId of [guild.id, verifiedRole.id]) {
        const overwrite = restricted.permissionOverwrites.cache.get(targetId);
        snapshot.push({
          channelId: restricted.id,
          targetId,
          existed: overwrite !== undefined,
          allow: overwrite?.allow.bitfield.toString() ?? '0',
          deny: overwrite?.deny.bitfield.toString() ?? '0',
        });
      }
      await restricted.permissionOverwrites.edit(guild.id, { ViewChannel: false }, { reason });
      await restricted.permissionOverwrites.edit(verifiedRole, { ViewChannel: true }, { reason });
      if (unverifiedRole !== null) {
        const overwrite = restricted.permissionOverwrites.cache.get(unverifiedRole.id);
        snapshot.push({
          channelId: restricted.id,
          targetId: unverifiedRole.id,
          existed: overwrite !== undefined,
          allow: overwrite?.allow.bitfield.toString() ?? '0',
          deny: overwrite?.deny.bitfield.toString() ?? '0',
        });
        await restricted.permissionOverwrites.edit(
          unverifiedRole,
          { ViewChannel: false },
          { reason },
        );
      }
    }
    return snapshot;
  }

  async #migrateVerificationMembers(
    payload: Extract<OnboardingJob, { job: 'onboarding.verification-migrate-members' }>,
  ): Promise<void> {
    const guild = this.client.guilds.cache.get(payload.guildId);
    if (guild === undefined) return this.#skip(payload, 'GUILD_UNAVAILABLE');
    const config = await this.#repository.get(guild.id);
    const members = await this.#selectMigrationMembers(
      guild,
      payload.verifiedRoleId,
      payload.migration,
    );
    const result: RoleAssignmentResult = { assigned: [], alreadyAssigned: [], failed: [] };
    for (const member of members) {
      const assignment = await this.#assignRoles(
        member,
        [payload.verifiedRoleId],
        config,
        payload.correlationId,
      );
      result.assigned.push(...assignment.assigned.map(() => member.id));
      result.alreadyAssigned.push(...assignment.alreadyAssigned.map(() => member.id));
      result.failed.push(
        ...assignment.failed.map((failure) => ({
          roleId: member.id,
          code: failure.code,
        })),
      );
      if (payload.unverifiedRoleId !== null && member.roles.cache.has(payload.unverifiedRoleId)) {
        await member.roles
          .remove(
            payload.unverifiedRoleId,
            `SufBot verification migration ${payload.correlationId}`,
          )
          .catch(() => {
            result.failed.push({ roleId: member.id, code: 'UNVERIFIED_ROLE_REMOVAL_FAILED' });
          });
      }
    }
    await this.#completeRoleDelivery(
      payload,
      config,
      'onboarding.verification.members-migrated',
      result,
      {
        migrationMode: payload.migration.mode,
        candidateCount: members.length,
      },
    );
  }

  async #selectMigrationMembers(
    guild: Guild,
    verifiedRoleId: string | null,
    migration: VerificationSetupRequest['migration'],
  ): Promise<GuildMember[]> {
    if (migration.mode === 'NONE') return [];
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    const members =
      migration.mode === 'MANUAL'
        ? (
            await Promise.all(
              migration.memberIds.map((memberId) =>
                guild.members.fetch(memberId).catch(() => null),
              ),
            )
          ).filter((member): member is GuildMember => member !== null)
        : [...(await guild.members.fetch()).values()];
    const eligible = members
      .filter(
        (member) =>
          !member.user.bot &&
          member.id !== this.client.user.id &&
          (verifiedRoleId === null || !member.roles.cache.has(verifiedRoleId)) &&
          member.roles.highest.position < botMember.roles.highest.position,
      )
      .sort(
        (left, right) =>
          (left.joinedTimestamp ?? Number.MAX_SAFE_INTEGER) -
            (right.joinedTimestamp ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id),
      );
    if (migration.mode === 'ALL_ELIGIBLE') return eligible.slice(0, migration.maxCount);
    if (migration.mode === 'MANUAL') return eligible;
    return eligible.slice(0, migration.maxCount);
  }

  async #sendTestWelcome(
    payload: Extract<
      OnboardingJob,
      { job: 'onboarding.test-welcome-channel' | 'onboarding.test-welcome-dm' }
    >,
    directMessage: boolean,
  ): Promise<void> {
    const resolved = await this.#resolveMember(payload.guildId, payload.userId);
    if (resolved === null) return this.#skip(payload, 'TEST_MEMBER_UNAVAILABLE');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    const locale = await this.services.localeForGuild(guild.id);
    const message = directMessage ? config.welcome.dmMessage : config.welcome.message;
    const rendered = renderOnboardingMessage(
      message,
      memberVariables(guild, member, locale, new Date()),
      member.id,
    );
    this.#logTemplateWarnings(rendered, payload);
    if (directMessage) {
      const sent = await member.send(asDiscordTestMessage(rendered));
      await this.#completeDelivery(payload, config, 'onboarding.welcome-dm.test-sent', {
        messageId: sent.id,
        delivery: 'dm-test',
      });
      return;
    }
    if (config.welcome.channelId === null)
      return this.#skip(payload, 'WELCOME_CHANNEL_NOT_CONFIGURED');
    const channel = await guild.channels.fetch(config.welcome.channelId);
    if (channel === null || !channel.isSendable())
      throw new TypeError('WELCOME_CHANNEL_UNAVAILABLE');
    this.#assertChannelPermissions(guild, channel.id, config.welcome.attachWelcomeCard);
    const sent = await channel.send(asDiscordTestMessage(rendered));
    await this.#completeDelivery(payload, config, 'onboarding.welcome.test-sent', {
      channelId: channel.id,
      messageId: sent.id,
      delivery: 'channel-test',
    });
  }

  async #sendTestGoodbye(
    payload: Extract<OnboardingJob, { job: 'onboarding.test-goodbye-channel' }>,
  ): Promise<void> {
    const resolved = await this.#resolveMember(payload.guildId, payload.userId);
    if (resolved === null) return this.#skip(payload, 'TEST_MEMBER_UNAVAILABLE');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    if (config.goodbye.channelId === null)
      return this.#skip(payload, 'GOODBYE_CHANNEL_NOT_CONFIGURED');
    const channel = await guild.channels.fetch(config.goodbye.channelId);
    if (channel === null || !channel.isSendable())
      throw new TypeError('GOODBYE_CHANNEL_UNAVAILABLE');
    this.#assertChannelPermissions(guild, channel.id, false);
    const locale = await this.services.localeForGuild(guild.id);
    const testPayload = {
      job: 'onboarding.send-goodbye-channel' as const,
      idempotencyKey: payload.idempotencyKey,
      correlationId: payload.correlationId,
      guildId: payload.guildId,
      userId: payload.userId,
      deliverAt: payload.deliverAt,
      leftAt: new Date().toISOString(),
      snapshot: {
        username: member.user.username,
        displayName: member.displayName,
        globalName: member.user.globalName,
        avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
        accountCreatedAt: member.user.createdAt.toISOString(),
        joinedAt: member.joinedAt?.toISOString() ?? null,
        roleNames: member.roles.cache
          .filter((role) => role.id !== guild.id)
          .sort((left, right) => right.position - left.position)
          .first(100)
          .map((role) => role.name),
        bot: member.user.bot,
      },
    };
    const rendered = renderOnboardingMessage(
      config.goodbye.message,
      goodbyeVariables(guild, testPayload, locale, new Date()),
      member.id,
    );
    this.#logTemplateWarnings(rendered, payload);
    const sent = await channel.send(asDiscordTestMessage(rendered));
    await this.#completeDelivery(payload, config, 'onboarding.goodbye.test-sent', {
      channelId: channel.id,
      messageId: sent.id,
      delivery: 'channel-test',
    });
  }

  async #deleteMessage(
    payload: Extract<OnboardingJob, { job: 'onboarding.delete-message' }>,
  ): Promise<void> {
    const guild = this.client.guilds.cache.get(payload.guildId);
    if (guild === undefined) return this.#skip(payload, 'GUILD_UNAVAILABLE');
    const channel = await guild.channels.fetch(payload.channelId);
    if (channel === null || !channel.isTextBased())
      return this.#skip(payload, 'CHANNEL_UNAVAILABLE');
    try {
      const message = await channel.messages.fetch(payload.messageId);
      await message.delete();
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === 10_008) {
        return this.#skip(payload, 'MESSAGE_ALREADY_GONE');
      }
      throw error;
    }
    await this.#journal.complete({
      idempotencyKey: payload.idempotencyKey,
      details: { channelId: payload.channelId, messageId: payload.messageId },
    });
  }

  async #resolveCurrentMember(
    guildId: string,
    userId: string,
    joinedAt: string,
  ): Promise<{ guild: Guild; member: GuildMember } | null> {
    const resolved = await this.#resolveMember(guildId, userId);
    if (resolved === null) return null;
    const { guild, member } = resolved;
    if (member === null || member.joinedAt?.toISOString() !== joinedAt) return null;
    return { guild, member };
  }

  async #resolveMember(
    guildId: string,
    userId: string,
  ): Promise<{ guild: Guild; member: GuildMember } | null> {
    const guild = this.client.guilds.cache.get(guildId);
    if (guild === undefined) return null;
    const member = await guild.members.fetch(userId).catch(() => null);
    return member === null ? null : { guild, member };
  }

  #accountAgeEligible(member: GuildMember, config: OnboardingConfigResponse): boolean {
    const ageHours = (Date.now() - member.user.createdTimestamp) / 3_600_000;
    return ageHours >= config.welcome.minimumAccountAgeHours;
  }

  #assertChannelPermissions(guild: Guild, channelId: string, attachFiles: boolean): void {
    const channel = guild.channels.cache.get(channelId);
    const botMember = guild.members.me;
    if (channel === undefined || botMember === null) throw new TypeError('BOT_MEMBER_UNAVAILABLE');
    const permissions = channel.permissionsFor(botMember);
    const required = attachFiles
      ? [...requiredChannelPermissions, PermissionFlagsBits.AttachFiles]
      : requiredChannelPermissions;
    if (!permissions.has(required)) throw new TypeError('ONBOARDING_CHANNEL_PERMISSIONS_MISSING');
  }

  #logTemplateWarnings(rendered: RenderedOnboardingMessage, payload: OnboardingJob): void {
    if (rendered.warnings.length === 0) return;
    this.services.logger.warn(
      {
        guildId: payload.guildId,
        userId: payload.userId,
        correlationId: payload.correlationId,
        unknownVariables: rendered.warnings.map((warning) => warning.variable),
      },
      'onboarding template contains unknown variables',
    );
  }

  async #completeDelivery(
    payload: OnboardingJob,
    config: OnboardingConfigResponse,
    action: string,
    details: Record<string, string>,
  ): Promise<void> {
    await this.services.prisma.$transaction(async (transaction) => {
      await transaction.onboardingEvent.update({
        where: { idempotencyKey: payload.idempotencyKey },
        data: {
          status: 'SUCCEEDED',
          processedAt: new Date(),
          details,
          errorCode: null,
          failureReason: null,
        },
      });
      await appendAuditLog(transaction, {
        guildId: payload.guildId,
        actorDiscordId: this.client.user.id,
        action,
        resourceType: 'OnboardingEvent',
        resourceId: payload.idempotencyKey,
        requestId: payload.correlationId,
        outcome: 'SUCCESS',
        newValue: {
          ...details,
          configurationVersion: config.version,
        },
      });
    });
  }

  async #skip(payload: OnboardingJob, reason: string): Promise<void> {
    await this.#journal.complete({
      idempotencyKey: payload.idempotencyKey,
      status: 'SKIPPED',
      details: { reason },
    });
  }

  async #enqueueDelete(
    source: OnboardingJob,
    channelId: string,
    messageId: string,
    delaySeconds: number,
  ): Promise<void> {
    await this.#enqueue({
      job: 'onboarding.delete-message',
      idempotencyKey: `delete:${source.guildId}:${channelId}:${messageId}`,
      correlationId: source.correlationId,
      guildId: source.guildId,
      userId: source.userId,
      channelId,
      messageId,
      deliverAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    });
  }

  async #handleFailure(job: Job | undefined, error: Error): Promise<void> {
    this.services.logger.error(
      {
        err: error,
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
      },
      'onboarding job failed',
    );
    if (job === undefined) return;
    const configuredAttempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : this.services.config.queue.defaultAttempts;
    if (job.attemptsMade < configuredAttempts) return;
    const deadLetter = DeadLetterJobSchema.parse({
      sourceQueue: QueueName.DiscordNotifications,
      sourceJobId: job.id,
      jobName: job.name,
      payload: { payloadHash: sha256(JSON.stringify(job.data)) },
      error: 'Onboarding delivery exhausted its retry policy.',
      failedAt: new Date().toISOString(),
    });
    await this.#deadLetterQueue.add('dead-letter.capture', deadLetter, {
      jobId: sha256(`${QueueName.DiscordNotifications}:${job.id ?? 'unknown'}`),
    });
  }
}
