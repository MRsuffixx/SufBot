# Web dashboard UI architecture audit

Date: 2026-07-29

Scope reviewed:

- `apps/web/app/**`
- `apps/web/components/**`
- `apps/web/lib/**`
- `apps/web/package.json`
- Tailwind CSS 4 and shadcn configuration
- dashboard, guild, onboarding, message, verification, billing, loading, error, theme,
  localization, and responsive patterns

## Current architecture

The web app is a server-component-first Next.js App Router application. Authentication,
authorization, guild loading, billing, and onboarding data are resolved on the server. Mutations
use React server actions through a shared `ActionForm`. The visual layer has only two true shadcn
style primitives (`Button` and `Card`); most layouts, controls, badges, tables, and status
presentation are authored directly in routes.

The onboarding domain already has a strong message contract. `OnboardingMessageSchema` supports
text, embed, text plus embed, Discord embed fields, safe allowed mentions, an unknown-variable
policy, and delete-after behavior. The current dashboard exposes only the mode and text content, so
most of the existing persisted capability is hidden rather than absent.

## Findings

### Design system

- Theme variables cover only background, foreground, two surfaces, muted text, border, and a grid.
  Required semantic roles such as status, focus, premium, overlay, shadow, and code are missing.
- Raw Tailwind palette names and hexadecimal colors are repeated throughout routes and components.
- Radius, control height, card padding, shadows, animation timing, sidebar width, header height, and
  z-index have no shared contract.
- The light/dark toggle has no explicit system mode and applies the theme after hydration, which can
  produce a flash.
- Typography is repeated as route-local class strings. Page, section, card, label, help, table,
  status, and code styles are not named primitives.

### Shell and navigation

- The dashboard is rendered beneath the public site header and above the public footer.
- The sidebar has three flat links, no active state, guild context, grouped modules, collapse mode,
  mobile drawer, nested navigation, premium states, keyboard treatment, or collapsed tooltips.
- Guild navigation is a second horizontal list with no active state. It will not scale to dozens of
  modules.
- There is no dashboard header, breadcrumb model, global search entry point, status summary, or
  reusable page-width mode.
- The current mobile behavior replaces the sidebar with a three-column row and cannot support
  deeper navigation.

### Components and duplication

- Control classes are independently duplicated in message, role, verification, welcome-card,
  settings, commands, checkout, and billing-admin forms.
- Status badges, metrics, diagnostic cards, page eyebrows, page titles, help text, empty states,
  warning panels, and section headers are independently reimplemented.
- `max-w-6xl` page containers and card-based page headers are repeated without a layout primitive.
- Tables are route-specific and only provide horizontal overflow; there is no filter, loading,
  empty, mobile-card, selection, or detail pattern.
- Future modules would need to copy route layouts, enabled-state badges, permission messaging,
  forms, save feedback, and navigation entries.

### Forms and builders

- Labels are usually present, but descriptions, constraints, validation summaries, counters, and
  field-level errors are inconsistent or absent.
- Native multi-selects and raw Discord IDs expose implementation details instead of Discord
  metadata.
- Save actions are local to each form. There is no draft/saved separation, global dirty state,
  revert, browser-close protection, navigation warning, or Ctrl/Cmd+S.
- The existing message form does not render persisted embed data. Editing mode/content preserves
  hidden embed data in the action, but users cannot view or change it.
- There is no live message preview, variable browser, cursor insertion, field reorder UI, media
  validation, color workflow, mention policy editor, or responsive builder mode.
- Verification is one long form; welcome-card and role pages repeat the same control structures.

### States, accessibility, and performance

- Route-level guarded errors and no-data copy exist, but reusable empty, error, unavailable,
  permission, premium, deleted-resource, and skeleton states do not.
- There are no `loading.tsx` dashboard boundaries or skeleton primitives.
- Active navigation is not announced. Mobile navigation, command palette behavior, dialogs, and
  keyboard reorder behavior do not exist.
- Focus behavior is defined only for buttons. Inputs, links, cards, and native selectors lack a
  consistent visible focus ring.
- Reduced-motion behavior is not defined.
- Dashboard server rendering is a good baseline. The redesign should retain it and isolate client
  state to shell controls, unsaved-state coordination, and builders.
- The message preview can remain local and memoized. Heavy pickers should be loaded only when their
  section is opened.

### Localization and content integrity

- The shared package has English and Turkish command/runtime translations, but the web dashboard has
  no localization provider or dashboard dictionary.
- Reusable web UI currently hardcodes English.
- Several source strings display mojibake sequences such as `Â·`, `â€”`, and broken Turkish text.
  These should be corrected as touched.

## Redesign boundaries

The redesign will preserve the server-component and server-action architecture, authorization
checks, guild installation resolution, billing services, onboarding repository, cache behavior,
and persisted schemas. New client components will be limited to interaction-heavy surfaces.

The implementation will establish:

1. semantic CSS variables with Tailwind 4 theme aliases;
2. named typography, layout, status, form, and state primitives;
3. a responsive application shell with one navigation model;
4. a dashboard-only localization layer for all new reusable UI;
5. one page-level unsaved-changes coordinator;
6. a reusable message builder adapted to the existing onboarding message schema;
7. development-only component showcase and focused pure-logic tests.

