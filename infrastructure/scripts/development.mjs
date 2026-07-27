import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { prepareDevelopment } from './prepare-development.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const target = process.argv[2];

const allApplications = ['@sufbot/web', '@sufbot/api', '@sufbot/bot', '@sufbot/worker'];
const workspacePackages = new Map();
for (const group of ['apps', 'packages']) {
  const groupDirectory = join(workspaceRoot, group);
  for (const entry of readdirSync(groupDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJsonPath = join(groupDirectory, entry.name, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
      };
      workspacePackages.set(
        manifest.name,
        Object.entries(dependencies)
          .filter(([, specifier]) => String(specifier).startsWith('workspace:'))
          .map(([name]) => name),
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

const dependencyClosure = (roots) => {
  const selected = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || selected.has(name)) continue;
    selected.add(name);
    pending.push(...(workspacePackages.get(name) ?? []));
  }
  return [...selected].map((name) => `--filter=${name}`);
};

const targetRoots = {
  full: allApplications,
  web: ['@sufbot/web'],
  api: ['@sufbot/api'],
  bot: ['@sufbot/bot'],
  worker: ['@sufbot/worker'],
  apps: allApplications,
  packages: [],
};

if (!(target in targetRoots)) {
  console.error('Development target must be full, web, api, bot, worker, apps, or packages.');
  process.exit(1);
}

const turboScript = join(workspaceRoot, 'node_modules', 'turbo', 'bin', 'turbo');
let activeChild;

const runTurbo = (args, environment = process.env) =>
  new Promise((resolvePromise, reject) => {
    activeChild = spawn(process.execPath, [turboScript, ...args], {
      cwd: workspaceRoot,
      env: environment,
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
  const packageOnly = target === 'packages';
  const roots = targetRoots[target];
  const preparationFilters = packageOnly
    ? ['--filter=./packages/*']
    : dependencyClosure(roots);
  const runtimeFilters = packageOnly
    ? ['--filter=./packages/*']
    : roots.map((name) => `--filter=${name}`);
  await runTurbo(['run', 'dev:build', ...preparationFilters]);
  console.info(`Development target "${target}" prepared; starting persistent tasks.`);
  const developmentEnvironment = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--conditions=development']
      .filter(Boolean)
      .join(' '),
  };
  await runTurbo(
    ['run', 'dev', '--concurrency=20', ...runtimeFilters],
    developmentEnvironment,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development startup failed.');
  process.exitCode = 1;
}
