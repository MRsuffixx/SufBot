const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

export const getSafeLocalTestDatabaseUrl = (): string | undefined => {
  const value = process.env.TEST_DATABASE_URL;
  if (value === undefined) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  const databaseName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  if (
    !loopbackHosts.has(parsed.hostname.toLowerCase()) ||
    !/(?:^|[_-])test(?:$|[_-])/.test(databaseName)
  ) {
    return undefined;
  }

  return value;
};

export const getSafeLocalTestRedisUrl = (): string | undefined => {
  const value = process.env.TEST_REDIS_URL;
  if (value === undefined) return undefined;

  try {
    const parsed = new URL(value);
    return loopbackHosts.has(parsed.hostname.toLowerCase()) ? value : undefined;
  } catch {
    return undefined;
  }
};
