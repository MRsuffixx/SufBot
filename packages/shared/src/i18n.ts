import type { Locale } from './schemas.js';
import enCommon from './locales/en/common.json' with { type: 'json' };
import enCommands from './locales/en/commands.json' with { type: 'json' };
import enErrors from './locales/en/errors.json' with { type: 'json' };
import trCommon from './locales/tr/common.json' with { type: 'json' };
import trCommands from './locales/tr/commands.json' with { type: 'json' };
import trErrors from './locales/tr/errors.json' with { type: 'json' };

const english = { ...enCommon, ...enCommands, ...enErrors };
type MessageKey = keyof typeof english;
const messages: Record<Locale, Record<MessageKey, string>> = {
  en: english,
  tr: { ...trCommon, ...trCommands, ...trErrors },
};

export const translate = (
  locale: Locale,
  key: MessageKey,
  variables: Readonly<Record<string, string | number>> = {},
): string => {
  const template = messages[locale][key] ?? messages.en[key];
  return Object.entries(variables).reduce(
    (rendered, [name, value]) => rendered.replaceAll(`{${name}}`, String(value)),
    template,
  );
};

export const isSupportedMessageKey = (key: string): key is MessageKey => key in messages.en;
