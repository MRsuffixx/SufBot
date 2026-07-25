import type { Prisma, PrismaClient } from './generated/prisma/client.js';

export type AuditEvent = {
  guildId?: string;
  actorUserId?: string;
  actorDiscordId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddressHash?: string;
  userAgent?: string;
  requestId: string;
  outcome: 'SUCCESS' | 'FAILURE';
  failureReason?: string;
  metadata?: unknown;
};

const forbiddenAuditKeys = /token|secret|password|authorization|cookie|credential|key$/i;

export const sanitizeAuditValue = (value: unknown, depth = 0): Prisma.InputJsonValue => {
  if (depth > 8) return '[MAX_DEPTH]';
  if (value === null) return '[NULL]';
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        forbiddenAuditKeys.test(key) ? '[REDACTED]' : sanitizeAuditValue(item, depth + 1),
      ]),
    );
  }
  return String(value);
};

export const appendAuditLog = async (
  prisma: PrismaClient | Prisma.TransactionClient,
  event: AuditEvent,
): Promise<void> => {
  await prisma.guildAuditLog.create({
    data: {
      action: event.action,
      resourceType: event.resourceType,
      requestId: event.requestId,
      outcome: event.outcome,
      metadata: sanitizeAuditValue(event.metadata ?? {}),
      ...(event.guildId === undefined ? {} : { guildId: event.guildId }),
      ...(event.actorUserId === undefined ? {} : { actorUserId: event.actorUserId }),
      ...(event.actorDiscordId === undefined ? {} : { actorDiscordId: event.actorDiscordId }),
      ...(event.resourceId === undefined ? {} : { resourceId: event.resourceId }),
      ...(event.previousValue === undefined
        ? {}
        : { previousValue: sanitizeAuditValue(event.previousValue) }),
      ...(event.newValue === undefined ? {} : { newValue: sanitizeAuditValue(event.newValue) }),
      ...(event.ipAddressHash === undefined ? {} : { ipAddressHash: event.ipAddressHash }),
      ...(event.userAgent === undefined ? {} : { userAgent: event.userAgent.slice(0, 255) }),
      ...(event.failureReason === undefined
        ? {}
        : { failureReason: event.failureReason.slice(0, 255) }),
    },
  });
};
