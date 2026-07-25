import { ActionForm } from './action-form';
import { updateGuildModuleAction } from '@/app/actions/guild';

export function ModuleForm({
  guildId,
  moduleKey,
  enabled,
  version,
  idempotencyKey,
}: {
  guildId: string;
  moduleKey: string;
  enabled: boolean;
  version: number;
  idempotencyKey: string;
}) {
  return (
    <ActionForm
      action={updateGuildModuleAction}
      submitLabel={enabled ? 'Disable module' : 'Enable module'}
      className="grid gap-3"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="moduleKey" value={moduleKey} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </ActionForm>
  );
}
