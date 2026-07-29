import type {
  OnboardingConfigResponse,
  OnboardingDiscordResources,
} from '@sufbot/onboarding';
import { setupVerificationAction } from '@/app/actions/onboarding';
import { ActionForm } from './action-form';

const controlClass =
  'mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm';

export function VerificationSetupForm({
  guildId,
  config,
  resources,
  idempotencyKey,
}: {
  guildId: string;
  config: OnboardingConfigResponse;
  resources: OnboardingDiscordResources | null;
  idempotencyKey: string;
}) {
  const roles = resources?.roles ?? [];
  const channels = resources?.channels.filter((channel) => channel.type === 'TEXT') ?? [];
  return (
    <ActionForm
      action={setupVerificationAction}
      submitLabel="Queue verification operation"
      className="grid gap-6"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={config.version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Operation
          <select
            name="operation"
            defaultValue={config.resourceHealth === 'NOT_CONFIGURED' ? 'SETUP' : 'REPAIR'}
            className={controlClass}
          >
            <option value="SETUP">Set up</option>
            <option value="REPAIR">Repair</option>
            <option value="RESEND">Re-send panel</option>
            <option value="DRY_RUN">Dry run only</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Visibility mode
          <select name="mode" defaultValue={config.setupMode} className={controlClass}>
            <option value="EVERYONE_VISIBLE">Everyone sees verification channel</option>
            <option value="DEDICATED_UNVERIFIED_ROLE">Dedicated unverified role</option>
          </select>
        </label>
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
        <legend className="px-2 font-bold">Verification channel</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Strategy
            <select
              name="channelStrategy"
              defaultValue={config.verificationChannelId === null ? 'CREATE' : 'EXISTING'}
              className={controlClass}
            >
              <option value="CREATE">Create a new channel</option>
              <option value="EXISTING">Use an existing channel</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Existing channel
            <select
              name="channelId"
              defaultValue={config.verificationChannelId ?? ''}
              className={controlClass}
            >
              <option value="">Not selected</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id} disabled={!channel.canManage}>
                  #{channel.name}
                  {!channel.canManage ? ' · not manageable' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            New channel name
            <input
              name="channelName"
              maxLength={100}
              defaultValue={config.verification.channelName}
              className={controlClass}
            />
          </label>
          <label className="text-sm font-semibold">
            Category
            <select
              name="categoryId"
              defaultValue={config.verification.categoryId ?? ''}
              className={controlClass}
            >
              <option value="">No category</option>
              {(resources?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id} disabled={!category.canManage}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <RoleSetup
          prefix="verifiedRole"
          title="Verified role"
          currentRoleId={config.verifiedRoleId}
          defaultName={config.verification.verifiedRoleName}
          defaultColor="#57f287"
          roles={roles}
        />
        <RoleSetup
          prefix="unverifiedRole"
          title="Unverified role (dedicated mode)"
          currentRoleId={config.unverifiedRoleId}
          defaultName={config.verification.unverifiedRoleName}
          defaultColor="#ed4245"
          roles={roles}
        />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
        <legend className="px-2 font-bold">Optional channel restrictions</legend>
        <label className="text-sm font-semibold">
          Channels visible only after verification
          <select
            name="restrictedChannelIds"
            multiple
            size={Math.min(10, Math.max(4, channels.length))}
            className={controlClass}
          >
            {channels
              .filter((channel) => channel.id !== config.verificationChannelId)
              .map((channel) => (
                <option key={channel.id} value={channel.id} disabled={!channel.canManage}>
                  #{channel.name}
                  {!channel.canManage ? ' · not manageable' : ''}
                </option>
              ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
        <legend className="px-2 font-bold">Existing-member migration</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Migration behavior
            <select name="migrationMode" defaultValue="NONE" className={controlClass}>
              <option value="NONE">Do not assign existing members</option>
              <option value="FIRST_ELIGIBLE">First eligible members</option>
              <option value="MANUAL">Manually entered member IDs</option>
              <option value="ALL_ELIGIBLE">All eligible members, bounded</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Maximum members
            <input
              type="number"
              name="migrationMaxCount"
              min={1}
              max={10000}
              defaultValue={15}
              className={controlClass}
            />
          </label>
        </div>
        <label className="text-sm font-semibold">
          Manual member IDs
          <textarea
            name="memberIds"
            rows={3}
            placeholder="One Discord user ID per line"
            className={controlClass}
          />
        </label>
      </fieldset>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <p className="font-bold">Permission changes</p>
        <p className="mt-2 leading-6 text-[var(--muted)]">
          The verification channel will deny sending and threads to members, hide itself from the
          verified role, and allow the bot to send embeds and attachments. Explicitly selected
          restricted channels will deny View Channel to @everyone and allow it to the verified
          role. Existing overwrite values are snapshotted for repair and rollback.
        </p>
        <label className="mt-4 flex items-start gap-3 font-semibold">
          <input type="checkbox" name="confirmed" className="mt-0.5 size-5 accent-violet-600" />
          I reviewed and approve these channel and role changes. Dry runs do not require this box.
        </label>
      </div>
      {resources === null ? (
        <p className="text-sm text-red-500">
          Live Discord resources are unavailable. Keep the bot online before submitting.
        </p>
      ) : null}
    </ActionForm>
  );
}

function RoleSetup({
  prefix,
  title,
  currentRoleId,
  defaultName,
  defaultColor,
  roles,
}: {
  prefix: 'verifiedRole' | 'unverifiedRole';
  title: string;
  currentRoleId: string | null;
  defaultName: string;
  defaultColor: string;
  roles: OnboardingDiscordResources['roles'];
}) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
      <legend className="px-2 font-bold">{title}</legend>
      <label className="text-sm font-semibold">
        Strategy
        <select
          name={`${prefix}Strategy`}
          defaultValue={currentRoleId === null ? 'CREATE' : 'EXISTING'}
          className={controlClass}
        >
          <option value="CREATE">Create a new role</option>
          <option value="EXISTING">Use an existing role</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Existing role
        <select name={`${prefix}Id`} defaultValue={currentRoleId ?? ''} className={controlClass}>
          <option value="">Not selected</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id} disabled={!role.assignable}>
              {role.name}
              {!role.assignable ? ' · unavailable' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Name
          <input
            name={`${prefix}Name`}
            maxLength={100}
            defaultValue={defaultName}
            className={controlClass}
          />
        </label>
        <label className="text-sm font-semibold">
          Color
          <input
            type="color"
            name={`${prefix}Color`}
            defaultValue={defaultColor}
            className={controlClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" name={`${prefix}Hoist`} className="size-5 accent-violet-600" />
          Hoist
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name={`${prefix}Mentionable`}
            className="size-5 accent-violet-600"
          />
          Mentionable
        </label>
      </div>
    </fieldset>
  );
}
