import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Writable } from 'node:stream';
import { runCLI } from '../src/cli/main.js';
import type { RewritePRInput, RewritePROutput } from '../src/index.js';

class BufferStream extends Writable {
  #chunks: string[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.#chunks.push(chunk.toString());
    callback();
  }

  toString(): string {
    return this.#chunks.join('');
  }
}

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'storyteller-cli-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('CLI rewrite command', () => {
  it('loads config defaults and outputs plan JSON', async () => {
    const configPath = path.join(workspace, 'storyteller.yaml');
    await writeFile(configPath, `gating:\n  maxFilesPerPR: 50\nstacking:\n  enabled: true\n`);

    const stdout = new BufferStream();
    const stderr = new BufferStream();

    const rewrite = vi.fn<(input: RewritePRInput) => Promise<RewritePROutput>>();
    rewrite.mockResolvedValue({
      jobId: 'test-job',
      plan: {
        context: {
          repo: 'acme/widgets',
          prNumber: 42,
          title: 'Demo',
          author: 'octocat',
          draft: false,
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          languages: [],
          commitCount: 0,
        },
        storyDraft: {
          problem: '',
          attemptedPaths: [],
          decision: '',
          risks: [],
          rollback: '',
        },
        keepPlan: {
          keepCommits: [],
          dropCommits: [],
          notesForPr: [],
        },
        rewriteOutline: { branchName: 'storyteller', summary: '' },
        atomicPlan: { steps: [] },
        testPlan: { acceptance: [] },
        runnerPlan: { steps: [] },
        qaSummary: {
          scores: {
            atomicity: 4,
            commitStyle: 4,
            reviewability: 4,
            literate: 4,
            tests: 4,
          },
          requiredPass: true,
          notes: [],
        },
        stackRecommendation: { suggested: false },
      },
      artifacts: [],
      publishedPRs: [],
    });

    const argv = [
      'node',
      'storyteller',
      'rewrite',
      '--repo',
      'acme/widgets',
      '--pr',
      '42',
      '--test',
      'npm run smoke',
      '--config',
      configPath,
    ];

    await runCLI(argv, {
      rewrite,
      stdout,
      stderr,
      now: () => new Date('2025-02-14T00:00:00Z'),
    });

    expect(rewrite).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'acme/widgets',
        pr: 42,
        maxFilesPerPR: 50,
        stack: true,
        tests: ['npm run smoke'],
      }),
    );

    const output = stdout.toString();
    expect(output).toContain('"plan"');
    expect(stderr.toString()).toBe('');
  });

  it('propagates rewrite errors and surfaces message', async () => {
    const stdout = new BufferStream();
    const stderr = new BufferStream();

    const rewrite = vi.fn<(input: RewritePRInput) => Promise<RewritePROutput>>();
    rewrite.mockRejectedValue(new Error('apply mode is not supported'));

    const argv = [
      'node',
      'storyteller',
      'rewrite',
      '--repo',
      'acme/widgets',
      '--pr',
      '7',
      '--mode',
      'apply',
    ];

    await expect(
      runCLI(argv, {
        rewrite,
        stdout,
        stderr,
        now: () => new Date('2025-02-14T00:00:00Z'),
      }),
    ).rejects.toThrow();

    expect(stderr.toString()).toContain('apply mode is not supported');
  });
});
