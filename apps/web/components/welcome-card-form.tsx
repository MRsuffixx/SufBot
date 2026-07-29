import type { WelcomeCardConfig } from '@sufbot/onboarding';
import { updateWelcomeCardConfigAction } from '@/app/actions/onboarding';
import { ActionForm } from './action-form';

const control =
  'mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

export function WelcomeCardForm({
  guildId,
  version,
  idempotencyKey,
  config,
  customBackgroundLimit,
  tier,
}: {
  guildId: string;
  version: number;
  idempotencyKey: string;
  config: WelcomeCardConfig;
  customBackgroundLimit: number;
  tier: 'free' | 'premium';
}) {
  const textFields = [
    ['titleTemplate', 'Title', config.titleTemplate],
    ['subtitleTemplate', 'Subtitle', config.subtitleTemplate],
    ['bodyTemplate', 'Body', config.bodyTemplate],
    ['memberCountTemplate', 'Member count', config.memberCountTemplate],
  ] as const;
  return (
    <ActionForm
      action={updateWelcomeCardConfigAction}
      submitLabel="Save card design"
      className="grid gap-5"
    >
      <input type="hidden" name="guildId" value={guildId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div
        className="relative min-h-56 overflow-hidden rounded-2xl bg-cover bg-center p-8 text-white"
        style={{
          backgroundImage:
            config.backgroundUrl === null
              ? `linear-gradient(#0006,#0006),linear-gradient(135deg,${hex(config.accentColor)},#111827)`
              : `linear-gradient(#0008,#0008),url("${config.backgroundUrl}")`,
        }}
      >
        <p className="text-xs font-black tracking-[.35em]">{config.titleTemplate}</p>
        <p className="mt-5 text-4xl font-black">{config.subtitleTemplate}</p>
        <p className="mt-3">{config.bodyTemplate}</p>
        <p className="mt-5 text-sm">{config.memberCountTemplate}</p>
        <span className="absolute right-4 bottom-3 text-xs opacity-70">
          Safe preview · variables render when sent
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">
          Width
          <input
            className={control}
            type="number"
            name="width"
            min={640}
            max={1920}
            defaultValue={config.width}
          />
        </label>
        <label className="text-sm font-semibold">
          Height
          <input
            className={control}
            type="number"
            name="height"
            min={240}
            max={1080}
            defaultValue={config.height}
          />
        </label>
        <label className="text-sm font-semibold md:col-span-2">
          HTTPS background URL
          <input
            className={control}
            type="url"
            name="backgroundUrl"
            defaultValue={config.backgroundUrl ?? ''}
            placeholder="https://cdn.example.com/background.jpg"
            disabled={customBackgroundLimit === 0}
          />
          <span className="mt-1 block text-xs text-[var(--muted)]">
            {customBackgroundLimit === 0
              ? 'Custom backgrounds require Premium.'
              : `${tier === 'premium' ? 'Premium' : 'Free'} limit: ${customBackgroundLimit}.`}
          </span>
        </label>
        <label className="text-sm font-semibold">
          Background fit
          <select className={control} name="backgroundFit" defaultValue={config.backgroundFit}>
            <option value="COVER">Cover</option>
            <option value="CONTAIN">Contain</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Position
          <select
            className={control}
            name="backgroundPosition"
            defaultValue={config.backgroundPosition}
          >
            {['CENTER', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Overlay opacity
          <input
            className={control}
            type="number"
            name="overlayOpacity"
            min={0}
            max={0.9}
            step={0.05}
            defaultValue={config.overlayOpacity}
          />
        </label>
        <label className="text-sm font-semibold">
          Avatar size
          <input
            className={control}
            type="number"
            name="avatarSize"
            min={64}
            max={320}
            defaultValue={config.avatarSize}
          />
        </label>
        <label className="text-sm font-semibold">
          Avatar shape
          <select className={control} name="avatarShape" defaultValue={config.avatarShape}>
            <option value="CIRCLE">Circle</option>
            <option value="ROUNDED_SQUARE">Rounded square</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Border width
          <input
            className={control}
            type="number"
            name="avatarBorderWidth"
            min={0}
            max={20}
            defaultValue={config.avatarBorderWidth}
          />
        </label>
        <label className="text-sm font-semibold">
          Text color
          <input
            className={`${control} h-11`}
            type="color"
            name="textColor"
            defaultValue={hex(config.textColor)}
          />
        </label>
        <label className="text-sm font-semibold">
          Accent color
          <input
            className={`${control} h-11`}
            type="color"
            name="accentColor"
            defaultValue={hex(config.accentColor)}
          />
        </label>
        <label className="text-sm font-semibold">
          Avatar border color
          <input
            className={`${control} h-11`}
            type="color"
            name="avatarBorderColor"
            defaultValue={hex(config.avatarBorderColor)}
          />
        </label>
        <label className="text-sm font-semibold">
          Font
          <select className={control} name="font" defaultValue={config.font}>
            <option value="SANS">Sans</option>
            <option value="SERIF">Serif</option>
            <option value="MONO">Mono</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Alignment
          <select className={control} name="textAlignment" defaultValue={config.textAlignment}>
            <option value="LEFT">Left</option>
            <option value="CENTER">Center</option>
            <option value="RIGHT">Right</option>
          </select>
        </label>
        {textFields.map(([name, label, value]) => (
          <label className="text-sm font-semibold md:col-span-2" key={name}>
            {label}
            <input className={control} name={name} defaultValue={value} />
          </label>
        ))}
        <label className="text-sm font-semibold">
          Format
          <select className={control} name="format" defaultValue={config.format}>
            <option value="PNG">PNG</option>
            <option value="JPEG">JPEG</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Quality
          <input
            className={control}
            type="number"
            name="quality"
            min={50}
            max={95}
            defaultValue={config.quality}
          />
        </label>
      </div>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          name="showServerIcon"
          defaultChecked={config.showServerIcon}
          className="size-5 accent-violet-600"
        />
        Show server icon
      </label>
      <p className="text-xs leading-5 text-[var(--muted)]">
        The worker enforces HTTPS, public-IP DNS, redirect, content-type, byte-size, and decoded
        dimension limits. Message delivery falls back safely when a card cannot be rendered.
      </p>
    </ActionForm>
  );
}
