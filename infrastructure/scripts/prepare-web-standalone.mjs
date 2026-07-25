import { cpSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = join(workspaceRoot, 'apps', 'web');
const standaloneWebRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');

if (!existsSync(join(standaloneWebRoot, 'server.js'))) {
  console.error('The Next.js standalone server was not found. Run the web build first.');
  process.exit(1);
}

cpSync(join(webRoot, '.next', 'static'), join(standaloneWebRoot, '.next', 'static'), {
  recursive: true,
});
cpSync(join(webRoot, 'public'), join(standaloneWebRoot, 'public'), { recursive: true });
