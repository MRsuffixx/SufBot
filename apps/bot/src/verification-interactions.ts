import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import sharp from 'sharp';
import { appendAuditLog } from '@sufbot/database';
import {
  CaptchaStore,
  OnboardingRepository,
  isPostVerificationConditionSatisfied,
  type CaptchaVerifyResult,
  type OnboardingConfigResponse,
} from '@sufbot/onboarding';
import { sha256 } from '@sufbot/shared';
import type { QueueRegistry } from '@sufbot/queue';
import type { BotServices } from './services.js';

type VerificationContext = {
  config: OnboardingConfigResponse;
  member: GuildMember;
};

const secureEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const setupPanelNonceHash = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const nonceHash = (value as Record<string, unknown>)['panelNonceHash'];
  return typeof nonceHash === 'string' && /^[a-f0-9]{64}$/u.test(nonceHash) ? nonceHash : null;
};

const localized = (
  locale: 'en' | 'tr',
  key:
    | 'unavailable'
    | 'alreadyVerified'
    | 'rateLimited'
    | 'sequenceProgress'
    | 'sequenceRetry'
    | 'processing',
  value = 0,
): string => {
  const messages = {
    en: {
      unavailable: 'Verification is unavailable. Ask an administrator to repair the setup.',
      alreadyVerified: 'You are already verified.',
      rateLimited: `Please wait ${value} seconds before trying again.`,
      sequenceProgress: `Sequence progress: ${value}`,
      sequenceRetry: `That sequence was not correct. Attempts remaining: ${value}.`,
      processing: 'Verification accepted. Your server access is being applied.',
    },
    tr: {
      unavailable: 'Doğrulama kullanılamıyor. Bir yöneticiden kurulumu onarmasını iste.',
      alreadyVerified: 'Zaten doğrulandın.',
      rateLimited: `Tekrar denemeden önce ${value} saniye bekle.`,
      sequenceProgress: `Dizi ilerlemesi: ${value}`,
      sequenceRetry: `Bu dizi doğru değildi. Kalan deneme: ${value}.`,
      processing: 'Doğrulama kabul edildi. Sunucu erişimin uygulanıyor.',
    },
  } as const;
  return messages[locale][key];
};

const captchaSvg = (code: string): Buffer => {
  const lines = Array.from({ length: 12 }, () => {
    const x1 = randomInt(0, 560);
    const y1 = randomInt(0, 180);
    const x2 = randomInt(0, 560);
    const y2 = randomInt(0, 180);
    const opacity = 0.12 + randomInt(20) / 100;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7c3aed" stroke-width="2" opacity="${opacity}"/>`;
  }).join('');
  const dots = Array.from({ length: 80 }, () => {
    const cx = randomInt(0, 560);
    const cy = randomInt(0, 180);
    const radius = randomInt(1, 4);
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#94a3b8" opacity="0.35"/>`;
  }).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="180" viewBox="0 0 560 180">
      <rect width="560" height="180" rx="18" fill="#f8fafc"/>
      ${dots}${lines}
      <text x="280" y="112" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="72" font-weight="700" letter-spacing="14" fill="#111827">${code}</text>
    </svg>`,
  );
};

const renderCaptchaPng = async (code: string): Promise<Buffer> =>
  sharp(captchaSvg(code), { density: 144, limitInputPixels: 2_000_000 })
    .resize(560, 180, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true })
    .timeout({ seconds: 3 })
    .toBuffer();

export class VerificationInteractionService {
  readonly #repository: OnboardingRepository;
  readonly #captcha: CaptchaStore;

  public constructor(
    private readonly client: Client<true>,
    private readonly services: BotServices,
    private readonly queues: QueueRegistry,
  ) {
    this.#repository = new OnboardingRepository(services.prisma, services.cache);
    this.#captcha = new CaptchaStore(services.env.REDIS_URL, {
      namespace: `${services.config.cache.namespace}:${services.env.NODE_ENV}`,
      signingSecret: services.env.DISCORD_BOT_TOKEN,
      onError: (error) =>
        services.logger.error({ err: error }, 'verification captcha Redis operation failed'),
    });
  }

  public async close(): Promise<void> {
    await this.#captcha.close();
  }

  public async invalidateMember(guildId: string, userId: string): Promise<void> {
    await this.#captcha.invalidateUser(guildId, userId);
  }

  public async handleStart(
    interaction: ButtonInteraction,
    nonce: string,
    signature: string,
  ): Promise<unknown> {
    const context = await this.#context(interaction, true);
    if (context === null) return this.#unavailable(interaction);
    const { config, member } = context;
    if (
      config.verificationMessageId !== interaction.message.id ||
      config.verificationChannelId !== interaction.channelId ||
      !this.#validPanelSignature(member.guild.id, nonce, signature) ||
      setupPanelNonceHash(
        (
          await this.services.prisma.guildOnboardingConfig.findUnique({
            where: { guildId: member.guild.id },
            select: { setupSnapshot: true },
          })
        )?.setupSnapshot,
      ) !== sha256(nonce)
    ) {
      return this.#unavailable(interaction);
    }
    const existing = await this.services.prisma.memberVerification.findUnique({
      where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
      select: { captchaVerified: true },
    });
    const locale = await this.services.localeForGuild(member.guild.id);
    if (existing?.captchaVerified === true) {
      return interaction.reply({
        content: localized(locale, 'alreadyVerified'),
        flags: MessageFlags.Ephemeral,
      });
    }

    const created = await this.#captcha.create(
      member.guild.id,
      member.id,
      config.captchaType,
      config.verification,
    );
    if (created.status !== 'CREATED') {
      const message =
        created.status === 'LOCKED'
          ? config.verification.lockedMessage
          : localized(locale, 'rateLimited', created.retryAfterSeconds);
      return interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
    await this.#recordChallengeCreated(interaction, context, created.challenge.challengeId);
    const challenge = created.challenge;
    if (challenge.mode === 'ARITHMETIC' || challenge.mode === 'MODAL_TEXT') {
      return interaction.showModal(
        this.#answerModal(
          member.guild.id,
          member.id,
          challenge.challengeId,
          challenge.publicPrompt,
        ),
      );
    }
    if (
      challenge.mode === 'IMAGE_TEXT' &&
      challenge.imageText !== null &&
      challenge.sequenceChoices === null
    ) {
      const image = await renderCaptchaPng(challenge.imageText);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(this.#answerButtonId(member.guild.id, member.id, challenge.challengeId))
          .setLabel(locale === 'tr' ? 'Yanıtı gir' : 'Enter answer')
          .setStyle(ButtonStyle.Primary),
      );
      return interaction.reply({
        content: `${challenge.publicPrompt}\nExpires <t:${Math.floor(
          new Date(challenge.expiresAt).getTime() / 1000,
        )}:R>.`,
        files: [new AttachmentBuilder(image, { name: 'sufbot-captcha.png' })],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }
    if (
      challenge.mode === 'BUTTON_SEQUENCE' &&
      challenge.sequenceChoices !== null &&
      challenge.sequenceTarget !== null
    ) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const [choice, symbol] of challenge.sequenceChoices.entries()) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(
              this.#sequenceButtonId(member.guild.id, member.id, challenge.challengeId, choice),
            )
            .setLabel(symbol)
            .setStyle(ButtonStyle.Secondary),
        );
      }
      return interaction.reply({
        content: `${challenge.publicPrompt}\n\n**${challenge.sequenceTarget.join('  →  ')}**`,
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }
    return this.#unavailable(interaction);
  }

  public async handleAnswerButton(
    interaction: ButtonInteraction,
    challengeId: string,
    signature: string,
  ): Promise<unknown> {
    const context = await this.#context(interaction, false);
    if (
      context === null ||
      !this.#validChallengeSignature(
        'answer',
        context.member.guild.id,
        context.member.id,
        challengeId,
        signature,
      )
    ) {
      return this.#unavailable(interaction);
    }
    return interaction.showModal(
      this.#answerModal(
        context.member.guild.id,
        context.member.id,
        challengeId,
        'Enter the characters from the captcha image.',
      ),
    );
  }

  public async handleModal(
    interaction: ModalSubmitInteraction,
    challengeId: string,
    signature: string,
  ): Promise<unknown> {
    const context = await this.#context(interaction, false);
    if (
      context === null ||
      !this.#validChallengeSignature(
        'modal',
        context.member.guild.id,
        context.member.id,
        challengeId,
        signature,
      )
    ) {
      return this.#unavailable(interaction);
    }
    const answer = interaction.fields.getTextInputValue('captcha-answer');
    const result = await this.#captcha.verify(
      context.member.guild.id,
      context.member.id,
      challengeId,
      answer,
      context.config.verification.lockoutSeconds,
    );
    return this.#finish(interaction, context, challengeId, result);
  }

  public async handleSequence(
    interaction: ButtonInteraction,
    challengeId: string,
    choice: number,
    signature: string,
  ): Promise<unknown> {
    const context = await this.#context(interaction, false);
    if (
      context === null ||
      !this.#validChallengeSignature(
        `sequence:${choice}`,
        context.member.guild.id,
        context.member.id,
        challengeId,
        signature,
      )
    ) {
      return this.#unavailable(interaction);
    }
    const result = await this.#captcha.appendSequenceChoice(
      context.member.guild.id,
      context.member.id,
      challengeId,
      choice,
      context.config.verification.lockoutSeconds,
    );
    const locale = await this.services.localeForGuild(context.member.guild.id);
    if (result.status === 'CONTINUE') {
      await interaction.deferUpdate();
      return interaction.followUp({
        content: localized(locale, 'sequenceProgress', result.entered),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (result.status === 'INVALID') {
      await this.#recordResult(interaction, context, challengeId, result);
      await interaction.deferUpdate();
      return interaction.followUp({
        content: localized(locale, 'sequenceRetry', result.attemptsRemaining),
        flags: MessageFlags.Ephemeral,
      });
    }
    return this.#finish(interaction, context, challengeId, result);
  }

  async #finish(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    context: VerificationContext,
    challengeId: string,
    result: CaptchaVerifyResult,
  ): Promise<unknown> {
    const locale = await this.services.localeForGuild(context.member.guild.id);
    const recorded = await this.#recordResult(interaction, context, challengeId, result);
    let content: string;
    switch (result.status) {
      case 'SUCCESS':
        content = localized(locale, 'processing');
        break;
      case 'INVALID':
        content = `${context.config.verification.failureMessage} (${result.attemptsRemaining})`;
        break;
      case 'LOCKED':
        content = context.config.verification.lockedMessage;
        break;
      case 'EXPIRED':
      case 'REPLAY':
        content = context.config.verification.expiredMessage;
        break;
    }
    if (result.status === 'SUCCESS' && recorded) {
      const joinedAt = (context.member.joinedAt ?? new Date()).toISOString();
      await this.queues.enqueueOnboarding({
        job: 'onboarding.evaluate-member-conditions',
        idempotencyKey: `roles:captcha:${context.member.guild.id}:${context.member.id}:${interaction.id}`,
        correlationId: interaction.id,
        guildId: context.member.guild.id,
        userId: context.member.id,
        joinedAt,
        reason: 'CAPTCHA',
        deliverAt: new Date(
          Date.now() + context.config.autoRole.verifiedDelaySeconds * 1000,
        ).toISOString(),
      });
    }
    if (interaction.isButton()) {
      return interaction.update({ content, components: [], files: [] });
    }
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }

  async #recordChallengeCreated(
    interaction: ButtonInteraction,
    context: VerificationContext,
    challengeId: string,
  ): Promise<void> {
    await this.services.prisma.$transaction(async (transaction) => {
      const created = await transaction.onboardingEvent.createMany({
        data: {
          guildId: context.member.guild.id,
          userId: context.member.id,
          eventType: 'verification.challenge.created',
          status: 'SUCCEEDED',
          idempotencyKey: `captcha-created:${challengeId}`,
          correlationId: interaction.id,
          processedAt: new Date(),
          details: { method: context.config.captchaType },
        },
        skipDuplicates: true,
      });
      if (created.count === 0) return;
      await transaction.memberVerification.upsert({
        where: {
          guildId_userId: { guildId: context.member.guild.id, userId: context.member.id },
        },
        create: {
          guildId: context.member.guild.id,
          userId: context.member.id,
          status: 'CHALLENGE_CREATED',
          method: context.config.captchaType,
          membershipScreeningCompleted: context.member.pending === false,
          lastAttemptAt: new Date(),
        },
        update: {
          status: 'CHALLENGE_CREATED',
          method: context.config.captchaType,
          membershipScreeningCompleted: context.member.pending === false,
          lastAttemptAt: new Date(),
          failureReason: null,
        },
      });
      await appendAuditLog(transaction, {
        guildId: context.member.guild.id,
        actorDiscordId: context.member.id,
        action: 'onboarding.verification.challenge-created',
        resourceType: 'MemberVerification',
        resourceId: context.member.id,
        requestId: interaction.id,
        outcome: 'SUCCESS',
        newValue: { method: context.config.captchaType },
        metadata: { source: 'bot' },
      });
    });
  }

  async #recordResult(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    context: VerificationContext,
    challengeId: string,
    result: CaptchaVerifyResult,
  ): Promise<boolean> {
    return this.services.prisma.$transaction(async (transaction) => {
      const created = await transaction.onboardingEvent.createMany({
        data: {
          guildId: context.member.guild.id,
          userId: context.member.id,
          eventType: 'verification.challenge.result',
          status: 'SUCCEEDED',
          idempotencyKey: `captcha-result:${interaction.id}`,
          correlationId: interaction.id,
          processedAt: new Date(),
          details: { method: context.config.captchaType, result: result.status },
        },
        skipDuplicates: true,
      });
      if (created.count === 0) return false;
      const current = await transaction.memberVerification.findUnique({
        where: {
          guildId_userId: { guildId: context.member.guild.id, userId: context.member.id },
        },
      });
      const screeningCompleted =
        current?.membershipScreeningCompleted === true || context.member.pending === false;
      const conditionSatisfied = isPostVerificationConditionSatisfied(
        context.config.roleGrantCondition,
        {
          captchaVerified: result.status === 'SUCCESS' || current?.captchaVerified === true,
          membershipScreeningCompleted: screeningCompleted,
        },
      );
      const status =
        result.status === 'SUCCESS'
          ? conditionSatisfied
            ? 'VERIFIED'
            : 'PENDING'
          : result.status === 'LOCKED'
            ? 'LOCKED'
            : result.status === 'EXPIRED' || result.status === 'REPLAY'
              ? 'EXPIRED'
              : 'FAILED';
      await transaction.memberVerification.upsert({
        where: {
          guildId_userId: { guildId: context.member.guild.id, userId: context.member.id },
        },
        create: {
          guildId: context.member.guild.id,
          userId: context.member.id,
          status,
          method: context.config.captchaType,
          attemptCount: result.status === 'SUCCESS' ? 0 : 1,
          captchaVerified: result.status === 'SUCCESS',
          membershipScreeningCompleted: screeningCompleted,
          lastAttemptAt: new Date(),
          ...(result.status === 'SUCCESS'
            ? { verifiedAt: new Date(), verifiedBy: context.member.id }
            : { failureReason: `CAPTCHA_${result.status}` }),
        },
        update: {
          status,
          method: context.config.captchaType,
          ...(result.status === 'SUCCESS'
            ? {
                captchaVerified: true,
                verifiedAt: new Date(),
                verifiedBy: context.member.id,
                failureReason: null,
              }
            : {
                attemptCount: { increment: 1 },
                failureReason: `CAPTCHA_${result.status}`,
              }),
          membershipScreeningCompleted: screeningCompleted,
          lastAttemptAt: new Date(),
        },
      });
      if (result.status === 'SUCCESS') {
        await transaction.guildOnboardingConfig.updateMany({
          where: { guildId: context.member.guild.id },
          data: { lastVerificationAt: new Date() },
        });
      }
      await appendAuditLog(transaction, {
        guildId: context.member.guild.id,
        actorDiscordId: context.member.id,
        action: `onboarding.verification.captcha-${result.status.toLowerCase()}`,
        resourceType: 'MemberVerification',
        resourceId: context.member.id,
        requestId: interaction.id,
        outcome: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
        newValue: {
          method: context.config.captchaType,
          result: result.status,
          challengeReference: sha256(challengeId).slice(0, 16),
        },
        ...(result.status === 'SUCCESS'
          ? {}
          : { failureReason: 'The captcha challenge was not completed successfully.' }),
        metadata: { source: 'bot' },
      });
      return true;
    });
  }

  async #context(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    requireHealthyPanel: boolean,
  ): Promise<VerificationContext | null> {
    if (interaction.guildId === null || interaction.guild === null) return null;
    const config = await this.#repository.get(interaction.guildId).catch(() => null);
    if (
      config === null ||
      !config.verificationEnabled ||
      config.resourceHealth !== 'HEALTHY' ||
      config.verifiedRoleId === null ||
      (requireHealthyPanel &&
        (config.verificationChannelId === null || config.verificationMessageId === null))
    ) {
      return null;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (member === null || member.user.bot) return null;
    return { config, member };
  }

  #answerModal(
    guildId: string,
    userId: string,
    challengeId: string,
    prompt: string,
  ): ModalBuilder {
    const signature = this.#challengeSignature('modal', guildId, userId, challengeId);
    return new ModalBuilder()
      .setCustomId(`captcha:v1:modal:${challengeId}:${signature}`)
      .setTitle('SufBot verification')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('captcha-answer')
            .setLabel(prompt.slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(64)
            .setRequired(true),
        ),
      );
  }

  #answerButtonId(guildId: string, userId: string, challengeId: string): string {
    const signature = this.#challengeSignature('answer', guildId, userId, challengeId);
    return `captcha:v1:answer:${challengeId}:${signature}`;
  }

  #sequenceButtonId(
    guildId: string,
    userId: string,
    challengeId: string,
    choice: number,
  ): string {
    const signature = this.#challengeSignature(
      `sequence:${choice}`,
      guildId,
      userId,
      challengeId,
    );
    return `captcha:v1:sequence:${challengeId}:${choice}:${signature}`;
  }

  #validPanelSignature(guildId: string, nonce: string, signature: string): boolean {
    if (!/^[A-Za-z0-9_-]{22}$/u.test(nonce) || !/^[A-Za-z0-9_-]{22}$/u.test(signature)) {
      return false;
    }
    const expected = createHmac('sha256', this.services.env.DISCORD_BOT_TOKEN)
      .update(`verify:v1:${guildId}:${nonce}`)
      .digest('base64url')
      .slice(0, 22);
    return secureEqual(expected, signature);
  }

  #challengeSignature(kind: string, guildId: string, userId: string, challengeId: string): string {
    return createHmac('sha256', this.services.env.DISCORD_BOT_TOKEN)
      .update(`captcha:v1:${kind}:${guildId}:${userId}:${challengeId}`)
      .digest('base64url')
      .slice(0, 22);
  }

  #validChallengeSignature(
    kind: string,
    guildId: string,
    userId: string,
    challengeId: string,
    signature: string,
  ): boolean {
    if (
      !/^[A-Za-z0-9_-]{24}$/u.test(challengeId) ||
      !/^[A-Za-z0-9_-]{22}$/u.test(signature)
    ) {
      return false;
    }
    return secureEqual(
      this.#challengeSignature(kind, guildId, userId, challengeId),
      signature,
    );
  }

  async #unavailable(
    interaction: ButtonInteraction | ModalSubmitInteraction,
  ): Promise<unknown> {
    const locale = await this.services.localeForGuild(interaction.guildId);
    const response = {
      content: localized(locale, 'unavailable'),
      flags: MessageFlags.Ephemeral as const,
    };
    return interaction.replied || interaction.deferred
      ? interaction.followUp(response)
      : interaction.reply(response);
  }
}
