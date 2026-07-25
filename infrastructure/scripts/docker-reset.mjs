import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.argv.includes('--yes')) {
  console.error('WARNING: this deletes the local PostgreSQL and Redis Docker volumes.');
  console.error('It must never be used for production data.');
  console.error('To confirm, run: pnpm docker:reset -- --yes');
  process.exit(1);
}

const runDocker = (args) =>
  new Promise((resolveCommand, reject) => {
    const command = process.platform === 'win32' ? 'docker.exe' : 'docker';
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveCommand();
      else reject(new Error(`docker exited with status ${code ?? 'unknown'}`));
    });
  });

console.info('Deleting disposable local Docker service data...');
await runDocker(['compose', 'down', '--volumes', '--remove-orphans']);
await runDocker(['compose', 'up', '-d', 'postgres', 'redis']);
console.info('Local PostgreSQL and Redis volumes were recreated.');
