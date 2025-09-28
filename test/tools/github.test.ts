import { describe, expect, it } from 'vitest';
import { GitHubAdapter } from '../../src/index.js';

const token = process.env.GITHUB_TOKEN;

describe.skipIf(!token)('GitHubAdapter', () => {
  const adapter = new GitHubAdapter({ token });

  it('fetches pull request context from a public repository', async () => {
    const context = await adapter.getPRContext({
      owner: 'octocat',
      repo: 'Hello-World',
      prNumber: 400,
    });
    expect(context.pr.number).toBe(400);
    expect(context.files.length).toBeGreaterThan(0);
  });
});
