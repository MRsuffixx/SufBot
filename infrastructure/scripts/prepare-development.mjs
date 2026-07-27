import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const databaseDirectory = join(workspaceRoot, 'packages', 'database');
const generatedClient = join(databaseDirectory, 'src', 'generated', 'prisma', 'client.ts');
const hashFile = join(databaseDirectory, 'src', 'generated', '.sufbot-development-hash');
const prismaInputs = [
  join(databaseDirectory, 'package.json'),
  join(databaseDirectory, 'prisma.config.ts'),
  join(databaseDirectory, 'prisma-config.ts'),
  join(databaseDirectory, 'prisma', 'schema.prisma'),
];

const calculatePrismaHash = () => {
  const hash = createHash('sha256');
  for (const input of prismaInputs) {
    hash.update(input);
    hash.update(readFileSync(input));
  }
  return hash.digest('hex');
};

const pnpmInvocation = (args) => {
  const pnpmScript = process.env.npm_execpath;
  const pnpmIsNodeScript = pnpmScript !== undefined && /\.(?:cjs|mjs|js)$/i.test(pnpmScript);
  const useWindowsCommandShim = pnpmScript === undefined && process.platform === 'win32';
  return {
    executable: useWindowsCommandShim
      ? (process.env.ComSpec ?? 'cmd.exe')
      : pnpmScript === undefined
        ? 'pnpm'
        : pnpmIsNodeScript
          ? process.execPath
          : pnpmScript,
    args: useWindowsCommandShim
      ? ['/d', '/s', '/c', 'pnpm', ...args]
      : pnpmIsNodeScript
        ? [pnpmScript, ...args]
        : args,
  };
};

const runPnpm = (args) =>
  new Promise((resolvePromise, reject) => {
    const command = pnpmInvocation(args);
    const child = spawn(command.executable, command.args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`pnpm was terminated by ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`pnpm exited with code ${String(code)}.`));
        return;
      }
      resolvePromise();
    });
  });

export const prepareDevelopment = async () => {
  const expectedHash = calculatePrismaHash();
  const recordedHash = existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : '';
  if (existsSync(generatedClient) && recordedHash === expectedHash) {
    console.info('Development preparation: Prisma Client is current.');
    return;
  }

  console.info('Development preparation: generating Prisma Client.');
  await runPnpm(['--filter', '@sufbot/database', 'generate']);
  if (!existsSync(generatedClient)) {
    throw new Error('Prisma generation completed without producing the expected client.');
  }
  writeFileSync(hashFile, `${expectedHash}\n`, 'utf8');
};

const invokedPath =
  process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1]));
if (invokedPath?.href === import.meta.url) {
  await prepareDevelopment().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Development preparation failed.');
    process.exitCode = 1;
  });
}
