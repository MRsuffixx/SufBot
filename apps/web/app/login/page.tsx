import { redirect } from 'next/navigation';
import { LogIn, ShieldCheck } from 'lucide-react';
import { auth, signIn } from '@/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user.id !== undefined && session.error !== 'SessionRevoked') redirect('/dashboard');

  return (
    <main className="mx-auto grid min-h-[660px] max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.18em] text-violet-600">Secure sign-in</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight">Your Discord permissions are the boundary.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
          SufBot requests only <code>identify</code> and <code>guilds</code>. Access tokens remain
          server-side and encrypted at rest.
        </p>
      </div>
      <Card className="p-8">
        <ShieldCheck size={34} className="text-violet-600" />
        <h2 className="mt-7 text-2xl font-bold">Continue with Discord</h2>
        <p className="mt-3 leading-7 text-[var(--muted)]">
          We will show every guild and enable management only where you are the owner or have
          Manage Server.
        </p>
        <form
          className="mt-8"
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: '/dashboard/guilds' });
          }}
        >
          <Button type="submit" size="lg" className="w-full">
            <LogIn size={18} /> Sign in with Discord
          </Button>
        </form>
      </Card>
    </main>
  );
}

