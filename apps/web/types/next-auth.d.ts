import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      discordId: string;
      platformRole: 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER';
    } & DefaultSession['user'];
    error?: 'SessionRevoked';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    discordId?: string;
    platformRole?: 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER';
    sessionVersion?: number;
    revoked?: boolean;
  }
}

