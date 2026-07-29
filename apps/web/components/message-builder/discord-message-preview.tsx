'use client';

import { memo, useMemo } from 'react';
import { Bot, Download, FileText, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatHexColor,
  renderPreviewVariables,
  type MessageTemplate,
  type MessageAttachmentTemplate,
} from '@/lib/message-builder';

export type PreviewBackground = 'dark' | 'light' | 'transparent';
export type PreviewViewport = 'desktop' | 'compact' | 'mobile';

export const DiscordMessagePreview = memo(function DiscordMessagePreview({
  message,
  background,
  viewport,
  botName = 'SufBot',
  timestamp = 'Today at 21:45',
  attachments = [],
}: {
  message: MessageTemplate;
  background: PreviewBackground;
  viewport: PreviewViewport;
  botName?: string;
  timestamp?: string;
  attachments?: readonly MessageAttachmentTemplate[];
}) {
  const rendered = useMemo(
    () => ({
      content: renderPreviewVariables(message.content),
      authorName: renderPreviewVariables(message.embed.authorName),
      title: renderPreviewVariables(message.embed.title),
      description: renderPreviewVariables(message.embed.description),
      footerText: renderPreviewVariables(message.embed.footerText),
      fields: message.embed.fields.map((field) => ({
        ...field,
        name: renderPreviewVariables(field.name),
        value: renderPreviewVariables(field.value),
      })),
    }),
    [message],
  );
  const includeContent = message.mode === 'TEXT' || message.mode === 'TEXT_AND_EMBED';
  const includeEmbed = message.mode === 'EMBED' || message.mode === 'TEXT_AND_EMBED';
  const dark = background !== 'light';
  return (
    <div
      className={cn(
        'min-h-[460px] overflow-hidden p-4 transition-colors sm:p-5',
        background === 'dark' &&
          'bg-[var(--discord-preview-dark-bg)] text-[var(--discord-preview-dark-text)]',
        background === 'light' &&
          'bg-[var(--discord-preview-light-bg)] text-[var(--discord-preview-light-text)]',
        background === 'transparent' &&
          'bg-[linear-gradient(135deg,var(--surface-secondary),var(--surface-elevated))] text-foreground',
      )}
    >
      <div
        className={cn(
          'mx-auto transition-[max-width] duration-[var(--duration-normal)]',
          viewport === 'desktop' && 'max-w-2xl',
          viewport === 'compact' && 'max-w-lg',
          viewport === 'mobile' && 'max-w-[360px]',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-gradient)] text-white shadow-sm">
            <Bot size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span
                className={cn(
                  'text-sm font-semibold',
                  dark ? 'text-white' : 'text-[var(--discord-preview-light-strong)]',
                )}
              >
                {botName}
              </span>
              <span className="rounded-[3px] bg-discord px-1 py-px text-[9px] font-bold text-white">
                BOT
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  dark
                    ? 'text-[var(--discord-preview-dark-muted)]'
                    : 'text-[var(--discord-preview-light-muted)]',
                )}
              >
                {timestamp}
              </span>
            </div>

            {includeContent ? (
              <div className="mt-0.5 text-[14px] leading-[1.375rem] break-words whitespace-pre-wrap">
                <PreviewText value={rendered.content || 'Your normal message will appear here.'} />
              </div>
            ) : null}

            {includeEmbed ? (
              <div
                className={cn(
                  'relative mt-1 max-w-[520px] overflow-hidden rounded-[4px] border-l-4',
                  dark
                    ? 'bg-[var(--discord-preview-dark-surface)]'
                    : 'bg-[var(--discord-preview-light-surface)]',
                )}
                style={{ borderLeftColor: formatHexColor(message.embed.color) }}
              >
                <div
                  className={cn(
                    'grid gap-x-4 p-3.5',
                    message.embed.thumbnailUrl === null
                      ? 'grid-cols-1'
                      : 'grid-cols-[minmax(0,1fr)_80px]',
                  )}
                >
                  <div className="min-w-0">
                    {rendered.authorName === '' ? null : (
                      <div className="mb-2 flex items-center gap-2">
                        {message.embed.authorIconUrl === null ? null : (
                          <img
                            src={message.embed.authorIconUrl}
                            alt=""
                            className="size-6 rounded-full object-cover"
                          />
                        )}
                        <span
                          className={cn(
                            'truncate text-xs font-semibold',
                            dark
                              ? 'text-[var(--discord-preview-dark-strong)]'
                              : 'text-[var(--discord-preview-light-strong)]',
                          )}
                        >
                          {rendered.authorName}
                        </span>
                      </div>
                    )}
                    {rendered.title === '' ? null : message.embed.titleUrl === null ? (
                      <p
                        className={cn(
                          'mb-1.5 text-sm font-semibold',
                          dark
                            ? 'text-[var(--discord-preview-dark-strong)]'
                            : 'text-[var(--discord-preview-light-strong)]',
                        )}
                      >
                        <PreviewText value={rendered.title} />
                      </p>
                    ) : (
                      <a
                        href={message.embed.titleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-1.5 block text-sm font-semibold text-[var(--discord-preview-link)] hover:underline"
                      >
                        <PreviewText value={rendered.title} />
                      </a>
                    )}
                    {rendered.description === '' ? null : (
                      <div className="text-[13px] leading-[1.125rem] break-words whitespace-pre-wrap">
                        <PreviewText value={rendered.description} />
                      </div>
                    )}
                    {rendered.fields.length === 0 ? null : (
                      <div className="mt-3 grid grid-cols-12 gap-x-2 gap-y-2.5">
                        {rendered.fields.map((field, index) => (
                          <div
                            key={`${field.name}-${index}`}
                            className={field.inline ? 'col-span-4 min-w-0' : 'col-span-12 min-w-0'}
                          >
                            <p
                              className={cn(
                                'text-xs font-semibold break-words',
                                dark
                                  ? 'text-[var(--discord-preview-dark-strong)]'
                                  : 'text-[var(--discord-preview-light-strong)]',
                              )}
                            >
                              <PreviewText value={field.name || 'Field name'} />
                            </p>
                            <div className="mt-0.5 text-xs leading-[1.05rem] break-words whitespace-pre-wrap">
                              <PreviewText value={field.value || 'Field value'} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {message.embed.imageUrl === null ? null : (
                      <img
                        src={message.embed.imageUrl}
                        alt="Embed"
                        className="mt-3 max-h-80 max-w-full rounded-[4px] object-cover"
                      />
                    )}
                    {rendered.footerText === '' && !message.embed.timestamp ? null : (
                      <div
                        className={cn(
                          'mt-3 flex items-center gap-2 text-[10px]',
                          dark
                            ? 'text-[var(--discord-preview-dark-text)]'
                            : 'text-[var(--discord-preview-light-muted)]',
                        )}
                      >
                        {message.embed.footerIconUrl === null ? null : (
                          <img
                            src={message.embed.footerIconUrl}
                            alt=""
                            className="size-5 rounded-full object-cover"
                          />
                        )}
                        <span>
                          {[rendered.footerText, message.embed.timestamp ? timestamp : '']
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      </div>
                    )}
                  </div>
                  {message.embed.thumbnailUrl === null ? null : (
                    <img
                      src={message.embed.thumbnailUrl}
                      alt="Thumbnail"
                      className="size-20 rounded-[4px] object-cover"
                    />
                  )}
                </div>
              </div>
            ) : null}

            {attachments.length === 0 ? null : (
              <div className="mt-2 grid max-w-[520px] gap-1.5">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[4px] border p-2.5 text-xs',
                      dark
                        ? 'border-[var(--discord-preview-dark-border)] bg-[var(--discord-preview-dark-surface)]'
                        : 'border-[var(--discord-preview-light-border)] bg-[var(--discord-preview-light-surface)]',
                    )}
                  >
                    {attachment.kind.includes('IMAGE') || attachment.kind === 'WELCOME_CARD' ? (
                      <ImageIcon size={17} className="text-[var(--discord-preview-link)]" />
                    ) : (
                      <FileText size={17} className="text-[var(--discord-preview-link)]" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                    <Download size={15} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function PreviewText({ value }: { value: string }) {
  const parts = value.split(/(\*\*[^*]+\*\*|@[^\s,!.?]+|#[^\s,!.?]+)/gu);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('@') || part.startsWith('#')) {
      return (
        <span
          key={index}
          className="rounded-sm bg-discord/20 px-0.5 text-[var(--discord-preview-mention)]"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}
