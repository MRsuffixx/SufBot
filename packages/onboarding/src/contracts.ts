import { z } from 'zod';
import { DiscordSnowflakeSchema } from '@sufbot/shared';

const HttpsUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', 'Only HTTPS URLs are allowed.');
const OptionalHttpsUrlSchema = z
  .union([HttpsUrlSchema, z.literal('')])
  .transform((value) => (value === '' ? null : value));
const ColorSchema = z.number().int().min(0).max(0xffffff);

export const OnboardingMessageModeSchema = z.enum(['TEXT', 'EMBED', 'TEXT_AND_EMBED']);
export const OnboardingDeliverySchema = z.enum(['ON_JOIN', 'AFTER_VERIFICATION', 'BOTH']);
export const UnknownVariablePolicySchema = z.enum(['PRESERVE', 'EMPTY']);
export const VerificationSetupModeSchema = z.enum([
  'EVERYONE_VISIBLE',
  'DEDICATED_UNVERIFIED_ROLE',
]);
export const OnboardingCaptchaTypeSchema = z.enum([
  'IMAGE_TEXT',
  'ARITHMETIC',
  'BUTTON_SEQUENCE',
  'MODAL_TEXT',
]);
export const OnboardingRoleGrantConditionSchema = z.enum([
  'CAPTCHA_ONLY',
  'SCREENING_ONLY',
  'EITHER',
  'BOTH',
]);

export const OnboardingEmbedFieldSchema = z
  .object({
    name: z.string().max(256),
    value: z.string().max(1024),
    inline: z.boolean().default(false),
  })
  .strict();

export const OnboardingEmbedSchema = z
  .object({
    color: ColorSchema.default(0x7c3aed),
    authorName: z.string().max(256).default(''),
    authorIconUrl: OptionalHttpsUrlSchema.default(''),
    authorUrl: OptionalHttpsUrlSchema.default(''),
    title: z.string().max(256).default(''),
    description: z.string().max(4096).default(''),
    thumbnailUrl: OptionalHttpsUrlSchema.default(''),
    imageUrl: OptionalHttpsUrlSchema.default(''),
    footerText: z.string().max(2048).default(''),
    footerIconUrl: OptionalHttpsUrlSchema.default(''),
    timestamp: z.boolean().default(false),
    fields: z.array(OnboardingEmbedFieldSchema).max(25).default([]),
  })
  .strict()
  .superRefine((embed, context) => {
    const total =
      embed.authorName.length +
      embed.title.length +
      embed.description.length +
      embed.footerText.length +
      embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    if (total > 6000) {
      context.addIssue({
        code: 'custom',
        message: 'Discord embeds may contain at most 6000 text characters.',
      });
    }
  });

export const AllowedMentionsSchema = z
  .object({
    mentionUser: z.boolean().default(true),
    allowRoleMentions: z.literal(false).default(false),
    allowEveryoneMention: z.literal(false).default(false),
    repliedUser: z.literal(false).default(false),
  })
  .strict();

export const OnboardingMessageSchema = z
  .object({
    mode: OnboardingMessageModeSchema.default('TEXT'),
    content: z.string().max(2000).default(''),
    embed: OnboardingEmbedSchema.default({}),
    allowedMentions: AllowedMentionsSchema.default({}),
    unknownVariablePolicy: UnknownVariablePolicySchema.default('PRESERVE'),
    deleteAfterSeconds: z.number().int().min(0).max(604800).default(0),
  })
  .strict()
  .superRefine((message, context) => {
    if (
      (message.mode === 'TEXT' || message.mode === 'TEXT_AND_EMBED') &&
      message.content.trim().length === 0
    ) {
      context.addIssue({ code: 'custom', path: ['content'], message: 'Text content is required.' });
    }
    if (
      (message.mode === 'EMBED' || message.mode === 'TEXT_AND_EMBED') &&
      message.embed.title.trim().length === 0 &&
      message.embed.description.trim().length === 0 &&
      message.embed.fields.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['embed'],
        message: 'The embed must contain a title, description, or field.',
      });
    }
  });

export const WelcomeConfigSchema = z
  .object({
    channelId: z.union([DiscordSnowflakeSchema, z.null()]).default(null),
    delivery: OnboardingDeliverySchema.default('ON_JOIN'),
    delaySeconds: z.number().int().min(0).max(86400).default(0),
    ignoreBots: z.boolean().default(true),
    minimumAccountAgeHours: z.number().int().min(0).max(87600).default(0),
    attachWelcomeCard: z.boolean().default(false),
    message: OnboardingMessageSchema.default({
      mode: 'TEXT',
      content: 'Hey {user.mention}, welcome to **{server.name}**!',
    }),
    dmEnabled: z.boolean().default(false),
    dmDelivery: OnboardingDeliverySchema.default('ON_JOIN'),
    dmDelaySeconds: z.number().int().min(0).max(86400).default(0),
    dmMessage: OnboardingMessageSchema.default({
      mode: 'TEXT',
      content: 'Welcome to {server.name}, {user.displayName}!',
    }),
  })
  .strict();

export const GoodbyeConfigSchema = z
  .object({
    channelId: z.union([DiscordSnowflakeSchema, z.null()]).default(null),
    delaySeconds: z.number().int().min(0).max(86400).default(0),
    ignoreBots: z.boolean().default(true),
    includeJoinDuration: z.boolean().default(true),
    includeLastKnownRoles: z.boolean().default(false),
    message: OnboardingMessageSchema.default({
      mode: 'TEXT',
      content: '**{user.displayName}** just left the server.',
      allowedMentions: {
        mentionUser: false,
        allowRoleMentions: false,
        allowEveryoneMention: false,
        repliedUser: false,
      },
    }),
  })
  .strict();

export const VerificationConfigSchema = z
  .object({
    channelName: z.string().trim().min(1).max(100).default('doğrulama'),
    verifiedRoleName: z.string().trim().min(1).max(100).default('doğrulandı'),
    unverifiedRoleName: z.string().trim().min(1).max(100).default('doğrulanmadı'),
    categoryId: z.union([DiscordSnowflakeSchema, z.null()]).default(null),
    buttonLabel: z.string().trim().min(1).max(80).default('Verify'),
    buttonEmoji: z.string().trim().max(32).default('✅'),
    buttonStyle: z.enum(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER']).default('SUCCESS'),
    captchaLength: z.number().int().min(4).max(8).default(6),
    captchaExpiresSeconds: z.number().int().min(120).max(300).default(180),
    maxAttempts: z.number().int().min(3).max(5).default(3),
    lockoutSeconds: z.number().int().min(60).max(86400).default(900),
    kickAfterFailure: z.literal(false).default(false),
    requireMembershipScreening: z.boolean().default(false),
    successMessage: z
      .string()
      .max(500)
      .default('Verification successful. You can now access the server.'),
    failureMessage: z
      .string()
      .max(500)
      .default('Verification failed. Check the challenge and try again.'),
    expiredMessage: z.string().max(500).default('This verification challenge has expired.'),
    lockedMessage: z
      .string()
      .max(500)
      .default('Too many failed attempts. Please wait before trying again.'),
    panelMessage: OnboardingMessageSchema.default({
      mode: 'TEXT',
      content:
        'Welcome to {server.name}, {user.mention}! Press the button below to verify that you are human.',
    }),
  })
  .strict();

const RoleIdListSchema = z
  .array(DiscordSnowflakeSchema)
  .max(25)
  .transform((roles) => [...new Set(roles)]);

export const AutoRoleConfigSchema = z
  .object({
    joinHumanRoleIds: RoleIdListSchema.default([]),
    joinBotRoleIds: RoleIdListSchema.default([]),
    verifiedRoleIds: RoleIdListSchema.default([]),
    screeningCompleteRoleIds: RoleIdListSchema.default([]),
    joinDelaySeconds: z.number().int().min(0).max(86400).default(0),
    verifiedDelaySeconds: z.number().int().min(0).max(86400).default(0),
    continueOnError: z.boolean().default(true),
    retryFailedAssignments: z.boolean().default(true),
  })
  .strict();

export const WelcomeCardConfigSchema = z
  .object({
    width: z.number().int().min(640).max(1920).default(1200),
    height: z.number().int().min(240).max(1080).default(480),
    backgroundUrl: OptionalHttpsUrlSchema.default(''),
    backgroundFit: z.enum(['COVER', 'CONTAIN']).default('COVER'),
    backgroundPosition: z.enum(['CENTER', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT']).default('CENTER'),
    overlayOpacity: z.number().min(0).max(0.9).default(0.45),
    textColor: ColorSchema.default(0xffffff),
    accentColor: ColorSchema.default(0x8b5cf6),
    avatarSize: z.number().int().min(64).max(320).default(180),
    avatarBorderWidth: z.number().int().min(0).max(20).default(6),
    avatarBorderColor: ColorSchema.default(0xffffff),
    avatarShape: z.enum(['CIRCLE', 'ROUNDED_SQUARE']).default('CIRCLE'),
    textAlignment: z.enum(['LEFT', 'CENTER', 'RIGHT']).default('LEFT'),
    font: z.enum(['SANS', 'SERIF', 'MONO']).default('SANS'),
    titleTemplate: z.string().max(120).default('WELCOME'),
    subtitleTemplate: z.string().max(200).default('{user.displayName}'),
    bodyTemplate: z.string().max(300).default('Have a great time in {server.name}'),
    memberCountTemplate: z.string().max(100).default('Member #{server.memberCount}'),
    showServerIcon: z.boolean().default(true),
    format: z.enum(['PNG', 'JPEG']).default('PNG'),
    quality: z.number().int().min(50).max(95).default(85),
  })
  .strict()
  .superRefine((card, context) => {
    if (card.width * card.height > 2_073_600) {
      context.addIssue({ code: 'custom', message: 'Welcome card pixel area is too large.' });
    }
  });

export const OnboardingBasicsInputSchema = z
  .object({
    welcomeEnabled: z.boolean(),
    goodbyeEnabled: z.boolean(),
    verificationEnabled: z.boolean(),
    autoRoleEnabled: z.boolean(),
    welcomeCardEnabled: z.boolean(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const WelcomeUpdateSchema = z
  .object({ expectedVersion: z.number().int().positive(), config: WelcomeConfigSchema })
  .strict();
export const GoodbyeUpdateSchema = z
  .object({ expectedVersion: z.number().int().positive(), config: GoodbyeConfigSchema })
  .strict();
export const VerificationUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    setupMode: VerificationSetupModeSchema,
    captchaType: OnboardingCaptchaTypeSchema,
    roleGrantCondition: OnboardingRoleGrantConditionSchema,
    config: VerificationConfigSchema,
  })
  .strict();
export const AutoRoleUpdateSchema = z
  .object({ expectedVersion: z.number().int().positive(), config: AutoRoleConfigSchema })
  .strict();
export const WelcomeCardUpdateSchema = z
  .object({ expectedVersion: z.number().int().positive(), config: WelcomeCardConfigSchema })
  .strict();

export const OnboardingConfigResponseSchema = z
  .object({
    guildId: DiscordSnowflakeSchema,
    welcomeEnabled: z.boolean(),
    goodbyeEnabled: z.boolean(),
    verificationEnabled: z.boolean(),
    autoRoleEnabled: z.boolean(),
    welcomeCardEnabled: z.boolean(),
    verificationChannelId: DiscordSnowflakeSchema.nullable(),
    verifiedRoleId: DiscordSnowflakeSchema.nullable(),
    unverifiedRoleId: DiscordSnowflakeSchema.nullable(),
    verificationMessageId: DiscordSnowflakeSchema.nullable(),
    setupMode: VerificationSetupModeSchema,
    captchaType: OnboardingCaptchaTypeSchema,
    roleGrantCondition: OnboardingRoleGrantConditionSchema,
    resourceHealth: z.enum(['NOT_CONFIGURED', 'PENDING', 'HEALTHY', 'PARTIAL', 'BROKEN']),
    welcome: WelcomeConfigSchema,
    goodbye: GoodbyeConfigSchema,
    verification: VerificationConfigSchema,
    autoRole: AutoRoleConfigSchema,
    welcomeCard: WelcomeCardConfigSchema,
    version: z.number().int().positive(),
    lastWelcomeAt: z.iso.datetime().nullable(),
    lastGoodbyeAt: z.iso.datetime().nullable(),
    lastVerificationAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type OnboardingConfigResponse = z.infer<typeof OnboardingConfigResponseSchema>;
export type WelcomeConfig = z.infer<typeof WelcomeConfigSchema>;
export type GoodbyeConfig = z.infer<typeof GoodbyeConfigSchema>;
export type VerificationConfig = z.infer<typeof VerificationConfigSchema>;
export type AutoRoleConfig = z.infer<typeof AutoRoleConfigSchema>;
export type WelcomeCardConfig = z.infer<typeof WelcomeCardConfigSchema>;
export type OnboardingMessage = z.infer<typeof OnboardingMessageSchema>;

export const defaultWelcomeConfig = (): WelcomeConfig => WelcomeConfigSchema.parse({});
export const defaultGoodbyeConfig = (): GoodbyeConfig => GoodbyeConfigSchema.parse({});
export const defaultVerificationConfig = (): VerificationConfig =>
  VerificationConfigSchema.parse({});
export const defaultAutoRoleConfig = (): AutoRoleConfig => AutoRoleConfigSchema.parse({});
export const defaultWelcomeCardConfig = (): WelcomeCardConfig => WelcomeCardConfigSchema.parse({});
