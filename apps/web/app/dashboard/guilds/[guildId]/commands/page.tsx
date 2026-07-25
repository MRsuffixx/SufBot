import { createId } from '@sufbot/shared';
import { builtInModules } from '@sufbot/discord';
import { ActionForm } from '@/components/action-form';
import { Card } from '@/components/ui/card';
import { updateCommandOverrideAction } from '@/app/actions/guild';
import { prisma } from '@/lib/runtime';

export default async function CommandAccessPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const overrides = await prisma.guildCommandOverride.findMany({
    where: { guildId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <h2 className="text-xl font-bold">Command policies</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Overrides complement runtime Discord permission checks; they never bypass required bot or
          user permissions.
        </p>
        <div className="mt-6 divide-y">
          {overrides.length === 0 ? (
            <p className="py-5 text-sm text-[var(--muted)]">No overrides configured.</p>
          ) : (
            overrides.map((override) => (
              <div key={override.id} className="grid gap-2 py-4 text-sm sm:grid-cols-3">
                <code className="font-bold text-violet-600">/{override.commandName}</code>
                <span>
                  {override.subjectType.toLowerCase()} {override.subjectId}
                </span>
                <span className={override.deny.length > 0 ? 'text-red-500' : 'text-emerald-500'}>
                  {override.deny.length > 0 ? 'Denied' : 'Allowed'}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
      <Card>
        <h2 className="font-bold">Add role override</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Discord role IDs are stored as snowflake strings.
        </p>
        <ActionForm
          action={updateCommandOverrideAction}
          submitLabel="Save override"
          className="mt-6 grid gap-4"
        >
          <input type="hidden" name="guildId" value={guildId} />
          <input type="hidden" name="idempotencyKey" value={createId('mut')} />
          <label className="grid gap-2 text-sm font-medium">
            Command
            <select
              name="commandName"
              className="h-11 rounded-xl border bg-[var(--background)] px-3"
            >
              {builtInModules
                .flatMap((module) => module.commands)
                .map((command) => (
                  <option key={command.name} value={command.name}>
                    /{command.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Discord role ID
            <input
              name="roleId"
              pattern="\d{17,20}"
              required
              className="h-11 rounded-xl border bg-[var(--background)] px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Effect
            <select name="effect" className="h-11 rounded-xl border bg-[var(--background)] px-3">
              <option value="allow">Allow execute</option>
              <option value="deny">Deny execute</option>
            </select>
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
