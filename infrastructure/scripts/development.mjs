import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { prepareDevelopment } from './prepare-development.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const target = process.argv[2];
const targetFilters = {
  full: [],
  web: ['--filter=@sufbot/web...'],
  api: ['--filter=@sufbot/api...'],
  bot: ['--filter=@sufbot/bot...'],
  worker: ['--filter=@sufbot/worker...'],
  apps: [
    '--filter=@sufbot/web...',
    '--filter=@sufbot/api...',
    '--filter=@sufbot/bot...',
    '--filter=@sufbot/worker...',
  ],
  packages: ['--filter=./packages/*'],
};

if (!(target in targetFilters)) {
  console.error('Development target must be full, web, api, bot, worker, apps, or packages.');
  process.exit(1);
}

const turboScript = join(workspaceRoot, 'node_modules', 'turbo', 'bin', 'turbo');
let activeChild;

const runTurbo = (args) =>
  new Promise((resolvePromise, reject) => {
    activeChild = spawn(process.execPath, [turboScript, ...args], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    activeChild.once('error', reject);
    activeChild.once('exit', (code, signal) => {
      activeChild = undefined;
      if (signal !== null) {
        reject(new Error(`Turborepo was terminated by ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Turborepo exited with code ${String(code)}.`));
        return;
      }
      resolvePromise();
    });
  });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (activeChild !== undefined && !activeChild.killed) activeChild.kill(signal);
  });
}

try {
  await prepareDevelopment();
  const filters = targetFilters[target];
  await runTurbo(['run', 'dev:build', ...filters]);
  console.info(`Development target "${target}" prepared; starting persistent tasks.`);
  await runTurbo(['run', 'dev', '--concurrency=20', ...filters]);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development startup failed.');
  process.exitCode = 1;
}
