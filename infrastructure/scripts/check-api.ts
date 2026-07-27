const endpoints = [
  ['API health', 'http://127.0.0.1:3001/v1/health'],
  ['API readiness', 'http://127.0.0.1:3001/v1/ready'],
] as const;

let failed = false;
for (const [label, url] of endpoints) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const accepted = response.status === 200;
    console.info(`${label}: HTTP ${String(response.status)}${accepted ? ' (ready)' : ' (failed)'}`);
    failed ||= !accepted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    console.error(`${label}: unavailable (${message})`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
