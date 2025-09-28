import { describe, expect, it } from 'vitest';
import {
  rewritePR,
  type RewritePRInput,
  type RewritePROptions,
  type PullRequestContext,
  gitLocal,
  astDiff,
  formatLint,
  testRunner,
  mutationTester,
} from '../src/index.js';

const mockContext: PullRequestContext = {
  pr: {
    number: 42,
    title: 'Improve search result highlighting',
    state: 'open',
    merged: false,
    head: { ref: 'feature/search-highlight', sha: 'deadbeef' },
    base: { ref: 'main', sha: 'cafebabe' },
    author: { login: 'octocat' },
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-02T00:00:00Z',
    draft: false,
    additions: 180,
    deletions: 35,
    changedFiles: 6,
  },
  commits: [
    {
      sha: 'c1',
      message: 'wip: start highlight work',
      author: { name: 'Octo Cat', email: 'octo@example.com', login: 'octocat' },
      committedDate: '2024-02-01T00:00:00Z',
    },
    {
      sha: 'c2',
      message: 'feat: render highlights in results',
      author: { name: 'Octo Cat', email: 'octo@example.com', login: 'octocat' },
      committedDate: '2024-02-01T02:00:00Z',
    },
  ],
  diffSummary: {
    additions: 180,
    deletions: 35,
    filesChanged: 6,
  },
  ci: {
    checks: [
      {
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        detailsUrl: 'https://ci.example.com/build',
      },
    ],
  },
  files: [
    {
      filename: 'src/search/highlight.ts',
      status: 'modified',
      additions: 120,
      deletions: 10,
      changes: 130,
    },
    {
      filename: 'src/search/highlight.test.ts',
      status: 'modified',
      additions: 40,
      deletions: 5,
      changes: 45,
    },
    {
      filename: 'src/components/SearchResult.tsx',
      status: 'modified',
      additions: 20,
      deletions: 20,
      changes: 40,
    },
    {
      filename: 'docs/search.md',
      status: 'modified',
      additions: 0,
      deletions: 0,
      changes: 0,
    },
    {
      filename: 'src/styles/highlight.css',
      status: 'modified',
      additions: 5,
      deletions: 0,
      changes: 5,
    },
    {
      filename: 'scripts/generate-fixtures.ts',
      status: 'added',
      additions: 15,
      deletions: 0,
      changes: 15,
    },
  ],
  languages: ['ts', 'tsx'],
  testCommands: ['npm test --silent'],
  repoPaths: {
    workdir: null,
  },
};

describe('rewritePR orchestrator (plan mode)', () => {
  const githubToolMock = {
    async getPRContext() {
      return mockContext;
    },
    async openPullRequest() {
      throw new Error('not implemented in plan test');
    },
    async updatePullRequest() {
      throw new Error('not implemented in plan test');
    },
    async createBranch() {
      throw new Error('not implemented in plan test');
    },
    async pushBranch() {
      throw new Error('not implemented in plan test');
    },
  };

  const dependencies: RewritePROptions['dependencies'] = {
    tools: {
      github: githubToolMock,
      gitLocal,
      astDiff,
      formatLint,
      testRunner,
      mutationTester,
    },
    logger: {
      info: () => {
        /* noop */
      },
      debug: () => {
        /* noop */
      },
      error: () => {
        /* noop */
      },
    },
  };

  it('builds a literate plan including atomic steps and test strategy', async () => {
    const input: RewritePRInput = {
      jobId: 'job-123',
      repo: 'acme/widgets',
      pr: 42,
      mode: 'plan',
      stack: false,
      tests: ['npm run test:acceptance'],
    };

    const result = await rewritePR(input, { dependencies });

    expect(result.jobId).toBe('job-123');
    expect(result.publishedPRs).toHaveLength(0);

    const { plan } = result;
    expect(plan.context.repo).toBe('acme/widgets');
    expect(plan.storyDraft.problem).toContain('Improve search result highlighting');
    expect(plan.keepPlan.keepCommits).toEqual(['c1', 'c2']);
    expect(plan.atomicPlan.steps.length).toBeGreaterThan(0);
    expect(plan.testPlan.acceptance).toContain('npm run test:acceptance');
    expect(plan.qaSummary.requiredPass).toBe(true);
    expect(plan.stackRecommendation.suggested).toBe(false);

    const planArtifact = result.artifacts.find((artifact) => artifact.name === 'plan-summary.json');
    expect(planArtifact).toBeDefined();
    const parsedPlan = JSON.parse(planArtifact!.content) as Record<string, unknown>;
    expect(parsedPlan.context).toBeDefined();
  });

  it('throws when apply mode is requested (not yet implemented)', async () => {
    const input: RewritePRInput = {
      jobId: 'job-apply',
      repo: 'acme/widgets',
      pr: 42,
      mode: 'apply',
    };

    await expect(() => rewritePR(input, { dependencies })).rejects.toThrow(/apply mode/i);
  });
});
