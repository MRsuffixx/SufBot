'use client';

import { AlertTriangle, CheckCircle2, Crown, Info, Sparkles } from 'lucide-react';
import type { OnboardingMessage } from '@sufbot/onboarding';
import { MessageBuilder } from '@/components/message-builder/message-builder';
import {
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  PermissionWarning,
  PremiumLock,
  SectionHeader,
  SkeletonCard,
  StatCard,
} from './page-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export function UiShowcase({ initialMessage }: { initialMessage: OnboardingMessage }) {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Development only"
        title="SufBot UI system"
        description="A live component and responsive-state showcase. This route returns 404 outside development."
        status={<Badge variant="info">Internal</Badge>}
      />

      <section>
        <SectionHeader title="Foundation" description="Buttons, badges, form controls, and cards." />
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          <Card>
            <h2 className="type-section-title">Actions and status</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="premium">
                <Crown size={15} /> Premium
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="success">Healthy</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Error</Badge>
              <Badge variant="info">Information</Badge>
              <Badge variant="premium">Premium</Badge>
              <Badge variant="discord">Discord</Badge>
            </div>
          </Card>
          <Card>
            <h2 className="type-section-title">Form controls</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Server name" htmlFor="showcase-name" help="A standard field with help.">
                <Input id="showcase-name" defaultValue="SufBot Community" />
              </Field>
              <Field label="Language" htmlFor="showcase-language">
                <Select id="showcase-language" defaultValue="en">
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </Select>
              </Field>
              <Field label="Description" htmlFor="showcase-description" className="sm:col-span-2">
                <Textarea id="showcase-description" defaultValue="A modular Discord community." />
              </Field>
              <Switch
                label="Module enabled"
                description="Switches provide a large accessible target."
                defaultChecked
                className="sm:col-span-2"
              />
            </div>
          </Card>
        </div>
      </section>

      <section className="mt-7">
        <SectionHeader title="Metrics and states" />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Enabled modules" value="8" icon={<Sparkles size={17} />} />
          <StatCard label="Permission health" value="100%" icon={<CheckCircle2 size={17} />} />
          <StatCard label="Warnings" value="2" icon={<AlertTriangle size={17} />} />
          <StatCard label="Plan" value="Premium" icon={<Crown size={17} />} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <EmptyState
            title="No audit events"
            description="New configuration events will appear here."
          />
          <ErrorState
            title="Discord unavailable"
            description="Configuration remains safe while live status is unavailable."
          />
          <SkeletonCard lines={4} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <PermissionWarning
            title="Bot permissions need attention"
            description="Administrator permission is missing for this server."
            actionHref="#"
            actionLabel="Fix permissions"
          />
          <PremiumLock
            title="Advanced analytics is locked"
            description="Upgrade this server to unlock 365-day analytics and custom reports."
            action={<Button variant="premium" size="sm">View Premium</Button>}
          />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader
          title="Reusable message builder"
          description="Resize the browser and switch light/dark/system theme to validate responsive behavior."
          action={
            <Badge variant="success">
              <Info size={11} /> Live preview
            </Badge>
          }
        />
        <form className="mt-3" onSubmit={(event) => event.preventDefault()}>
          <MessageBuilder
            id="showcase-message"
            fieldPrefix="message"
            initialMessage={{
              ...initialMessage,
              mode: 'TEXT_AND_EMBED',
              embed: {
                ...initialMessage.embed,
                title: 'Welcome, {user.displayName}',
                description:
                  'You are member **#{server.memberCount}** of {server.name}. Read the rules and enjoy your stay!',
                fields: [
                  { name: 'Get started', value: 'Visit #welcome and choose your roles.', inline: true },
                  { name: 'Need help?', value: 'Open a ticket and our team will help.', inline: true },
                ],
                footerText: 'SufBot Community',
                timestamp: true,
              },
            }}
            context="welcome"
          />
        </form>
      </section>
    </PageContainer>
  );
}
