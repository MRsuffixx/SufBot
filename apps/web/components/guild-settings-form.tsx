import { ActionForm } from './action-form';
import { updateGuildSettingsAction } from '@/app/actions/guild';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

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
      <Field
        label="Server language"
        htmlFor="guild-locale"
        help="Controls bot responses and localized module defaults for this server."
      >
        <Select id="guild-locale" name="locale" defaultValue={locale}>
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </Select>
      </Field>
      <Field
        label="Timezone"
        htmlFor="guild-timezone"
        help="Use an IANA timezone such as Europe/Istanbul or UTC."
      >
        <Input
          id="guild-timezone"
          name="timezone"
          defaultValue={timezone}
          minLength={1}
          maxLength={64}
          required
        />
      </Field>
      <Field
        label="Legacy command prefix"
        htmlFor="guild-prefix"
        help="Used only where legacy text commands remain enabled."
      >
        <Input
          id="guild-prefix"
          name="commandPrefix"
          defaultValue={commandPrefix}
          minLength={1}
          maxLength={5}
          className="max-w-28 font-mono"
          required
        />
      </Field>
    </ActionForm>
  );
}
