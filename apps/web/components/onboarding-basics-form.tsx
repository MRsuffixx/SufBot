import { updateOnboardingBasicsAction } from '@/app/actions/onboarding';
import { ActionForm } from './action-form';

const features = [
  ['welcomeEnabled', 'Welcome channel messages'],
  ['goodbyeEnabled', 'Goodbye channel messages'],
  ['verificationEnabled', 'Human verification'],
  ['autoRoleEnabled', 'Automatic roles'],
  ['welcomeCardEnabled', 'Welcome cards'],
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
        {features.map(([name, label]) => (
          <label
            key={name}
            className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] p-4"
          >
            <span className="font-semibold">{label}</span>
            <input
              type="checkbox"
              name={name}
              defaultChecked={values[name]}
              className="size-5 accent-violet-600"
            />
          </label>
        ))}
      </div>
    </ActionForm>
  );
}
