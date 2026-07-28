import { Queue, Worker, type Job } from 'bullmq';
import {
  DiscordAPIError,
  PermissionFlagsBits,
  type APIEmbed,
  type Client,
  type Guild,
  type GuildMember,
  type MessageCreateOptions,
} from 'discord.js';
import { appendAuditLog } from '@sufbot/database';
import {
  OnboardingEventJournal,
  OnboardingRepository,
  renderOnboardingMessage,
  safeTemplateText,
  type OnboardingConfigResponse,
  type OnboardingTemplateVariables,
  type RenderedOnboardingMessage,
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

const eventNameForJob = (job: OnboardingJob['job']): string => {
  switch (job) {
    case 'onboarding.send-welcome-channel':
      return 'welcome.channel.send';
    case 'onboarding.send-welcome-dm':
      return 'welcome.dm.send';
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

const deliveryIncludesJoin = (delivery: 'ON_JOIN' | 'AFTER_VERIFICATION' | 'BOTH'): boolean =>
  delivery === 'ON_JOIN' || delivery === 'BOTH';

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
  'user.accountAge': Math.max(0, Math.floor((now.getTime() - member.user.createdTimestamp) / 86_400_000)),
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
    joinedAt === null ? '' : Math.max(0, Math.floor((now.getTime() - joinedAt.getTime()) / 86_400_000));
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
          ...(embed.thumbnailUrl === undefined
            ? {}
            : { thumbnail: { url: embed.thumbnailUrl } }),
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
    this.#identity = createQueueIdentity(services.config.queue.prefix, QueueName.DiscordNotifications);
    const deadLetterIdentity = createQueueIdentity(services.config.queue.prefix, QueueName.DeadLetter);
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
      if (config.welcome.channelId !== null && deliveryIncludesJoin(config.welcome.delivery)) {
        await this.#enqueue({
          job: 'onboarding.send-welcome-channel',
          idempotencyKey: `welcome:channel:${member.guild.id}:${member.id}:${joinedAt}`,
          correlationId: `join:${member.guild.id}:${member.id}:${joinedAt}`,
          guildId: member.guild.id,
          userId: member.id,
          joinedAt,
          deliverAt: new Date(Date.now() + config.welcome.delaySeconds * 1000).toISOString(),
        });
      }
      if (config.welcome.dmEnabled && deliveryIncludesJoin(config.welcome.dmDelivery)) {
        await this.#enqueue({
          job: 'onboarding.send-welcome-dm',
          idempotencyKey: `welcome:dm:${member.guild.id}:${member.id}:${joinedAt}`,
          correlationId: `join:${member.guild.id}:${member.id}:${joinedAt}`,
          guildId: member.guild.id,
          userId: member.id,
          joinedAt,
          deliverAt: new Date(Date.now() + config.welcome.dmDelaySeconds * 1000).toISOString(),
        });
      }
    }
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
    const resolved = await this.#resolveCurrentMember(payload.guildId, payload.userId, payload.joinedAt);
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    if (
      !config.welcomeEnabled ||
      config.welcome.channelId === null ||
      !deliveryIncludesJoin(config.welcome.delivery) ||
      (config.welcome.ignoreBots && member.user.bot) ||
      !this.#accountAgeEligible(member, config)
    ) {
      return this.#skip(payload, 'CONFIGURATION_NOT_ELIGIBLE');
    }
    const channel = await guild.channels.fetch(config.welcome.channelId);
    if (channel === null || !channel.isSendable()) throw new TypeError('WELCOME_CHANNEL_UNAVAILABLE');
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
    const resolved = await this.#resolveCurrentMember(payload.guildId, payload.userId, payload.joinedAt);
    if (resolved === null) return this.#skip(payload, 'MEMBER_NOT_CURRENT');
    const { guild, member } = resolved;
    const config = await this.#repository.get(guild.id);
    if (
      !config.welcomeEnabled ||
      !config.welcome.dmEnabled ||
      !deliveryIncludesJoin(config.welcome.dmDelivery) ||
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
    if (channel === null || !channel.isSendable()) throw new TypeError('GOODBYE_CHANNEL_UNAVAILABLE');
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
    if (config.welcome.channelId === null) return this.#skip(payload, 'WELCOME_CHANNEL_NOT_CONFIGURED');
    const channel = await guild.channels.fetch(config.welcome.channelId);
    if (channel === null || !channel.isSendable()) throw new TypeError('WELCOME_CHANNEL_UNAVAILABLE');
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
    if (config.goodbye.channelId === null) return this.#skip(payload, 'GOODBYE_CHANNEL_NOT_CONFIGURED');
    const channel = await guild.channels.fetch(config.goodbye.channelId);
    if (channel === null || !channel.isSendable()) throw new TypeError('GOODBYE_CHANNEL_UNAVAILABLE');
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
    if (channel === null || !channel.isTextBased()) return this.#skip(payload, 'CHANNEL_UNAVAILABLE');
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
