import {
  Activity,
  BadgeHelp,
  Blocks,
  Bot,
  ChartNoAxesCombined,
  CircleGauge,
  Command,
  Crown,
  FileClock,
  Hand,
  ListChecks,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardMessageKey } from '@/lib/i18n/dashboard';

export type DashboardNavigationItem = {
  labelKey: DashboardMessageKey;
  href?: string;
  icon: LucideIcon;
  exact?: boolean;
  disabled?: boolean;
  premium?: boolean;
  nested?: boolean;
};

export type DashboardNavigationGroup = {
  labelKey: DashboardMessageKey;
  items: DashboardNavigationItem[];
};

export function createDashboardNavigation(guildId: string | null): DashboardNavigationGroup[] {
  const guildBase = guildId === null ? null : `/dashboard/guilds/${guildId}`;
  return [
    {
      labelKey: 'nav.workspace',
      items: [
        { labelKey: 'nav.overview', href: '/dashboard', icon: CircleGauge, exact: true },
        { labelKey: 'nav.servers', href: '/dashboard/guilds', icon: UsersRound, exact: true },
      ],
    },
    ...(guildBase === null
      ? []
      : [
          {
            labelKey: 'nav.serverManagement' as const,
            items: [
              {
                labelKey: 'nav.overview' as const,
                href: guildBase,
                icon: Activity,
                exact: true,
              },
              { labelKey: 'nav.modules' as const, href: `${guildBase}/modules`, icon: Blocks },
              {
                labelKey: 'nav.onboarding' as const,
                href: `${guildBase}/onboarding`,
                icon: Hand,
                exact: true,
              },
              {
                labelKey: 'nav.welcome' as const,
                href: `${guildBase}/onboarding/welcome`,
                icon: Sparkles,
                nested: true,
              },
              {
                labelKey: 'nav.goodbye' as const,
                href: `${guildBase}/onboarding/goodbye`,
                icon: LogOut,
                nested: true,
              },
              {
                labelKey: 'nav.verification' as const,
                href: `${guildBase}/onboarding/verification`,
                icon: ShieldCheck,
                nested: true,
              },
              {
                labelKey: 'nav.roles' as const,
                href: `${guildBase}/onboarding/roles`,
                icon: UserRound,
                nested: true,
              },
              { labelKey: 'nav.commands' as const, href: `${guildBase}/commands`, icon: Command },
              {
                labelKey: 'nav.auditLogs' as const,
                href: `${guildBase}/audit-logs`,
                icon: FileClock,
              },
              {
                labelKey: 'nav.premium' as const,
                href: `${guildBase}/premium`,
                icon: Crown,
                premium: true,
              },
              { labelKey: 'nav.settings' as const, href: `${guildBase}/settings`, icon: Settings },
            ],
          },
        ]),
    {
      labelKey: 'nav.insights',
      items: [
        {
          labelKey: 'nav.analytics',
          icon: ChartNoAxesCombined,
          disabled: true,
          premium: true,
        },
        { labelKey: 'nav.automation', icon: Workflow, disabled: true },
      ],
    },
  ];
}

export const auxiliaryNavigation: DashboardNavigationItem[] = [
  { labelKey: 'nav.documentation', href: '/docs', icon: BadgeHelp },
  { labelKey: 'nav.profile', href: '/dashboard/profile', icon: UserRound },
];

export const navigationIcons = {
  brand: Bot,
  checklist: ListChecks,
};

export function isNavigationItemActive(item: DashboardNavigationItem, pathname: string): boolean {
  if (item.href === undefined) return false;
  if (item.exact === true) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function currentGuildIdFromPath(pathname: string): string | null {
  return pathname.match(/^\/dashboard\/guilds\/(\d{17,20})(?:\/|$)/u)?.[1] ?? null;
}
