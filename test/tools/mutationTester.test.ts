import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mutationTester } from '../../src/index.js';

describe('MutationTesterAdapter', () => {
  it('captures summary metrics from command output', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-mutation-'));
    const command =
      "printf 'Killed mutants: 5\nSurvived mutants: 1\nTotal mutants: 6\nMutation score: 83.3\n'";
    const result = await mutationTester.run({ workdir: workspace, command });
    expect(result.exitCode).toBe(0);
    expect(result.summary).toMatchObject({ killed: 5, survived: 1, total: 6, score: 83.3 });
    await fs.rm(workspace, { recursive: true, force: true });
  });
});
