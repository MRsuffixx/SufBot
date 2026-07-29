'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  AtSign,
  Bold,
  Braces,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  GripVertical,
  ImageIcon,
  Italic,
  Link2,
  ListPlus,
  MessageSquareText,
  Monitor,
  Plus,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Underline,
  UserRound,
} from 'lucide-react';
import type { OnboardingMessage } from '@sufbot/onboarding';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldHelp } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  BuilderToolbar,
  PreviewPane,
  SplitPane,
} from '@/components/dashboard/page-primitives';
import { useDashboardI18n } from '@/components/dashboard/dashboard-i18n';
import { useUnsavedChanges } from '@/components/dashboard/unsaved-changes';
import {
  cloneMessageTemplate,
  embedCharacterCount,
  formatHexColor,
  insertVariableAtSelection,
  moveEmbedField,
  parseHexColor,
  validateBuilderMessage,
  type EmbedFieldTemplate,
  type MessageAttachmentTemplate,
  type MessageTemplate,
  type TemplateVariable,
} from '@/lib/message-builder';
import { cn } from '@/lib/utils';
import { AssetPicker } from './asset-picker';
import {
  DiscordMessagePreview,
  type PreviewBackground,
  type PreviewViewport,
} from './discord-message-preview';
import { VariablePicker } from './variable-picker';

type EditablePath = 'content' | 'authorName' | 'title' | 'description' | 'footerText';
type EditableElement = HTMLInputElement | HTMLTextAreaElement;

const colorPresets = [
  '#6d5dfc',
  '#5865f2',
  '#168b62',
  '#2174b8',
  '#ad6500',
  '#c3384d',
  '#a36215',
  '#5e6475',
] as const;

const emptyField = (): EmbedFieldTemplate => ({
  name: '',
  value: '',
  inline: false,
});

export function MessageBuilder({
  id,
  fieldPrefix,
  initialMessage,
  context = 'welcome',
  serverThemeColor,
  attachments = [],
}: {
  id: string;
  fieldPrefix: 'message' | 'dmMessage' | string;
  initialMessage: OnboardingMessage;
  context?: 'welcome' | 'goodbye' | 'verification' | 'ticket' | 'moderation';
  serverThemeColor?: number;
  attachments?: readonly MessageAttachmentTemplate[];
}) {
  const { t } = useDashboardI18n();
  const { markDirty, setValid } = useUnsavedChanges();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef(new Map<EditablePath, EditableElement>());
  const selectionRef = useRef<{
    path: EditablePath;
    start: number | null;
    end: number | null;
  }>({ path: 'content', start: null, end: null });
  const initialRef = useRef(cloneMessageTemplate(initialMessage));
  const [message, setMessage] = useState<MessageTemplate>(() =>
    cloneMessageTemplate(initialMessage),
  );
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('dark');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const validation = useMemo(() => validateBuilderMessage(message), [message]);

  useEffect(() => {
    try {
      const variables = JSON.parse(
        window.localStorage.getItem('sufbot-recent-variables') ?? '[]',
      ) as unknown;
      const colors = JSON.parse(window.localStorage.getItem('sufbot-recent-colors') ?? '[]') as unknown;
      if (Array.isArray(variables)) {
        setRecentlyUsed(variables.filter((item): item is string => typeof item === 'string').slice(0, 6));
      }
      if (Array.isArray(colors)) {
        setRecentColors(colors.filter((item): item is string => typeof item === 'string').slice(0, 6));
      }
    } catch {
      // Corrupt device-local preferences are ignored.
    }
  }, []);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (form === null || form === undefined) return;
    setValid(form, validation.valid && form.checkValidity());
  }, [setValid, validation.valid]);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (form === null || form === undefined) return;
    const reset = () => setMessage(cloneMessageTemplate(initialRef.current));
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, []);

  const commit = useCallback(
    (update: (current: MessageTemplate) => MessageTemplate) => {
      setMessage((current) => update(current));
      const form = rootRef.current?.closest('form');
      if (form !== null && form !== undefined) markDirty(form);
    },
    [markDirty],
  );

  const setEditableValue = useCallback(
    (path: EditablePath, value: string) => {
      commit((current) => {
        if (path === 'content') return { ...current, content: value };
        return { ...current, embed: { ...current.embed, [path]: value } };
      });
    },
    [commit],
  );

  const editableValue = (path: EditablePath): string =>
    path === 'content' ? message.content : message.embed[path];

  const captureSelection = (path: EditablePath, element: EditableElement) => {
    selectionRef.current = {
      path,
      start: element.selectionStart,
      end: element.selectionEnd,
    };
  };

  const insertVariable = (variable: TemplateVariable) => {
    const selection = selectionRef.current;
    const result = insertVariableAtSelection(
      editableValue(selection.path),
      variable.token,
      selection.start,
      selection.end,
    );
    setEditableValue(selection.path, result.value);
    const nextRecent = [
      variable.token,
      ...recentlyUsed.filter((item) => item !== variable.token),
    ].slice(0, 6);
    setRecentlyUsed(nextRecent);
    window.localStorage.setItem('sufbot-recent-variables', JSON.stringify(nextRecent));
    setVariablePickerOpen(false);
    requestAnimationFrame(() => {
      const element = inputRefs.current.get(selection.path);
      element?.focus();
      element?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const applyFormatting = (prefix: string, suffix = prefix) => {
    const selection = selectionRef.current;
    const currentValue = editableValue(selection.path);
    const start = selection.start ?? currentValue.length;
    const end = selection.end ?? start;
    const selectedText = currentValue.slice(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;
    const result = insertVariableAtSelection(currentValue, replacement, start, end);
    setEditableValue(selection.path, result.value);
    requestAnimationFrame(() => {
      const element = inputRefs.current.get(selection.path);
      element?.focus();
      element?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const updateColor = (value: string) => {
    const color = parseHexColor(value, message.embed.color);
    commit((current) => ({ ...current, embed: { ...current.embed, color } }));
    const formatted = formatHexColor(color);
    const nextRecent = [formatted, ...recentColors.filter((item) => item !== formatted)].slice(0, 6);
    setRecentColors(nextRecent);
    window.localStorage.setItem('sufbot-recent-colors', JSON.stringify(nextRecent));
  };

  const setField = (index: number, update: Partial<EmbedFieldTemplate>) => {
    commit((current) => ({
      ...current,
      embed: {
        ...current.embed,
        fields: current.embed.fields.map((field, fieldIndex) =>
          fieldIndex === index ? { ...field, ...update } : field,
        ),
      },
    }));
  };

  const moveField = (from: number, to: number) => {
    commit((current) => ({
      ...current,
      embed: {
        ...current.embed,
        fields: moveEmbedField(current.embed.fields, from, to),
      },
    }));
  };

  const removeField = (index: number) => {
    commit((current) => ({
      ...current,
      embed: {
        ...current.embed,
        fields: current.embed.fields.filter((_, fieldIndex) => fieldIndex !== index),
      },
    }));
  };

  const registerEditable = (path: EditablePath) => (element: EditableElement | null) => {
    if (element === null) inputRefs.current.delete(path);
    else inputRefs.current.set(path, element);
  };
  const selectionHandlers = (path: EditablePath) => ({
    onFocus: (event: React.FocusEvent<EditableElement>) =>
      captureSelection(path, event.currentTarget),
    onSelect: (event: React.SyntheticEvent<EditableElement>) =>
      captureSelection(path, event.currentTarget),
    onKeyUp: (event: React.KeyboardEvent<EditableElement>) =>
      captureSelection(path, event.currentTarget),
    onClick: (event: React.MouseEvent<EditableElement>) =>
      captureSelection(path, event.currentTarget),
  });

  const includesText = message.mode === 'TEXT' || message.mode === 'TEXT_AND_EMBED';
  const includesEmbed = message.mode === 'EMBED' || message.mode === 'TEXT_AND_EMBED';

  return (
    <div ref={rootRef} className="min-w-0">
      <input type="hidden" name={`${fieldPrefix}Mode`} value={message.mode} />
      <input type="hidden" name={`${fieldPrefix}Content`} value={message.content} />
      <input type="hidden" name={`${fieldPrefix}Embed`} value={JSON.stringify(message.embed)} />
      <input
        type="hidden"
        name={`${fieldPrefix}MentionUser`}
        value={String(message.allowedMentions.mentionUser)}
      />
      <input
        type="hidden"
        name={`${fieldPrefix}UnknownVariablePolicy`}
        value={message.unknownVariablePolicy}
      />
      <input
        type="hidden"
        name={`${fieldPrefix}DeleteAfterSeconds`}
        value={String(message.deleteAfterSeconds)}
      />

      <div className="mb-4 xl:hidden">
        <SegmentedControl
          label="Builder view"
          value={mobileView}
          options={[
            { value: 'editor', label: t('builder.editor') },
            { value: 'preview', label: t('builder.preview') },
          ]}
          onChange={setMobileView}
        />
      </div>

      <SplitPane
        editor={
          <div className={cn('grid gap-3', mobileView === 'preview' && 'hidden xl:grid')}>
            <div className="rounded-lg border border-border bg-surface-elevated p-3 shadow-sm">
              <SegmentedControl
                label="Message mode"
                value={message.mode}
                options={[
                  {
                    value: 'TEXT',
                    label: t('builder.normal'),
                    description: 'Send normal Discord message content.',
                  },
                  {
                    value: 'EMBED',
                    label: t('builder.embed'),
                    description: 'Send a structured Discord embed.',
                  },
                  {
                    value: 'TEXT_AND_EMBED',
                    label: t('builder.both'),
                    description: 'Send normal content and an embed together.',
                  },
                ]}
                onChange={(mode) => commit((current) => ({ ...current, mode }))}
              />
            </div>

            {!validation.valid ? (
              <div
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger-surface p-3 text-danger"
              >
                <p className="text-sm font-semibold">Review the message before saving</p>
                <ul className="mt-2 grid gap-1 text-xs">
                  {validation.issues.map((issue) => (
                    <li key={`${issue.path}-${issue.message}`}>• {issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <EditorSection
              icon={<MessageSquareText size={17} />}
              title={t('builder.message')}
              summary={
                includesText
                  ? `${message.content.length}/2,000 characters`
                  : 'Normal content is not included'
              }
              defaultOpen
            >
              {includesText ? (
                <Field
                  label="Normal message content"
                  htmlFor={`${id}-content`}
                  help="Discord Markdown and template variables are supported."
                  counter={`${message.content.length} / 2,000`}
                  {...(() => {
                    const error = validation.issues.find(
                      (issue) => issue.path === 'content',
                    )?.message;
                    return error === undefined ? {} : { error };
                  })()}
                >
                  <div className="overflow-hidden rounded-md border border-border bg-surface-elevated focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <FormattingToolbar
                      onFormat={applyFormatting}
                      onVariables={() => setVariablePickerOpen(true)}
                    />
                    <Textarea
                      ref={registerEditable('content')}
                      id={`${id}-content`}
                      value={message.content}
                      maxLength={2000}
                      rows={5}
                      className="rounded-none border-0 shadow-none focus:ring-0"
                      aria-describedby={`${id}-content-help`}
                      onChange={(event) => setEditableValue('content', event.target.value)}
                      {...selectionHandlers('content')}
                    />
                  </div>
                </Field>
              ) : (
                <FieldHelp>
                  Select Normal message or Message + embed to add content above the embed.
                </FieldHelp>
              )}
              <div className="flex items-start gap-2 rounded-md bg-info-surface p-2.5 text-info">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                <p className="text-xs leading-5">{t('builder.mentionWarning')}</p>
              </div>
            </EditorSection>

            {includesEmbed ? (
              <>
                <EditorSection
                  icon={<UserRound size={17} />}
                  title={t('builder.author')}
                  summary={
                    message.embed.authorName === ''
                      ? t('builder.notConfigured')
                      : message.embed.authorName
                  }
                >
                  <Switch
                    label="Show embed author"
                    description="Display a name and optional avatar above the embed title."
                    checked={message.embed.authorName !== ''}
                    onChange={(event) =>
                      commit((current) => ({
                        ...current,
                        embed: {
                          ...current.embed,
                          authorName: event.target.checked
                            ? current.embed.authorName || 'SufBot'
                            : '',
                        },
                      }))
                    }
                  />
                  {message.embed.authorName === '' ? null : (
                    <div className="grid gap-4">
                      <Field
                        label="Author name"
                        htmlFor={`${id}-author-name`}
                        counter={`${message.embed.authorName.length} / 256`}
                      >
                        <div className="flex gap-2">
                          <Input
                            ref={registerEditable('authorName')}
                            id={`${id}-author-name`}
                            value={message.embed.authorName}
                            maxLength={256}
                            onChange={(event) =>
                              setEditableValue('authorName', event.target.value)
                            }
                            {...selectionHandlers('authorName')}
                          />
                          <VariableButton onClick={() => setVariablePickerOpen(true)} />
                        </div>
                      </Field>
                      <Field label="Author link" htmlFor={`${id}-author-link`} optional="optional">
                        <Input
                          id={`${id}-author-link`}
                          type="url"
                          value={message.embed.authorUrl ?? ''}
                          placeholder="https://example.com"
                          onChange={(event) =>
                            commit((current) => ({
                              ...current,
                              embed: {
                                ...current.embed,
                                authorUrl: event.target.value === '' ? null : event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                      <AssetPicker
                        id={`${id}-author-icon`}
                        label="Author icon"
                        value={message.embed.authorIconUrl}
                        recommendedAspectRatio="1:1"
                        onChange={(authorIconUrl) =>
                          commit((current) => ({
                            ...current,
                            embed: { ...current.embed, authorIconUrl },
                          }))
                        }
                      />
                    </div>
                  )}
                </EditorSection>

                <EditorSection
                  icon={<AlignLeft size={17} />}
                  title={t('builder.titleDescription')}
                  summary={`${validation.totalEmbedCharacters}/6,000 embed characters`}
                  defaultOpen
                >
                  <div className="grid gap-4">
                    <Field label="Embed color" htmlFor={`${id}-color`} help="Used as the embed accent bar.">
                      <div className="flex gap-2">
                        <input
                          id={`${id}-color-picker`}
                          type="color"
                          value={formatHexColor(message.embed.color)}
                          className="h-[var(--control-height)] w-12 cursor-pointer rounded-md border border-border bg-surface-elevated p-1"
                          aria-label="Choose embed color"
                          onChange={(event) => updateColor(event.target.value)}
                        />
                        <Input
                          id={`${id}-color`}
                          value={formatHexColor(message.embed.color)}
                          pattern="#?[0-9a-fA-F]{6}"
                          className="font-mono uppercase"
                          onChange={(event) => updateColor(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Reset color"
                          onClick={() => updateColor('#6d5dfc')}
                        >
                          <RotateCcw size={15} />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[...colorPresets, ...recentColors, ...(serverThemeColor === undefined ? [] : [formatHexColor(serverThemeColor)])]
                          .filter((color, index, all) => all.indexOf(color) === index)
                          .map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={cn(
                                'size-7 rounded-full border-2 border-surface-elevated shadow-[0_0_0_1px_var(--border)] transition-transform hover:scale-110',
                                formatHexColor(message.embed.color) === color &&
                                  'ring-2 ring-primary ring-offset-2 ring-offset-surface-elevated',
                              )}
                              style={{ backgroundColor: color }}
                              aria-label={`Use color ${color}`}
                              onClick={() => updateColor(color)}
                            />
                          ))}
                      </div>
                    </Field>

                    <Field
                      label="Title"
                      htmlFor={`${id}-title`}
                      optional={t('common.optional')}
                      counter={`${message.embed.title.length} / 256`}
                    >
                      <div className="flex gap-2">
                        <Input
                          ref={registerEditable('title')}
                          id={`${id}-title`}
                          value={message.embed.title}
                          maxLength={256}
                          onChange={(event) => setEditableValue('title', event.target.value)}
                          {...selectionHandlers('title')}
                        />
                        <VariableButton onClick={() => setVariablePickerOpen(true)} />
                      </div>
                    </Field>
                    <Field label="Title link" htmlFor={`${id}-title-link`} optional="optional">
                      <Input
                        id={`${id}-title-link`}
                        type="url"
                        value={message.embed.titleUrl ?? ''}
                        placeholder="https://example.com"
                        onChange={(event) =>
                          commit((current) => ({
                            ...current,
                            embed: {
                              ...current.embed,
                              titleUrl: event.target.value === '' ? null : event.target.value,
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label="Description"
                      htmlFor={`${id}-description`}
                      optional={t('common.optional')}
                      counter={`${message.embed.description.length} / 4,096`}
                    >
                      <div className="overflow-hidden rounded-md border border-border bg-surface-elevated focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                        <FormattingToolbar
                          onFormat={applyFormatting}
                          onVariables={() => setVariablePickerOpen(true)}
                        />
                        <Textarea
                          ref={registerEditable('description')}
                          id={`${id}-description`}
                          value={message.embed.description}
                          maxLength={4096}
                          rows={9}
                          className="min-h-52 rounded-none border-0 shadow-none focus:ring-0"
                          onChange={(event) =>
                            setEditableValue('description', event.target.value)
                          }
                          {...selectionHandlers('description')}
                        />
                      </div>
                    </Field>
                  </div>
                </EditorSection>

                <EditorSection
                  icon={<ImageIcon size={17} />}
                  title={t('builder.media')}
                  summary={
                    message.embed.thumbnailUrl !== null || message.embed.imageUrl !== null
                      ? 'Image added'
                      : t('builder.noMedia')
                  }
                >
                  <AssetPicker
                    id={`${id}-thumbnail`}
                    label="Thumbnail"
                    value={message.embed.thumbnailUrl}
                    recommendedAspectRatio="1:1"
                    onChange={(thumbnailUrl) =>
                      commit((current) => ({
                        ...current,
                        embed: { ...current.embed, thumbnailUrl },
                      }))
                    }
                  />
                  <AssetPicker
                    id={`${id}-image`}
                    label="Main image"
                    value={message.embed.imageUrl}
                    recommendedAspectRatio="16:9"
                    onChange={(imageUrl) =>
                      commit((current) => ({
                        ...current,
                        embed: { ...current.embed, imageUrl },
                      }))
                    }
                  />
                </EditorSection>

                <EditorSection
                  icon={<ListPlus size={17} />}
                  title={t('builder.fields')}
                  summary={`${message.embed.fields.length}/25 fields`}
                  defaultOpen={message.embed.fields.length > 0}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="type-help">
                      Drag fields or use the arrow buttons for keyboard reordering.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={message.embed.fields.length >= 25}
                      onClick={() =>
                        commit((current) => ({
                          ...current,
                          embed: {
                            ...current.embed,
                            fields: [...current.embed.fields, emptyField()],
                          },
                        }))
                      }
                    >
                      <Plus size={14} /> {t('builder.addField')}
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {message.embed.fields.map((field, index) => (
                      <EmbedFieldEditor
                        key={index}
                        id={`${id}-field-${index}`}
                        index={index}
                        field={field}
                        count={message.embed.fields.length}
                        onChange={(update) => setField(index, update)}
                        onMove={(to) => moveField(index, to)}
                        onDuplicate={() =>
                          commit((current) => ({
                            ...current,
                            embed: {
                              ...current.embed,
                              fields: [
                                ...current.embed.fields.slice(0, index + 1),
                                { ...field },
                                ...current.embed.fields.slice(index + 1),
                              ].slice(0, 25),
                            },
                          }))
                        }
                        onRemove={() => removeField(index)}
                        onDrop={(from) => moveField(from, index)}
                      />
                    ))}
                    {message.embed.fields.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border-strong p-6 text-center">
                        <p className="text-sm font-semibold">No embed fields</p>
                        <p className="type-help mt-1">
                          Fields are structured name and value pairs, not subtitles.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </EditorSection>

                <EditorSection
                  icon={<Sparkles size={17} />}
                  title={t('builder.footer')}
                  summary={
                    message.embed.footerText === '' && !message.embed.timestamp
                      ? t('builder.noFooter')
                      : t('builder.configured')
                  }
                >
                  <Field
                    label="Footer text"
                    htmlFor={`${id}-footer`}
                    optional={t('common.optional')}
                    counter={`${message.embed.footerText.length} / 2,048`}
                  >
                    <div className="flex gap-2">
                      <Input
                        ref={registerEditable('footerText')}
                        id={`${id}-footer`}
                        value={message.embed.footerText}
                        maxLength={2048}
                        onChange={(event) => setEditableValue('footerText', event.target.value)}
                        {...selectionHandlers('footerText')}
                      />
                      <VariableButton onClick={() => setVariablePickerOpen(true)} />
                    </div>
                  </Field>
                  <AssetPicker
                    id={`${id}-footer-icon`}
                    label="Footer icon"
                    value={message.embed.footerIconUrl}
                    recommendedAspectRatio="1:1"
                    onChange={(footerIconUrl) =>
                      commit((current) => ({
                        ...current,
                        embed: { ...current.embed, footerIconUrl },
                      }))
                    }
                  />
                  <Switch
                    label="Show timestamp"
                    description="Use the time Discord receives the message."
                    checked={message.embed.timestamp}
                    onChange={(event) =>
                      commit((current) => ({
                        ...current,
                        embed: { ...current.embed, timestamp: event.target.checked },
                      }))
                    }
                  />
                </EditorSection>
              </>
            ) : null}

            <EditorSection
              icon={<AtSign size={17} />}
              title={t('builder.mentions')}
              summary={t('builder.safeMentions')}
            >
              <Switch
                label="Mention the current user"
                description={`Available in ${context} messages when a target member exists.`}
                checked={message.allowedMentions.mentionUser}
                onChange={(event) =>
                  commit((current) => ({
                    ...current,
                    allowedMentions: {
                      ...current.allowedMentions,
                      mentionUser: event.target.checked,
                    },
                  }))
                }
              />
              <Switch
                label="Allow role mentions"
                description="Disabled by the current safe onboarding contract."
                checked={false}
                disabled
                readOnly
              />
              <Switch
                label="Suppress @everyone and @here"
                description="Always enabled to prevent accidental mass mentions."
                checked
                disabled
                readOnly
              />
            </EditorSection>

            <EditorSection
              icon={<CircleHelp size={17} />}
              title={t('builder.advanced')}
              summary={`Delete after ${message.deleteAfterSeconds === 0 ? 'never' : `${message.deleteAfterSeconds}s`}`}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Unknown variables"
                  htmlFor={`${id}-unknown-variables`}
                  help="Choose what happens when a module cannot resolve a variable."
                >
                  <Select
                    id={`${id}-unknown-variables`}
                    value={message.unknownVariablePolicy}
                    onChange={(event) =>
                      commit((current) => ({
                        ...current,
                        unknownVariablePolicy: event.target.value as 'PRESERVE' | 'EMPTY',
                      }))
                    }
                  >
                    <option value="PRESERVE">Keep the variable visible</option>
                    <option value="EMPTY">Replace with empty text</option>
                  </Select>
                </Field>
                <Field
                  label="Delete after"
                  htmlFor={`${id}-delete-after`}
                  help="0 keeps the message. Maximum 7 days."
                >
                  <div className="relative">
                    <Input
                      id={`${id}-delete-after`}
                      type="number"
                      min={0}
                      max={604800}
                      value={message.deleteAfterSeconds}
                      className="pr-14"
                      onChange={(event) =>
                        commit((current) => ({
                          ...current,
                          deleteAfterSeconds: Number(event.target.value),
                        }))
                      }
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle-foreground">
                      sec
                    </span>
                  </div>
                </Field>
              </div>
              <div className="rounded-lg border border-dashed border-border-strong bg-surface-secondary/55 p-3">
                <div className="flex items-center gap-2">
                  <Redo2 size={16} className="text-primary" />
                  <p className="text-sm font-semibold">{t('builder.attachmentReady')}</p>
                </div>
                <p className="type-help mt-1.5">
                  The reusable draft type supports welcome cards, generated images, uploads,
                  transcripts, and reports. Only attachments backed by existing secure services are
                  sent.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Welcome card', 'Generated image', 'Uploaded image', 'Transcript', 'Report'].map(
                    (item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ),
                  )}
                </div>
              </div>
            </EditorSection>
          </div>
        }
        preview={
          <PreviewPane className={cn(mobileView === 'editor' && 'hidden xl:block')}>
            <BuilderToolbar>
              <p className="mr-auto flex items-center gap-2 text-xs font-semibold">
                <span className="size-2 rounded-full bg-success" />
                {t('builder.preview')}
              </p>
              <PreviewButton
                active={previewViewport === 'desktop'}
                label={t('builder.previewDesktop')}
                onClick={() => setPreviewViewport('desktop')}
              >
                <Monitor size={14} />
              </PreviewButton>
              <PreviewButton
                active={previewViewport === 'compact'}
                label={t('builder.previewCompact')}
                onClick={() => setPreviewViewport('compact')}
              >
                <AlignLeft size={14} />
              </PreviewButton>
              <PreviewButton
                active={previewViewport === 'mobile'}
                label={t('builder.previewMobile')}
                onClick={() => setPreviewViewport('mobile')}
              >
                <Smartphone size={14} />
              </PreviewButton>
            </BuilderToolbar>
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              {(['dark', 'light', 'transparent'] as const).map((background) => (
                <button
                  key={background}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize',
                    previewBackground === background
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground',
                  )}
                  onClick={() => setPreviewBackground(background)}
                >
                  {background === 'dark'
                    ? t('builder.previewDark')
                    : background === 'light'
                      ? t('builder.previewLight')
                      : t('builder.previewTransparent')}
                </button>
              ))}
              <span className="ml-auto type-help">
                {embedCharacterCount(message.embed).toLocaleString()} / 6,000
              </span>
            </div>
            <DiscordMessagePreview
              message={message}
              background={previewBackground}
              viewport={previewViewport}
              attachments={attachments}
            />
          </PreviewPane>
        }
      />

      <VariablePicker
        open={variablePickerOpen}
        recentlyUsed={recentlyUsed}
        onInsert={insertVariable}
        onClose={() => setVariablePickerOpen(false)}
      />
    </div>
  );
}

function EditorSection({
  icon,
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-lg border border-border bg-surface-elevated shadow-xs open:shadow-sm"
      open={defaultOpen}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-primary">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="type-help block truncate">{summary}</span>
        </span>
        <ChevronDown
          size={16}
          className="text-subtle-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-4 border-t border-border p-4">{children}</div>
    </details>
  );
}

function FormattingToolbar({
  onFormat,
  onVariables,
}: {
  onFormat: (prefix: string, suffix?: string) => void;
  onVariables: () => void;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-0.5 border-b border-border bg-surface-secondary px-2 py-1">
      <ToolbarButton label="Bold" onClick={() => onFormat('**')}>
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton label="Italic" onClick={() => onFormat('*')}>
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton label="Underline" onClick={() => onFormat('__')}>
        <Underline size={14} />
      </ToolbarButton>
      <ToolbarButton label="Inline code" onClick={() => onFormat('`')}>
        <Code2 size={14} />
      </ToolbarButton>
      <ToolbarButton label="Link" onClick={() => onFormat('[', '](https://)')}>
        <Link2 size={14} />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-semibold text-primary hover:bg-primary/10"
        onClick={onVariables}
      >
        <Braces size={14} /> Variables
      </button>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function VariableButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      aria-label="Insert variable"
      title="Insert variable"
      onClick={onClick}
    >
      <Braces size={15} />
    </Button>
  );
}

function PreviewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'grid size-7 place-items-center rounded text-muted-foreground',
        active ? 'bg-surface-elevated text-primary shadow-xs' : 'hover:bg-surface-muted',
      )}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EmbedFieldEditor({
  id,
  index,
  field,
  count,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onDrop,
}: {
  id: string;
  index: number;
  field: EmbedFieldTemplate;
  count: number;
  onChange: (update: Partial<EmbedFieldTemplate>) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDrop: (from: number) => void;
}) {
  const dragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };
  return (
    <div
      draggable
      onDragStart={dragStart}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from)) onDrop(from);
      }}
      className="rounded-lg border border-border bg-surface-secondary/55 p-3"
    >
      <div className="mb-3 flex items-center gap-2">
        <GripVertical
          size={16}
          className="cursor-grab text-subtle-foreground"
          aria-label={`Drag field ${index + 1}`}
        />
        <p className="text-xs font-semibold">Field {index + 1}</p>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton label="Move up" onClick={() => onMove(index - 1)}>
            <ArrowUp size={14} />
          </ToolbarButton>
          <ToolbarButton label="Move down" onClick={() => onMove(index + 1)}>
            <ArrowDown size={14} />
          </ToolbarButton>
          <ToolbarButton label="Duplicate field" onClick={onDuplicate}>
            <Copy size={14} />
          </ToolbarButton>
          <ToolbarButton label="Delete field" onClick={onRemove}>
            <Trash2 size={14} />
          </ToolbarButton>
        </div>
      </div>
      <div className="grid gap-3">
        <Field label="Name" htmlFor={`${id}-name`} counter={`${field.name.length} / 256`}>
          <Input
            id={`${id}-name`}
            value={field.name}
            maxLength={256}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="Value" htmlFor={`${id}-value`} counter={`${field.value.length} / 1,024`}>
          <Textarea
            id={`${id}-value`}
            value={field.value}
            maxLength={1024}
            rows={3}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </Field>
        <Switch
          label="Inline field"
          description="Up to three inline fields can share a row in Discord."
          checked={field.inline}
          onChange={(event) => onChange({ inline: event.target.checked })}
        />
      </div>
      <span className="sr-only">
        Field {index + 1} of {count}. Use Move up and Move down for keyboard reordering.
      </span>
    </div>
  );
}
