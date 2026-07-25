import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export const requireDashboardSession = async () => {
  const session = await auth();
  if (session?.user.id === undefined || session.error === 'SessionRevoked') {
    redirect('/login?returnTo=/dashboard');
  }
  return session;
};
