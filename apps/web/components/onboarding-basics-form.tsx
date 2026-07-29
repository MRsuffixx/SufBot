import { updateOnboardingBasicsAction } from '@/app/actions/onboarding';
import { Switch } from '@/components/ui/switch';
import { ActionForm } from './action-form';

const features = [
  ['welcomeEnabled', 'Welcome channel messages', 'Send a message when members join.'],
  ['goodbyeEnabled', 'Goodbye channel messages', 'Send a safe message when members leave.'],
  ['verificationEnabled', 'Human verification', 'Gate access behind the verification panel.'],
  ['autoRoleEnabled', 'Automatic roles', 'Assign configured roles at lifecycle events.'],
  ['welcomeCardEnabled', 'Welcome cards', 'Attach generated branded welcome images.'],
] as const;

export function OnboardingBasicsForm({
  guildId,
  version,
  idempotencyKey,
  values,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  values: Record<(typeof features)[number][0], boolean>;
}) {
  return (
    <ActionForm
      action={updateOnboardingBasicsAction}
      submitLabel="Save onboarding settings"
      className="grid gap-5"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-3 sm:grid-cols-2">
        {features.map(([name, label, description]) => (
          <Switch
            key={name}
            name={name}
            label={label}
            description={description}
            defaultChecked={values[name]}
          />
        ))}
      </div>
    </ActionForm>
  );
}
