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
      {provider === 'PAYTR' ? (
        <div className="grid gap-3">
          <input
            required
            type="email"
            name="billingEmail"
            placeholder="Billing email"
            maxLength={100}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <input
            required
            name="billingFullName"
            placeholder="Full name"
            minLength={2}
            maxLength={60}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <input
            required
            name="billingAddress"
            placeholder="Billing address"
            minLength={3}
            maxLength={400}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
          <input
            required
            type="tel"
            name="billingPhone"
            placeholder="Phone"
            minLength={7}
            maxLength={20}
            className="rounded-xl border bg-transparent px-3 py-2"
          />
        </div>
      ) : null}
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
          {provider === 'STRIPE'
            ? 'I confirm this guild, monthly automatic renewal, the cancellation policy, and the Terms and Privacy Policy.'
            : 'I confirm this guild, a single one-month entitlement with no automatic renewal, and the Terms and Privacy Policy.'}
        </span>
      </label>
      <Button type="submit" disabled={disabled}>
        Continue securely with {provider === 'STRIPE' ? 'Stripe' : 'PayTR'}
      </Button>
    </form>
  );
}
