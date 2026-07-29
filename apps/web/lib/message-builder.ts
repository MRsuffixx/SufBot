import type { OnboardingMessage } from '@sufbot/onboarding';

export type MessageTemplate = OnboardingMessage;
export type NormalMessageContent = MessageTemplate['content'];
export type DiscordEmbedTemplate = MessageTemplate['embed'];
export type EmbedFieldTemplate = DiscordEmbedTemplate['fields'][number];
export type AllowedMentionsTemplate = MessageTemplate['allowedMentions'];

export type MessageAttachmentTemplate = {
  id: string;
  kind:
    | 'WELCOME_CARD'
    | 'GENERATED_IMAGE'
    | 'UPLOADED_IMAGE'
    | 'TRANSCRIPT'
    | 'GENERATED_REPORT';
  name: string;
  url: string | null;
  status: 'READY' | 'PENDING' | 'UNAVAILABLE';
};

export type BuilderMessageTemplate = MessageTemplate & {
  attachments: MessageAttachmentTemplate[];
};

export type BuilderValidationIssue = {
  path: string;
  message: string;
};

export type BuilderValidationResult = {
  valid: boolean;
  totalEmbedCharacters: number;
  issues: BuilderValidationIssue[];
};

export type TemplateVariable = {
  token: string;
  category:
    | 'user'
    | 'member'
    | 'server'
    | 'channel'
    | 'role'
    | 'verification'
    | 'invite'
    | 'date'
    | 'moderation'
    | 'ticket'
    | 'premium'
    | 'custom';
  label: string;
  description: string;
  example: string;
  contexts: readonly ('welcome' | 'goodbye' | 'verification' | 'ticket' | 'moderation' | 'all')[];
  premium?: boolean;
};

export const templateVariables: readonly TemplateVariable[] = [
  {
    token: '{user.mention}',
    category: 'user',
    label: 'User mention',
    description: 'Mentions the member when the mention policy allows it.',
    example: '@Ada',
    contexts: ['all'],
  },
  {
    token: '{user.username}',
    category: 'user',
    label: 'Username',
    description: 'The account username without a mention.',
    example: 'ada_dev',
    contexts: ['all'],
  },
  {
    token: '{user.displayName}',
    category: 'member',
    label: 'Display name',
    description: 'The member display name in this server.',
    example: 'Ada',
    contexts: ['all'],
  },
  {
    token: '{member.joinedAt}',
    category: 'member',
    label: 'Join date',
    description: 'The date the member joined this server.',
    example: '29 Jul 2026',
    contexts: ['welcome', 'moderation'],
  },
  {
    token: '{server.name}',
    category: 'server',
    label: 'Server name',
    description: 'The current Discord server name.',
    example: 'SufBot Community',
    contexts: ['all'],
  },
  {
    token: '{server.memberCount}',
    category: 'server',
    label: 'Member count',
    description: 'The server member count when the message is rendered.',
    example: '12,481',
    contexts: ['welcome', 'all'],
  },
  {
    token: '{channel.mention}',
    category: 'channel',
    label: 'Channel mention',
    description: 'The active channel mention.',
    example: '#welcome',
    contexts: ['all'],
  },
  {
    token: '{role.mention}',
    category: 'role',
    label: 'Role mention',
    description: 'The configured role mention. Role mention policy still applies.',
    example: '@Member',
    contexts: ['verification', 'moderation'],
  },
  {
    token: '{verification.status}',
    category: 'verification',
    label: 'Verification status',
    description: 'The current member verification state.',
    example: 'Verified',
    contexts: ['verification'],
  },
  {
    token: '{invite.inviter}',
    category: 'invite',
    label: 'Inviter',
    description: 'The known inviter display name, when available.',
    example: 'Mira',
    contexts: ['welcome'],
  },
  {
    token: '{date.now}',
    category: 'date',
    label: 'Current date',
    description: 'The current localized date and time.',
    example: '29 Jul 2026, 21:45',
    contexts: ['all'],
  },
  {
    token: '{moderation.reason}',
    category: 'moderation',
    label: 'Moderation reason',
    description: 'The reason attached to a moderation action.',
    example: 'Repeated spam',
    contexts: ['moderation'],
  },
  {
    token: '{ticket.number}',
    category: 'ticket',
    label: 'Ticket number',
    description: 'The public ticket sequence number.',
    example: '#1042',
    contexts: ['ticket'],
  },
  {
    token: '{premium.tier}',
    category: 'premium',
    label: 'Premium tier',
    description: 'The active subscription tier for this server.',
    example: 'Premium',
    contexts: ['all'],
    premium: true,
  },
  {
    token: '{custom.value}',
    category: 'custom',
    label: 'Custom value',
    description: 'A module-provided custom variable.',
    example: 'Campaign A',
    contexts: ['all'],
    premium: true,
  },
] as const;

export const embedCharacterCount = (embed: DiscordEmbedTemplate): number =>
  embed.authorName.length +
  embed.title.length +
  embed.description.length +
  embed.footerText.length +
  embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

const isHttpsUrl = (value: string | null): boolean =>
  value === null || /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/iu.test(value);

export function validateBuilderMessage(message: MessageTemplate): BuilderValidationResult {
  const issues: BuilderValidationIssue[] = [];
  const includesText = message.mode === 'TEXT' || message.mode === 'TEXT_AND_EMBED';
  const includesEmbed = message.mode === 'EMBED' || message.mode === 'TEXT_AND_EMBED';
  if (includesText && message.content.trim().length === 0) {
    issues.push({ path: 'content', message: 'Text content is required for this message mode.' });
  }
  if (message.content.length > 2000) {
    issues.push({ path: 'content', message: 'Message content cannot exceed 2,000 characters.' });
  }
  if (
    includesEmbed &&
    message.embed.title.trim().length === 0 &&
    message.embed.description.trim().length === 0 &&
    message.embed.fields.length === 0
  ) {
    issues.push({
      path: 'embed',
      message: 'Add an embed title, description, or field before saving.',
    });
  }
  if (message.embed.fields.length > 25) {
    issues.push({ path: 'embed.fields', message: 'Discord embeds support at most 25 fields.' });
  }
  const totalEmbedCharacters = embedCharacterCount(message.embed);
  if (totalEmbedCharacters > 6000) {
    issues.push({
      path: 'embed',
      message: 'Discord embeds support at most 6,000 text characters in total.',
    });
  }
  for (const [path, value] of [
    ['embed.authorIconUrl', message.embed.authorIconUrl],
    ['embed.authorUrl', message.embed.authorUrl],
    ['embed.thumbnailUrl', message.embed.thumbnailUrl],
    ['embed.imageUrl', message.embed.imageUrl],
    ['embed.footerIconUrl', message.embed.footerIconUrl],
  ] as const) {
    if (!isHttpsUrl(value)) issues.push({ path, message: 'Use a valid HTTPS URL.' });
  }
  message.embed.fields.forEach((field, index) => {
    if (field.name.length > 256) {
      issues.push({
        path: `embed.fields.${index}.name`,
        message: 'Field names cannot exceed 256 characters.',
      });
    }
    if (field.value.length > 1024) {
      issues.push({
        path: `embed.fields.${index}.value`,
        message: 'Field values cannot exceed 1,024 characters.',
      });
    }
  });
  return { valid: issues.length === 0, totalEmbedCharacters, issues };
}

export function parseHexColor(value: string, fallback = 0x6d5dfc): number {
  const normalized = value.trim().replace(/^#/u, '');
  if (!/^[\da-f]{6}$/iu.test(normalized)) return fallback;
  return Number.parseInt(normalized, 16);
}

export function formatHexColor(value: number): string {
  const safeValue = Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : 0x6d5dfc;
  return `#${safeValue.toString(16).padStart(6, '0')}`;
}

export function moveEmbedField(
  fields: readonly EmbedFieldTemplate[],
  from: number,
  to: number,
): EmbedFieldTemplate[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= fields.length ||
    to >= fields.length
  ) {
    return fields.map((field) => ({ ...field }));
  }
  const next = fields.map((field) => ({ ...field }));
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

export function insertVariableAtSelection(
  value: string,
  token: string,
  selectionStart: number | null,
  selectionEnd: number | null,
): { value: string; cursor: number } {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  return {
    value: `${value.slice(0, start)}${token}${value.slice(end)}`,
    cursor: start + token.length,
  };
}

export function cloneMessageTemplate(message: MessageTemplate): MessageTemplate {
  return {
    ...message,
    embed: {
      ...message.embed,
      fields: message.embed.fields.map((field) => ({ ...field })),
    },
    allowedMentions: { ...message.allowedMentions },
  };
}

const previewValues: Readonly<Record<string, string>> = {
  '{user.mention}': '@Ada',
  '{user.username}': 'ada_dev',
  '{user.displayName}': 'Ada',
  '{member.joinedAt}': '29 Jul 2026',
  '{server.name}': 'SufBot Community',
  '{server.memberCount}': '12,481',
  '{channel.mention}': '#welcome',
  '{role.mention}': '@Member',
  '{verification.status}': 'Verified',
  '{invite.inviter}': 'Mira',
  '{date.now}': '29 Jul 2026, 21:45',
  '{moderation.reason}': 'Repeated spam',
  '{ticket.number}': '#1042',
  '{premium.tier}': 'Premium',
  '{custom.value}': 'Campaign A',
};

export function renderPreviewVariables(value: string): string {
  return Object.entries(previewValues).reduce(
    (rendered, [token, example]) => rendered.replaceAll(token, example),
    value,
  );
}
