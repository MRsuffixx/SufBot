const url = 'http://127.0.0.1:3000/';

try {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const accepted = response.status >= 200 && response.status < 400;
  console.info(`Web: HTTP ${String(response.status)}${accepted ? ' (ready)' : ' (failed)'}`);
  if (!accepted) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : 'request failed';
  console.error(`Web: unavailable (${message})`);
  process.exitCode = 1;
}
