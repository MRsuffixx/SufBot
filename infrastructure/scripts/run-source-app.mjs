import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const entry = process.argv[2];

if (entry === undefined || !/^src[/\\][A-Za-z0-9._/-]+\.ts$/.test(entry)) {
  console.error('A TypeScript entry below src/ is required.');
  process.exit(1);
}

const tsxScript = join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const nodeOptions = [process.env.NODE_OPTIONS, '--conditions=sufbot-source']
  .filter(Boolean)
  .join(' ');
const child = spawn(process.execPath, [tsxScript, 'watch', entry], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', () => {
  console.error('Unable to start the TypeScript source watcher.');
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
