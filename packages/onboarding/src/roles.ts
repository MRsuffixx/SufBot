import type { OnboardingConfigResponse } from './contracts.js';

export type OnboardingConditionState = {
  captchaVerified: boolean;
  membershipScreeningCompleted: boolean;
};

export const isPostVerificationConditionSatisfied = (
  condition: OnboardingConfigResponse['roleGrantCondition'],
  state: OnboardingConditionState,
): boolean => {
  switch (condition) {
    case 'CAPTCHA_ONLY':
      return state.captchaVerified;
    case 'SCREENING_ONLY':
      return state.membershipScreeningCompleted;
    case 'EITHER':
      return state.captchaVerified || state.membershipScreeningCompleted;
    case 'BOTH':
      return state.captchaVerified && state.membershipScreeningCompleted;
  }
};

export type OnboardingRoleCandidate = {
  id: string;
  guildId: string;
  managed: boolean;
  position: number;
  isEveryone: boolean;
};

export type OnboardingRoleDecision =
  | { assignable: true }
  | {
      assignable: false;
      code: 'CROSS_GUILD_ROLE' | 'EVERYONE_ROLE' | 'MANAGED_ROLE' | 'BOT_ROLE_TOO_LOW';
    };

export const evaluateOnboardingRole = (
  candidate: OnboardingRoleCandidate,
  guildId: string,
  botHighestRolePosition: number,
): OnboardingRoleDecision => {
  if (candidate.guildId !== guildId) {
    return { assignable: false, code: 'CROSS_GUILD_ROLE' };
  }
  if (candidate.isEveryone) return { assignable: false, code: 'EVERYONE_ROLE' };
  if (candidate.managed) return { assignable: false, code: 'MANAGED_ROLE' };
  if (candidate.position >= botHighestRolePosition) {
    return { assignable: false, code: 'BOT_ROLE_TOO_LOW' };
  }
  return { assignable: true };
};

export const deduplicateRoleIds = (...groups: readonly (readonly string[])[]): string[] => [
  ...new Set(groups.flat()),
];
