import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const environmentFile = join(workspaceRoot, '.env');

if (existsSync(environmentFile)) {
  const result = loadDotenv({
    path: environmentFile,
    override: false,
    quiet: true,
  });
  if (result.error !== undefined) {
    console.error('The root .env file could not be loaded.');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('No pnpm command was provided.');
  process.exit(1);
}

const pnpmScript = process.env.npm_execpath;
const pnpmIsNodeScript =
  pnpmScript !== undefined && /\.(?:cjs|mjs|js)$/i.test(pnpmScript);
const executable =
  pnpmScript === undefined
    ? process.platform === 'win32'
      ? 'pnpm.cmd'
      : 'pnpm'
    : pnpmIsNodeScript
      ? process.execPath
      : pnpmScript;
const childArgs = pnpmIsNodeScript ? [pnpmScript, ...args] : args;
const child = spawn(executable, childArgs, {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    SUFBOT_ROOT: workspaceRoot,
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', () => {
  console.error('Unable to start the requested pnpm command.');
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
