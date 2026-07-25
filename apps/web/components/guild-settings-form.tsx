import { ActionForm } from './action-form';
import { updateGuildSettingsAction } from '@/app/actions/guild';

export function GuildSettingsForm({
  guildId,
  locale,
  timezone,
  commandPrefix,
  version,
  idempotencyKey,
}: {
  guildId: string;
  locale: string;
  timezone: string;
  commandPrefix: string;
  version: number;
  idempotencyKey: string;
}) {
  return (
    <ActionForm
      action={updateGuildSettingsAction}
      submitLabel="Save settings"
      className="grid gap-5"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="grid gap-2 text-sm font-medium">
        Server language
        <select
          name="locale"
          defaultValue={locale}
          className="h-11 rounded-xl border bg-[var(--background)] px-3"
        >
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Timezone
        <input
          name="timezone"
          defaultValue={timezone}
          minLength={1}
          maxLength={64}
          className="h-11 rounded-xl border bg-[var(--background)] px-3"
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Legacy command prefix
        <input
          name="commandPrefix"
          defaultValue={commandPrefix}
          minLength={1}
          maxLength={5}
          className="h-11 rounded-xl border bg-[var(--background)] px-3"
          required
        />
      </label>
    </ActionForm>
  );
}

