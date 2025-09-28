import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  rewritePR,
  type RewritePRInput,
  type RewritePROutput,
  type PullRequestContext,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadFixture(name: string): Promise<PullRequestContext> {
  const filePath = path.join(__dirname, 'fixtures', name);
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as PullRequestContext;
}

async function main(): Promise<void> {
  const context = await loadFixture('kubernetes-test-infra-pr-35446.json');

  const dependencies = {
    tools: {
      github: {
        async getPRContext() {
          return context;
        },
        async openPullRequest() {
          throw new Error('openPullRequest not available in plan demo');
        },
        async updatePullRequest() {
          throw new Error('updatePullRequest not available in plan demo');
        },
        async createBranch() {
          throw new Error('createBranch not available in plan demo');
        },
        async pushBranch() {
          throw new Error('pushBranch not available in plan demo');
        },
      },
    },
  } as const;

  const input: RewritePRInput = {
    jobId: 'demo-k8s-35446',
    repo: 'kubernetes/test-infra',
    pr: 35446,
    mode: 'plan',
    stack: true,
    tests: ['bazel test //...'],
    maxFilesPerPR: 40,
  };

  const result: RewritePROutput = await rewritePR(input, { dependencies });

  const summary = {
    jobId: result.jobId,
    repo: result.plan.context.repo,
    prNumber: result.plan.context.prNumber,
    changedFiles: result.plan.context.changedFiles,
    stackSuggested: result.plan.stackRecommendation.suggested,
    stackReason: result.plan.stackRecommendation.reason,
    steps: result.plan.atomicPlan.steps.map((step) => ({
      title: step.title,
      files: step.files,
      tests: step.tests,
    })),
    tests: result.plan.testPlan,
    qa: result.plan.qaSummary,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
