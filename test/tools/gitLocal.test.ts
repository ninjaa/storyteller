import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gitLocal } from '../../src/index.js';
import { runCommand } from '../../src/utils/exec.js';

async function initBareRepository(): Promise<string> {
  const originDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-origin-'));
  await runCommand('git', ['init', '--bare'], { cwd: originDir });
  return originDir;
}

async function seedRepository(originDir: string): Promise<void> {
  const seedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-seed-'));
  await runCommand('git', ['init', '-b', 'main'], { cwd: seedDir });
  await runCommand('git', ['config', 'user.email', 'storyteller@example.com'], { cwd: seedDir });
  await runCommand('git', ['config', 'user.name', 'Storyteller Bot'], { cwd: seedDir });
  await fs.writeFile(path.join(seedDir, 'README.md'), '# seed\n');
  await runCommand('git', ['add', 'README.md'], { cwd: seedDir });
  await runCommand('git', ['commit', '-m', 'chore: initial'], { cwd: seedDir });
  await runCommand('git', ['remote', 'add', 'origin', originDir], { cwd: seedDir });
  await runCommand('git', ['push', 'origin', 'main'], { cwd: seedDir });
  await fs.rm(seedDir, { recursive: true, force: true });
}

describe('GitLocalAdapter', () => {
  let originDir: string;
  let workdir: string;

  beforeAll(async () => {
    originDir = await initBareRepository();
    await seedRepository(originDir);
    const clone = await gitLocal.clone({ repoUrl: originDir, ref: 'main' });
    workdir = clone.workdir;
    await runCommand('git', ['config', 'user.email', 'storyteller@example.com'], { cwd: workdir });
    await runCommand('git', ['config', 'user.name', 'Storyteller Bot'], { cwd: workdir });
  });

  afterAll(async () => {
    await fs.rm(originDir, { recursive: true, force: true });
    await fs.rm(path.dirname(workdir), { recursive: true, force: true });
  });

  it('applies patches and creates commits', async () => {
    const patch = `diff --git a/README.md b/README.md\nindex aae36a1..b3e04c7 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,3 @@\n-# seed\n+# seed\n+\n+additional line\n`;
    const applyResult = await gitLocal.applyPatch({ workdir, patch });
    expect(applyResult.exitCode).toBe(0);

    const stageResult = await gitLocal.stage({ workdir, paths: ['README.md'] });
    expect(stageResult.exitCode).toBe(0);

    const commitResult = await gitLocal.commit({ workdir, message: 'docs: expand readme' });
    expect(commitResult.exitCode).toBe(0);

    const status = await gitLocal.status(workdir);
    expect(status.status.changes).toHaveLength(0);

    const diff = await gitLocal.diff({ workdir, from: 'HEAD~1', to: 'HEAD', path: 'README.md' });
    expect(diff.patch).toContain('additional line');
  });
});
