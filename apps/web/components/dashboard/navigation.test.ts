import { describe, expect, it } from 'vitest';
import {
  createDashboardNavigation,
  currentGuildIdFromPath,
  isNavigationItemActive,
} from './navigation';

describe('dashboard responsive navigation model', () => {
  it('extracts the active guild only from guild dashboard routes', () => {
    expect(currentGuildIdFromPath('/dashboard/guilds/123456789012345678/onboarding')).toBe(
      '123456789012345678',
    );
    expect(currentGuildIdFromPath('/dashboard/guilds')).toBeNull();
  });

  it('adds grouped module navigation only with guild context', () => {
    expect(createDashboardNavigation(null).some((group) => group.labelKey === 'nav.serverManagement')).toBe(
      false,
    );
    expect(
      createDashboardNavigation('123456789012345678').some(
        (group) => group.labelKey === 'nav.serverManagement',
      ),
    ).toBe(true);
  });

  it('does not leave an exact parent route active on nested pages', () => {
    const guildNavigation = createDashboardNavigation('123456789012345678').flatMap(
      (group) => group.items,
    );
    const overview = guildNavigation.find(
      (item) => item.href === '/dashboard/guilds/123456789012345678',
    );
    expect(overview).toBeDefined();
    expect(
      isNavigationItemActive(
        overview!,
        '/dashboard/guilds/123456789012345678/onboarding/welcome',
      ),
    ).toBe(false);
  });
});
