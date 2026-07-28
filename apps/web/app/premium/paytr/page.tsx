import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { requireDashboardSession } from '@/lib/session';
import { billingCheckoutCookies } from '@/lib/billing-cookies';

export const dynamic = 'force-dynamic';

export default async function PaytrPaymentPage() {
  await requireDashboardSession();
  const cookieStore = await cookies();
  const token = cookieStore.get(billingCheckoutCookies.paytrIframe)?.value;
  if (token === undefined || !/^[A-Za-z0-9_-]{16,4096}$/.test(token)) {
    redirect('/premium?error=PAYTR_IFRAME_SESSION_MISSING');
  }
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <Card>
        <h1 className="text-2xl font-black">PayTR secure payment</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Premium activates only after the signed PayTR callback is durably processed.
          This page is not proof of payment.
        </p>
        <iframe
          title="PayTR secure payment"
          src={`https://www.paytr.com/odeme/guvenli/${token}`}
          className="mt-6 min-h-[720px] w-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation-by-user-activation"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </Card>
    </main>
  );
}
