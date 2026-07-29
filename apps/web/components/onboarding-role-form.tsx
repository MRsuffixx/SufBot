import type { AutoRoleConfig } from '@sufbot/onboarding';
import { updateAutoRoleConfigAction } from '@/app/actions/onboarding';
import { ActionForm } from './action-form';

const controlClass =
  'mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm';

export function OnboardingRoleForm({
  guildId,
  version,
  idempotencyKey,
  config,
  roles,
  maxAutoRoles,
  tier,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: AutoRoleConfig;
  roles: readonly {
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
    assignable: boolean;
  }[];
  maxAutoRoles: number;
  tier: 'free' | 'premium';
}) {
  const lists = [
    ['joinHumanRoleIds', 'Human roles on join', config.joinHumanRoleIds],
    ['joinBotRoleIds', 'Bot roles on join', config.joinBotRoleIds],
    ['verifiedRoleIds', 'Roles after verification condition', config.verifiedRoleIds],
    [
      'screeningCompleteRoleIds',
      'Roles after Membership Screening',
      config.screeningCompleteRoleIds,
    ],
  ] as const;
  return (
    <ActionForm
      action={updateAutoRoleConfigAction}
      submitLabel="Save automatic roles"
      className="grid gap-5"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="text-sm text-[var(--muted)]">
        {tier === 'premium' ? 'Premium' : 'Free'} limit: {maxAutoRoles} unique automatic roles
        across all groups. The API and bot enforce this limit.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {lists.map(([name, label, values]) => (
          <label key={name} className="text-sm font-semibold">
            {label}
            <select
              name={name}
              multiple
              size={Math.min(8, Math.max(4, roles.length))}
              defaultValue={[...values]}
              className={controlClass}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id} disabled={!role.assignable}>
                  {role.name} · position {role.position}
                  {role.managed ? ' · managed' : ''}
                  {!role.assignable ? ' · unavailable' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Join delay (seconds)
          <input
            type="number"
            name="joinDelaySeconds"
            min={0}
            max={86400}
            defaultValue={config.joinDelaySeconds}
            className={controlClass}
          />
        </label>
        <label className="text-sm font-semibold">
          Verified-role delay (seconds)
          <input
            type="number"
            name="verifiedDelaySeconds"
            min={0}
            max={86400}
            defaultValue={config.verifiedDelaySeconds}
            className={controlClass}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="continueOnError"
            defaultChecked={config.continueOnError}
            className="size-5 accent-violet-600"
          />
          Continue after a role failure
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="retryFailedAssignments"
            defaultChecked={config.retryFailedAssignments}
            className="size-5 accent-violet-600"
          />
          Retry transient Discord failures
        </label>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Every role is re-fetched from this guild and checked for managed status and bot hierarchy
        before assignment. Existing roles are skipped idempotently.
      </p>
    </ActionForm>
  );
}
