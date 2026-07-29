import type {
  AutoRoleConfig,
  GoodbyeConfig,
  OnboardingDiscordResources,
  WelcomeConfig,
} from './contracts.js';

export type OnboardingResourceIssue = {
  code: 'CHANNEL_NOT_SENDABLE' | 'ROLE_NOT_ASSIGNABLE';
  message: string;
  resourceId: string;
};

const validateChannel = (
  channelId: string | null,
  needsEmbed: boolean,
  needsAttachment: boolean,
  resources: OnboardingDiscordResources,
): OnboardingResourceIssue[] => {
  if (channelId === null) return [];
  const channel = resources.channels.find((candidate) => candidate.id === channelId);
  if (
    channel === undefined ||
    !channel.canView ||
    !channel.canSend ||
    (needsEmbed && !channel.canEmbed) ||
    (needsAttachment && !channel.canAttach)
  ) {
    return [
      {
        code: 'CHANNEL_NOT_SENDABLE',
        message: 'The selected channel is not in this guild or the bot cannot send the message.',
        resourceId: channelId,
      },
    ];
  }
  return [];
};

export const validateWelcomeResources = (
  config: WelcomeConfig,
  resources: OnboardingDiscordResources,
): OnboardingResourceIssue[] =>
  validateChannel(
    config.channelId,
    config.message.mode !== 'TEXT',
    config.attachWelcomeCard,
    resources,
  );

export const validateGoodbyeResources = (
  config: GoodbyeConfig,
  resources: OnboardingDiscordResources,
): OnboardingResourceIssue[] =>
  validateChannel(config.channelId, config.message.mode !== 'TEXT', false, resources);

export const validateAutoRoleResources = (
  config: AutoRoleConfig,
  resources: OnboardingDiscordResources,
): OnboardingResourceIssue[] => {
  const roleIds = new Set([
    ...config.joinHumanRoleIds,
    ...config.joinBotRoleIds,
    ...config.verifiedRoleIds,
    ...config.screeningCompleteRoleIds,
  ]);
  return [...roleIds].flatMap((roleId) =>
    resources.roles.some((role) => role.id === roleId && role.assignable)
      ? []
      : [
          {
            code: 'ROLE_NOT_ASSIGNABLE' as const,
            message: 'A selected role is not in this guild or cannot be assigned by the bot.',
            resourceId: roleId,
          },
        ],
  );
};
