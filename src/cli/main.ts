import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { STORYTELLER_DESCRIPTION, STORYTELLER_VERSION } from '../index.js';

export function main(): void {
  // Placeholder CLI while orchestrator and agents are under construction.
  console.log(`Storyteller v${STORYTELLER_VERSION}`);
  console.log(STORYTELLER_DESCRIPTION);
}

const invokedDirectly = (() => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  const resolvedModulePath = fileURLToPath(import.meta.url);
  return path.resolve(entryPath) === resolvedModulePath;
})();

if (invokedDirectly) {
  main();
}
