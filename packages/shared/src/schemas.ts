import { z } from 'zod';
import { discordSnowflakePattern } from './ids.js';

export const DiscordSnowflakeSchema = z.string().regex(discordSnowflakePattern);

export const LocaleSchema = z.enum(['en', 'tr']);
export type Locale = z.infer<typeof LocaleSchema>;

export const PaginationSchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

export const RequestIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const GuildSettingsInputSchema = z
  .object({
    locale: LocaleSchema.optional(),
    timezone: z.string().min(1).max(64).optional(),
    commandPrefix: z.string().min(1).max(5).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.locale !== undefined ||
      input.timezone !== undefined ||
      input.commandPrefix !== undefined,
    'At least one setting must be supplied.',
  );

export const GuildModuleInputSchema = z
  .object({
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()).default({}),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type GuildSettingsInput = z.infer<typeof GuildSettingsInputSchema>;
export type GuildModuleInput = z.infer<typeof GuildModuleInputSchema>;

