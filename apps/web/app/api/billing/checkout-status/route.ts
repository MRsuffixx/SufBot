import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { BillingCheckoutService } from '@sufbot/billing';
import { isAppError } from '@sufbot/shared';
import { auth } from '@/auth';
import {
  appConfig,
  billingProviders,
  prisma,
  webEnvironment,
} from '@/lib/runtime';
import { billingCheckoutCookies } from '@/lib/billing-cookies';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (session?.user.id === undefined || session.error === 'SessionRevoked') {
    return NextResponse.json({ state: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const cookieStore = await cookies();
  const checkoutSessionId = cookieStore.get(billingCheckoutCookies.session)?.value;
  const statusToken = cookieStore.get(billingCheckoutCookies.status)?.value;
  if (checkoutSessionId === undefined || statusToken === undefined) {
    return NextResponse.json({ state: 'NOT_FOUND' }, { status: 404 });
  }
  try {
    const result = await new BillingCheckoutService(
      prisma,
      appConfig,
      billingProviders,
      webEnvironment.NODE_ENV,
    ).getCheckoutStatus({
      checkoutSessionId,
      statusToken,
      userId: session.user.id,
    });
    return NextResponse.json(result, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return NextResponse.json(
      { state: isAppError(error) ? error.code : 'UNAVAILABLE' },
      { status: isAppError(error) ? error.statusCode : 503 },
    );
  }
}
