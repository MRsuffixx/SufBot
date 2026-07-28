import type { AppConfig } from '@sufbot/config';

export const PremiumEntitlement = {
  Base: 'premium',
  AutomodAdvanced: 'premium.automod.advanced',
  ModerationHistoryExtended: 'premium.moderation.history.extended',
  LoggingExtended: 'premium.logging.extended',
  LoggingAdvancedFilters: 'premium.logging.filters.advanced',
  TicketTranscripts: 'premium.ticket.transcripts',
  TicketPanelsExtended: 'premium.ticket.panels.extended',
  WelcomeTemplatesAdvanced: 'premium.welcome.templates.advanced',
  WelcomeMultipleConfigurations: 'premium.welcome.multiple',
  ReactionRolesAdvanced: 'premium.reaction_roles.advanced',
  ScheduledMessages: 'premium.scheduled_messages',
  AnalyticsExtended: 'premium.analytics.extended',
  CustomBranding: 'premium.branding.custom',
  CustomCommandsExtended: 'premium.custom_commands.extended',
  TemporaryVoiceExtended: 'premium.temporary_voice.extended',
  SupportBadge: 'premium.support.badge',
} as const;

export type PremiumEntitlementKey = (typeof PremiumEntitlement)[keyof typeof PremiumEntitlement];

export type PremiumFeatureDefinition = {
  key: PremiumEntitlementKey;
  name: string;
  description: string;
  essentialSecurityFeature: false;
};

export const premiumFeatureCatalogue: readonly PremiumFeatureDefinition[] = [
  {
    key: PremiumEntitlement.AutomodAdvanced,
    name: 'Advanced AutoMod',
    description: 'Expanded AutoMod rules and advanced conditions.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.ModerationHistoryExtended,
    name: 'Extended moderation history',
    description: 'Longer searchable moderation history retention.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.LoggingExtended,
    name: 'Extended logging',
    description: 'Longer audit retention and richer event coverage.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.LoggingAdvancedFilters,
    name: 'Advanced logging filters',
    description: 'Fine-grained logging filters and routing.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.TicketTranscripts,
    name: 'Ticket transcript retention',
    description: 'Retained ticket transcripts with controlled access.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.TicketPanelsExtended,
    name: 'More ticket panels',
    description: 'Expanded ticket panel capacity.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.WelcomeTemplatesAdvanced,
    name: 'Advanced welcome templates',
    description: 'Richer welcome templates and presentation controls.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.WelcomeMultipleConfigurations,
    name: 'Multiple welcome configurations',
    description: 'Multiple independent welcome flows per guild.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.ReactionRolesAdvanced,
    name: 'Advanced reaction-role panels',
    description: 'Expanded reaction-role panel configuration.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.ScheduledMessages,
    name: 'Scheduled messages',
    description: 'Create and manage scheduled guild messages.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.AnalyticsExtended,
    name: 'Advanced analytics',
    description: 'Longer windows and advanced analytics views.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.CustomBranding,
    name: 'Custom branding controls',
    description: 'Approved custom branding controls.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.CustomCommandsExtended,
    name: 'Higher custom-command limits',
    description: 'Expanded custom command capacity.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.TemporaryVoiceExtended,
    name: 'Extended temporary voice controls',
    description: 'Advanced temporary voice channel controls.',
    essentialSecurityFeature: false,
  },
  {
    key: PremiumEntitlement.SupportBadge,
    name: 'Premium support badge',
    description: 'Premium status and support identification.',
    essentialSecurityFeature: false,
  },
] as const;

const featureSets: Readonly<Record<number, readonly PremiumEntitlementKey[]>> = {
  1: [PremiumEntitlement.Base, ...premiumFeatureCatalogue.map((feature) => feature.key)],
};

export const entitlementsForFeatureSet = (version: number): readonly PremiumEntitlementKey[] => {
  const entitlements = featureSets[version];
  if (entitlements === undefined) {
    throw new TypeError(`Unsupported premium feature-set version: ${version}.`);
  }
  return entitlements;
};

export type PlanLimitKey = keyof AppConfig['billing']['limits']['free'];

export const getPlanLimit = (
  config: AppConfig,
  tier: 'free' | 'premium',
  key: PlanLimitKey,
): number => config.billing.limits[tier][key];
