import type { GoodbyeConfig, WelcomeConfig } from '@sufbot/onboarding';
import { ChevronDown, Clock3, Mail, Settings2 } from 'lucide-react';
import { updateGoodbyeConfigAction, updateWelcomeConfigAction } from '@/app/actions/onboarding';
import { MessageBuilder } from '@/components/message-builder/message-builder';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SettingsCard, SectionHeader } from '@/components/dashboard/page-primitives';
import { ActionForm } from './action-form';

function HiddenFields({
  guildId,
  version,
  idempotencyKey,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
}) {
  return (
    <>
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    </>
  );
}

export function WelcomeMessageForm({
  guildId,
  version,
  idempotencyKey,
  config,
  channels,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: WelcomeConfig;
  channels: readonly { id: string; name: string; canEmbed: boolean; canAttach: boolean }[];
}) {
  return (
    <ActionForm
      action={updateWelcomeConfigAction}
      submitLabel="Save welcome configuration"
      className="grid gap-5"
    >
      <HiddenFields guildId={guildId} version={version} idempotencyKey={idempotencyKey} />

      <SettingsCard>
        <SectionHeader
          title="Delivery settings"
          description="Choose where and when SufBot welcomes a new member."
          action={<Settings2 size={18} className="text-primary" />}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Discord channel" htmlFor="welcome-channel">
            <Select id="welcome-channel" name="channelId" defaultValue={config.channelId ?? ''}>
              <option value="">Not selected</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                  {!channel.canEmbed ? ' · no embeds' : ''}
                  {!channel.canAttach ? ' · no attachments' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delivery event" htmlFor="welcome-delivery">
            <Select id="welcome-delivery" name="delivery" defaultValue={config.delivery}>
              <option value="ON_JOIN">On join</option>
              <option value="AFTER_VERIFICATION">After verification</option>
              <option value="BOTH">Both events</option>
            </Select>
          </Field>
          <Field
            label="Delay"
            htmlFor="welcome-delay"
            help="Wait before sending, from 0 seconds to 24 hours."
          >
            <div className="relative">
              <Clock3
                size={15}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle-foreground"
              />
              <Input
                id="welcome-delay"
                name="delaySeconds"
                type="number"
                min={0}
                max={86400}
                defaultValue={config.delaySeconds}
                className="pl-9"
              />
            </div>
          </Field>
          <Field
            label="Minimum account age"
            htmlFor="welcome-account-age"
            help="Hours. Use 0 to allow every account."
          >
            <Input
              id="welcome-account-age"
              name="minimumAccountAgeHours"
              type="number"
              min={0}
              max={87600}
              defaultValue={config.minimumAccountAgeHours}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Switch
            name="ignoreBots"
            label="Ignore bot accounts"
            description="Do not send welcome messages for bots."
            defaultChecked={config.ignoreBots}
          />
          <Switch
            name="attachWelcomeCard"
            label="Attach welcome card"
            description="Include the configured generated welcome image."
            defaultChecked={config.attachWelcomeCard}
          />
          <Switch
            name="dmEnabled"
            label="Send direct message"
            description="Also welcome the member in a private message."
            defaultChecked={config.dmEnabled}
          />
        </div>
      </SettingsCard>

      <section>
        <div className="mb-3">
          <SectionHeader
            title="Channel message"
            description="Build the message sent in the selected Discord channel."
          />
        </div>
        <MessageBuilder
          id="welcome-channel-message"
          fieldPrefix="message"
          initialMessage={config.message}
          context="welcome"
        />
      </section>

      <details
        className="group rounded-lg border border-border bg-surface-elevated shadow-sm"
        open={config.dmEnabled}
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Mail size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Direct message</span>
            <span className="type-help block">
              Configure a separate private welcome message and delivery delay.
            </span>
          </span>
          <ChevronDown className="text-subtle-foreground transition-transform group-open:rotate-180" size={17} />
        </summary>
        <div className="border-t border-border p-4">
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <Field label="DM delivery event" htmlFor="welcome-dm-delivery">
              <Select
                id="welcome-dm-delivery"
                name="dmDelivery"
                defaultValue={config.dmDelivery}
              >
                <option value="ON_JOIN">On join</option>
                <option value="AFTER_VERIFICATION">After verification</option>
                <option value="BOTH">Both events</option>
              </Select>
            </Field>
            <Field label="DM delay" htmlFor="welcome-dm-delay" help="Seconds, up to 24 hours.">
              <Input
                id="welcome-dm-delay"
                name="dmDelaySeconds"
                type="number"
                min={0}
                max={86400}
                defaultValue={config.dmDelaySeconds}
              />
            </Field>
          </div>
          <MessageBuilder
            id="welcome-direct-message"
            fieldPrefix="dmMessage"
            initialMessage={config.dmMessage}
            context="welcome"
          />
        </div>
      </details>

      <p className="type-help">
        Messages render on the server. Unknown variables follow the selected policy, mass mentions
        remain inert, and only the target member can be mentioned.
      </p>
    </ActionForm>
  );
}

export function GoodbyeMessageForm({
  guildId,
  version,
  idempotencyKey,
  config,
  channels,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: GoodbyeConfig;
  channels: readonly { id: string; name: string; canEmbed: boolean }[];
}) {
  return (
    <ActionForm
      action={updateGoodbyeConfigAction}
      submitLabel="Save goodbye configuration"
      className="grid gap-5"
    >
      <HiddenFields guildId={guildId} version={version} idempotencyKey={idempotencyKey} />
      <SettingsCard>
        <SectionHeader
          title="Delivery settings"
          description="Send a bounded last-known member snapshot without unsafe mentions."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Discord channel" htmlFor="goodbye-channel">
            <Select id="goodbye-channel" name="channelId" defaultValue={config.channelId ?? ''}>
              <option value="">Not selected</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                  {!channel.canEmbed ? ' · no embeds' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delay" htmlFor="goodbye-delay" help="Seconds, up to 24 hours.">
            <Input
              id="goodbye-delay"
              name="delaySeconds"
              type="number"
              min={0}
              max={86400}
              defaultValue={config.delaySeconds}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Switch
            name="ignoreBots"
            label="Ignore bot accounts"
            description="Skip departure messages for bots."
            defaultChecked={config.ignoreBots}
          />
          <Switch
            name="includeJoinDuration"
            label="Include join duration"
            description="Make the duration available to templates."
            defaultChecked={config.includeJoinDuration}
          />
          <Switch
            name="includeLastKnownRoles"
            label="Include last roles"
            description="Use the bounded role snapshot."
            defaultChecked={config.includeLastKnownRoles}
          />
        </div>
      </SettingsCard>

      <section>
        <div className="mb-3">
          <SectionHeader
            title="Goodbye message"
            description="Build the message sent when a member leaves."
          />
        </div>
        <MessageBuilder
          id="goodbye-channel-message"
          fieldPrefix="message"
          initialMessage={config.message}
          context="goodbye"
        />
      </section>
      <p className="type-help">
        Departure messages use a bounded last-known snapshot and never allow mass mentions.
      </p>
    </ActionForm>
  );
}
