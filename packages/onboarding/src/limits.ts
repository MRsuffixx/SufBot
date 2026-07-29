import { ValidationError } from '@sufbot/shared';
import type { AutoRoleConfig, WelcomeCardConfig } from './contracts.js';

export type OnboardingPlanLimits = {
  welcomeConfigurations: number;
  goodbyeConfigurations: number;
  autoRoles: number;
  verificationPanels: number;
  customCardBackgrounds: number;
};

export type OnboardingLimitSnapshot = {
  tier: 'free' | 'premium';
  limits: OnboardingPlanLimits;
};

export type OnboardingLimitResolver = (guildId: string) => Promise<OnboardingLimitSnapshot>;

export const configuredAutoRoleIds = (config: AutoRoleConfig): readonly string[] => [
  ...new Set([
    ...config.joinHumanRoleIds,
    ...config.joinBotRoleIds,
    ...config.verifiedRoleIds,
    ...config.screeningCompleteRoleIds,
  ]),
];

export const assertAutoRoleLimit = (
  config: AutoRoleConfig,
  snapshot: OnboardingLimitSnapshot,
): void => {
  const count = configuredAutoRoleIds(config).length;
  if (count > snapshot.limits.autoRoles) {
    throw new ValidationError(
      `The ${snapshot.tier} plan allows at most ${snapshot.limits.autoRoles} automatic roles.`,
      { limit: snapshot.limits.autoRoles, requested: count, tier: snapshot.tier },
    );
  }
};

export const assertWelcomeCardLimit = (
  config: WelcomeCardConfig,
  snapshot: OnboardingLimitSnapshot,
): void => {
  const customBackgrounds = config.backgroundUrl === null ? 0 : 1;
  if (customBackgrounds > snapshot.limits.customCardBackgrounds) {
    throw new ValidationError(
      `The ${snapshot.tier} plan does not include custom welcome-card backgrounds.`,
      {
        limit: snapshot.limits.customCardBackgrounds,
        requested: customBackgrounds,
        tier: snapshot.tier,
      },
    );
  }
};

export const limitAutoRoleIds = (roleIds: readonly string[], maximum: number): readonly string[] =>
  [...new Set(roleIds)].slice(0, Math.max(0, maximum));
