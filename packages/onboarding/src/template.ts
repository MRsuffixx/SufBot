import type { OnboardingMessage } from './contracts.js';

export type OnboardingTemplateValue = string | number | Date | null | undefined;
export type OnboardingTemplateVariables = Readonly<Record<string, OnboardingTemplateValue>>;
export type OnboardingTemplateWarning = {
  code: 'UNKNOWN_VARIABLE';
  variable: string;
};
export type RenderedOnboardingTemplate = {
  value: string;
  warnings: OnboardingTemplateWarning[];
};

const VARIABLE_PATTERN = /\{([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*)\}/gu;
const MASS_MENTION_PATTERN = /@(everyone|here)/giu;

export const neutralizeMassMentions = (value: string): string =>
  value.replace(MASS_MENTION_PATTERN, '@\u200b$1');

export const safeTemplateText = (value: string): string =>
  neutralizeMassMentions(value).replaceAll('`', '\u02cb');

const serializeTemplateValue = (value: Exclude<OnboardingTemplateValue, null | undefined>): string =>
  value instanceof Date ? value.toISOString() : String(value);

export const renderOnboardingTemplate = (
  template: string,
  variables: OnboardingTemplateVariables,
  unknownVariablePolicy: OnboardingMessage['unknownVariablePolicy'] = 'PRESERVE',
): RenderedOnboardingTemplate => {
  const warnings: OnboardingTemplateWarning[] = [];
  const seenUnknownVariables = new Set<string>();
  const value = template.replace(VARIABLE_PATTERN, (token, variable: string) => {
    const replacement = variables[variable];
    if (replacement !== undefined && replacement !== null) {
      return serializeTemplateValue(replacement);
    }
    if (!seenUnknownVariables.has(variable)) {
      seenUnknownVariables.add(variable);
      warnings.push({ code: 'UNKNOWN_VARIABLE', variable });
    }
    return unknownVariablePolicy === 'EMPTY' ? '' : token;
  });
  return { value, warnings };
};

export type RenderedOnboardingMessage = {
  content?: string;
  embed?: {
    color: number;
    author?: { name: string; iconUrl?: string; url?: string };
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    imageUrl?: string;
    footer?: { text: string; iconUrl?: string };
    timestamp?: string;
    fields: { name: string; value: string; inline: boolean }[];
  };
  allowedMentions: {
    users: string[];
    roles: never[];
    parse: never[];
    repliedUser: false;
  };
  deleteAfterSeconds: number;
  warnings: OnboardingTemplateWarning[];
};

export const renderOnboardingMessage = (
  message: OnboardingMessage,
  variables: OnboardingTemplateVariables,
  userId: string,
  now = new Date(),
): RenderedOnboardingMessage => {
  const warnings: OnboardingTemplateWarning[] = [];
  const render = (template: string): string => {
    const rendered = renderOnboardingTemplate(
      template,
      variables,
      message.unknownVariablePolicy,
    );
    warnings.push(...rendered.warnings);
    return rendered.value;
  };
  const includeText = message.mode === 'TEXT' || message.mode === 'TEXT_AND_EMBED';
  const includeEmbed = message.mode === 'EMBED' || message.mode === 'TEXT_AND_EMBED';
  const embed = message.embed;
  return {
    ...(includeText ? { content: render(message.content) } : {}),
    ...(includeEmbed
      ? {
          embed: {
            color: embed.color,
            ...(embed.authorName === ''
              ? {}
              : {
                  author: {
                    name: render(embed.authorName),
                    ...(embed.authorIconUrl === null ? {} : { iconUrl: embed.authorIconUrl }),
                    ...(embed.authorUrl === null ? {} : { url: embed.authorUrl }),
                  },
                }),
            ...(embed.title === '' ? {} : { title: render(embed.title) }),
            ...(embed.description === '' ? {} : { description: render(embed.description) }),
            ...(embed.thumbnailUrl === null ? {} : { thumbnailUrl: embed.thumbnailUrl }),
            ...(embed.imageUrl === null ? {} : { imageUrl: embed.imageUrl }),
            ...(embed.footerText === ''
              ? {}
              : {
                  footer: {
                    text: render(embed.footerText),
                    ...(embed.footerIconUrl === null ? {} : { iconUrl: embed.footerIconUrl }),
                  },
                }),
            ...(embed.timestamp ? { timestamp: now.toISOString() } : {}),
            fields: embed.fields.map((field) => ({
              name: render(field.name),
              value: render(field.value),
              inline: field.inline,
            })),
          },
        }
      : {}),
    allowedMentions: {
      users: message.allowedMentions.mentionUser ? [userId] : [],
      roles: [],
      parse: [],
      repliedUser: false,
    },
    deleteAfterSeconds: message.deleteAfterSeconds,
    warnings: [...new Map(warnings.map((warning) => [warning.variable, warning])).values()],
  };
};
