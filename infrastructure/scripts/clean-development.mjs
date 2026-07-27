import { rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const targets = [resolve(workspaceRoot, 'apps', 'web', '.next', 'dev')];

for (const target of targets) {
  const relativeTarget = relative(workspaceRoot, target);
  if (
    relativeTarget === '' ||
    relativeTarget.startsWith('..') ||
    relativeTarget.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`Refusing to clean a path outside the workspace: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
  console.info(`Development cache removed: ${relativeTarget}`);
}
