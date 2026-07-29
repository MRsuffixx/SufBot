import { createId } from '@sufbot/shared';
import { builtInModules } from '@sufbot/discord';
import { Command, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { updateCommandOverrideAction } from '@/app/actions/guild';
import { ActionForm } from '@/components/action-form';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import {
  PageHeader,
  SettingsCard,
  SettingsSection,
} from '@/components/dashboard/page-primitives';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { prisma } from '@/lib/runtime';

const columns: readonly DataTableColumn[] = [
  { key: 'command', label: 'Command', sortable: true },
  { key: 'description', label: 'Description' },
  { key: 'module', label: 'Module', sortable: true },
  { key: 'state', label: 'State', sortable: true },
  { key: 'permissions', label: 'Permissions' },
  { key: 'cooldown', label: 'Cooldown', sortable: true },
  { key: 'usage', label: 'Usage', sortable: true },
  { key: 'lastUsed', label: 'Last used', sortable: true, hideOnMobile: true },
];

export default async function CommandAccessPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [overrides, moduleRecords, usages] = await Promise.all([
    prisma.guildCommandOverride.findMany({
      where: { guildId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.guildModule.findMany({ where: { guildId } }),
    prisma.commandUsage.groupBy({
      by: ['commandName'],
      where: { guildId },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);
  const moduleEnabled = new Map(moduleRecords.map((record) => [record.moduleKey, record.enabled]));
  const usageByCommand = new Map(usages.map((usage) => [usage.commandName, usage]));
  const overridesByCommand = new Map<string, number>();
  for (const override of overrides) {
    overridesByCommand.set(
      override.commandName,
      (overridesByCommand.get(override.commandName) ?? 0) + 1,
    );
  }
  const commands = builtInModules.flatMap((module) =>
    module.commands.map((command) => ({
      module,
      command,
      enabled:
        moduleEnabled.get(module.metadata.key) ??
        module.metadata.key === 'general',
    })),
  );
  return (
    <>
      <PageHeader
        eyebrow="Command management"
        title="Commands"
        description="Review command availability, permission requirements, cooldowns, usage, and role policies without bypassing runtime Discord checks."
        status={<Badge variant="neutral">{commands.length} commands</Badge>}
      />

      <SettingsCard className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          rows={commands.map(({ module, command, enabled }) => {
            const usage = usageByCommand.get(command.name);
            const policyCount = overridesByCommand.get(command.name) ?? 0;
            return {
              id: command.name,
              cells: {
                command: { value: `/${command.name}`, mono: true },
                description: { value: command.description },
                module: { value: module.metadata.name },
                state: {
                  value: enabled ? (command.premium?.required === true ? 'Premium' : 'Enabled') : 'Module disabled',
                  tone: enabled
                    ? command.premium?.required === true
                      ? 'premium'
                      : 'success'
                    : 'muted',
                },
                permissions: {
                  value: `${command.requiredUserPermissions.length} user · ${command.requiredBotPermissions.length} bot · ${policyCount} policies`,
                  tone: 'muted',
                },
                cooldown: {
                  value: `${command.cooldownSeconds}s`,
                  sortValue: command.cooldownSeconds,
                },
                usage: {
                  value: String(usage?._count._all ?? 0),
                  sortValue: usage?._count._all ?? 0,
                },
                lastUsed: {
                  value: usage?._max.createdAt?.toLocaleString() ?? 'Never',
                  sortValue: usage?._max.createdAt?.getTime() ?? 0,
                  tone: 'muted',
                },
              },
            };
          })}
          searchPlaceholder="Search command names, descriptions, or modules…"
          emptyTitle="No commands registered"
          emptyDescription="Built-in command metadata is unavailable."
          pageSize={20}
        />
      </SettingsCard>

      <SettingsSection
        title="Role policy"
        description="Add an explicit allow or deny policy. Required Discord permissions still apply."
        className="mt-2"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
          <SettingsCard>
            <ActionForm
              action={updateCommandOverrideAction}
              submitLabel="Save role policy"
              className="grid gap-4"
            >
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="idempotencyKey" value={createId('mut')} />
              <Field label="Command" htmlFor="policy-command">
                <Select id="policy-command" name="commandName">
                  {commands.map(({ command, module }) => (
                    <option key={command.name} value={command.name}>
                      /{command.name} · {module.metadata.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Discord role ID"
                htmlFor="policy-role"
                help="A Discord snowflake from this server. A searchable role selector will replace this compatibility field when live role metadata is available."
              >
                <Input id="policy-role" name="roleId" pattern="\d{17,20}" required />
              </Field>
              <Field label="Effect" htmlFor="policy-effect">
                <Select id="policy-effect" name="effect">
                  <option value="allow">Allow execute</option>
                  <option value="deny">Deny execute</option>
                </Select>
              </Field>
            </ActionForm>
          </SettingsCard>
          <SettingsCard className="bg-surface-secondary">
            <SlidersHorizontal size={18} className="text-primary" />
            <h3 className="mt-4 text-sm font-semibold">Policy precedence</h3>
            <p className="type-help mt-2">
              Deny policies take precedence over allow policies. Runtime user permissions, required
              bot permissions, guild-only constraints, premium entitlement, and cooldowns are
              evaluated independently.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">
                <Command size={11} /> {overrides.length} saved policies
              </Badge>
              <Badge variant="outline">
                <ShieldCheck size={11} /> Runtime checks preserved
              </Badge>
            </div>
          </SettingsCard>
        </div>
      </SettingsSection>
    </>
  );
}
