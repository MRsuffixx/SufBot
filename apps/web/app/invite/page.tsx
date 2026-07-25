import { redirect } from 'next/navigation';
import { botInviteUrl } from '@/lib/discord';

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ guildId?: string }>;
}) {
  const { guildId } = await searchParams;
  redirect(botInviteUrl(guildId));
}
