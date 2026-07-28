import { createId } from '@sufbot/shared';
import type { BillingProviderName } from '@sufbot/billing';
import { createBillingCheckoutAction } from '@/app/actions/billing';
import { Button } from '@/components/ui/button';

export function BillingCheckoutForm({
  guildId,
  planCode,
  provider,
  disabled,
}: {
  guildId: string;
  planCode: string;
  provider: BillingProviderName;
  disabled?: boolean;
}) {
  return (
    <form action={createBillingCheckoutAction} className="mt-5 space-y-4">
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="planCode" value={planCode} />
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="idempotencyKey" value={createId('mut')} />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmationAccepted"
          value="true"
          required
          className="mt-1"
          disabled={disabled}
        />
        <span>
          I confirm this guild, the monthly automatic renewal, the cancellation
          policy, and the Terms and Privacy Policy.
        </span>
      </label>
      <Button type="submit" disabled={disabled}>
        Continue securely with {provider === 'STRIPE' ? 'Stripe' : 'PayTR'}
      </Button>
    </form>
  );
}
