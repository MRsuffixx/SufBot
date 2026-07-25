import type { Locale } from './schemas.js';

const messages = {
  en: {
    'common.saved': 'Your changes were saved.',
    'common.cancelled': 'The operation was cancelled.',
    'errors.unknown': 'Something went wrong. Reference: {reference}',
    'errors.guildOnly': 'This command can only be used in a server.',
    'errors.permissionDenied': 'You do not have permission to use this command.',
    'errors.moduleDisabled': 'The {module} module is disabled in this server.',
    'commands.ping.response': 'Pong! Gateway: {gateway} ms · Round trip: {roundtrip} ms',
    'commands.config.languageUpdated': 'Server language changed to English.',
    'commands.timeout.success': '{user} was timed out for {minutes} minute(s).',
  },
  tr: {
    'common.saved': 'Değişiklikleriniz kaydedildi.',
    'common.cancelled': 'İşlem iptal edildi.',
    'errors.unknown': 'Bir hata oluştu. Referans: {reference}',
    'errors.guildOnly': 'Bu komut yalnızca bir sunucuda kullanılabilir.',
    'errors.permissionDenied': 'Bu komutu kullanma izniniz yok.',
    'errors.moduleDisabled': 'Bu sunucuda {module} modülü devre dışı.',
    'commands.ping.response': 'Pong! Ağ geçidi: {gateway} ms · Gidiş dönüş: {roundtrip} ms',
    'commands.config.languageUpdated': 'Sunucu dili Türkçe olarak değiştirildi.',
    'commands.timeout.success': '{user} kullanıcısına {minutes} dakika zaman aşımı uygulandı.',
  },
} as const;

type MessageKey = keyof (typeof messages)['en'];

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

