import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { getSafeConnectionMetadata } from '../config/src/environment.js';
import { loadDatabaseEnvironment, resolveDatabaseWorkspaceRoot } from './environment.js';
import { createPrismaConfig } from './prisma-config.js';

const createTemporaryWorkspace = (environmentContents?: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'sufbot-database-environment-'));
  writeFileSync(join(root, 'package.json'), '{"private":true}\n');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  if (environmentContents !== undefined) {
    writeFileSync(join(root, '.env'), environmentContents);
  }
  return root;
};

describe('database environment bootstrap', () => {
  it('discovers the workspace root from inside the database package', () => {
    const root = createTemporaryWorkspace(
      'DATABASE_URL=postgresql://root:secret@127.0.0.1:5432/sufbot\n',
    );
    const packageDirectory = join(root, 'packages', 'database');
    try {
      expect(resolveDatabaseWorkspaceRoot(packageDirectory, {})).toBe(root);
      const targetEnvironment: NodeJS.ProcessEnv = {};
      const result = loadDatabaseEnvironment({
        rootDirectory: root,
        environment: targetEnvironment,
        requireEnvironmentFile: true,
      });
      expect(new URL(result.databaseUrl).username).toBe('root');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('makes a present root .env canonical over inherited local process values', () => {
    const root = createTemporaryWorkspace(
      'DATABASE_URL=postgresql://local:secret@127.0.0.1:5432/sufbot\n',
    );
    try {
      const result = loadDatabaseEnvironment({
        rootDirectory: root,
        environment: {
          DATABASE_URL: 'postgresql://stale:secret@external.example:5432/remote',
        },
      });
      expect(new URL(result.databaseUrl).hostname).toBe('127.0.0.1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('supports CI and Docker process variables when no .env is present', () => {
    const root = createTemporaryWorkspace();
    try {
      const result = loadDatabaseEnvironment({
        rootDirectory: root,
        environment: {
          DATABASE_URL: 'postgresql://container:secret@postgres:5432/sufbot',
        },
      });
      expect(new URL(result.databaseUrl).hostname).toBe('postgres');
      expect(result.environmentFileFound).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects missing and malformed database URLs without a fake fallback', () => {
    const root = createTemporaryWorkspace();
    try {
      expect(() => createPrismaConfig({ rootDirectory: root, environment: {} })).toThrowError(
        /DATABASE_URL is required/,
      );
      expect(() =>
        loadDatabaseEnvironment({
          rootDirectory: root,
          environment: { DATABASE_URL: 'not-a-url' },
        }),
      ).toThrowError(/valid PostgreSQL connection URL/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const configSource = readFileSync(resolve(import.meta.dirname, 'prisma.config.ts'), 'utf8');
    expect(configSource).not.toContain('postgresql://invalid');
  });

  it('documents distinct host and Docker service URLs', () => {
    const example = parseDotenv(
      readFileSync(resolve(import.meta.dirname, '../../.env.example'), 'utf8'),
    );
    expect(new URL(example.DATABASE_URL ?? '').hostname).toBe('127.0.0.1');
    expect(new URL(example.DATABASE_URL_DOCKER ?? '').hostname).toBe('postgres');
    expect(new URL(example.REDIS_URL ?? '').hostname).toBe('127.0.0.1');
    expect(new URL(example.REDIS_URL_DOCKER ?? '').hostname).toBe('redis');
  });

  it('redacts credentials from diagnostic connection metadata', () => {
    const secret = 'do-not-print-this-password';
    const metadata = getSafeConnectionMetadata(
      `postgresql://sufbot:${secret}@127.0.0.1:5432/sufbot`,
    );
    expect(JSON.stringify(metadata)).not.toContain(secret);
    expect(metadata.password).toBe('[REDACTED]');
  });
});
