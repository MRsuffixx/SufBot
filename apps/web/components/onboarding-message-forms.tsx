import type { GoodbyeConfig, WelcomeConfig } from '@sufbot/onboarding';
import { updateGoodbyeConfigAction, updateWelcomeConfigAction } from '@/app/actions/onboarding';
import { ActionForm } from './action-form';

const controlClass =
  'mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm';
const checkboxClass = 'size-5 accent-violet-600';

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

function MessageMode({
  name,
  value,
}: {
  name: 'messageMode' | 'dmMessageMode';
  value: WelcomeConfig['message']['mode'];
}) {
  return (
    <label className="text-sm font-semibold">
      Message mode
      <select name={name} defaultValue={value} className={controlClass}>
        <option value="TEXT">Text</option>
        <option value="EMBED">Embed</option>
        <option value="TEXT_AND_EMBED">Text + embed</option>
      </select>
    </label>
  );
}

export function WelcomeMessageForm({
  guildId,
  version,
  idempotencyKey,
  config,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: WelcomeConfig;
}) {
  return (
    <ActionForm
      action={updateWelcomeConfigAction}
      submitLabel="Save welcome configuration"
      className="grid gap-5"
    >
      <HiddenFields guildId={guildId} version={version} idempotencyKey={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Discord channel ID
          <input
            name="channelId"
            defaultValue={config.channelId ?? ''}
            inputMode="numeric"
            pattern="\d{17,20}"
            placeholder="Sendable text channel ID"
            className={controlClass}
          />
        </label>
        <label className="text-sm font-semibold">
          Delivery
          <select name="delivery" defaultValue={config.delivery} className={controlClass}>
            <option value="ON_JOIN">On join</option>
            <option value="AFTER_VERIFICATION">After verification</option>
            <option value="BOTH">Both</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Delay (seconds)
          <input
            name="delaySeconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={config.delaySeconds}
            className={controlClass}
          />
        </label>
        <label className="text-sm font-semibold">
          Minimum account age (hours)
          <input
            name="minimumAccountAgeHours"
            type="number"
            min={0}
            max={87600}
            defaultValue={config.minimumAccountAgeHours}
            className={controlClass}
          />
        </label>
      </div>
      <MessageMode name="messageMode" value={config.message.mode} />
      <label className="text-sm font-semibold">
        Channel message
        <textarea
          name="messageContent"
          maxLength={2000}
          rows={5}
          defaultValue={config.message.content}
          className={controlClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="ignoreBots"
            defaultChecked={config.ignoreBots}
            className={checkboxClass}
          />
          Ignore bots
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="attachWelcomeCard"
            defaultChecked={config.attachWelcomeCard}
            className={checkboxClass}
          />
          Attach welcome card
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="dmEnabled"
            defaultChecked={config.dmEnabled}
            className={checkboxClass}
          />
          Send direct message
        </label>
      </div>
      <div className="grid gap-4 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          DM delivery
          <select name="dmDelivery" defaultValue={config.dmDelivery} className={controlClass}>
            <option value="ON_JOIN">On join</option>
            <option value="AFTER_VERIFICATION">After verification</option>
            <option value="BOTH">Both</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          DM delay (seconds)
          <input
            name="dmDelaySeconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={config.dmDelaySeconds}
            className={controlClass}
          />
        </label>
      </div>
      <MessageMode name="dmMessageMode" value={config.dmMessage.mode} />
      <label className="text-sm font-semibold">
        Direct message
        <textarea
          name="dmMessageContent"
          maxLength={2000}
          rows={5}
          defaultValue={config.dmMessage.content}
          className={controlClass}
        />
      </label>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Messages are rendered server-side. Unknown variables remain visible, mass mentions stay
        inert, and only the target member may be mentioned.
      </p>
    </ActionForm>
  );
}

export function GoodbyeMessageForm({
  guildId,
  version,
  idempotencyKey,
  config,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: GoodbyeConfig;
}) {
  return (
    <ActionForm
      action={updateGoodbyeConfigAction}
      submitLabel="Save goodbye configuration"
      className="grid gap-5"
    >
      <HiddenFields guildId={guildId} version={version} idempotencyKey={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Discord channel ID
          <input
            name="channelId"
            defaultValue={config.channelId ?? ''}
            inputMode="numeric"
            pattern="\d{17,20}"
            placeholder="Sendable text channel ID"
            className={controlClass}
          />
        </label>
        <label className="text-sm font-semibold">
          Delay (seconds)
          <input
            name="delaySeconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={config.delaySeconds}
            className={controlClass}
          />
        </label>
      </div>
      <MessageMode name="messageMode" value={config.message.mode} />
      <label className="text-sm font-semibold">
        Goodbye message
        <textarea
          name="messageContent"
          maxLength={2000}
          rows={5}
          defaultValue={config.message.content}
          className={controlClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="ignoreBots"
            defaultChecked={config.ignoreBots}
            className={checkboxClass}
          />
          Ignore bots
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="includeJoinDuration"
            defaultChecked={config.includeJoinDuration}
            className={checkboxClass}
          />
          Include join duration
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="includeLastKnownRoles"
            defaultChecked={config.includeLastKnownRoles}
            className={checkboxClass}
          />
          Include last roles
        </label>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Departure messages use a bounded last-known snapshot and never allow mass mentions.
      </p>
    </ActionForm>
  );
}
