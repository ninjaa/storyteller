import { github } from './tools/github.js';
import { gitLocal } from './tools/gitLocal.js';
import { astDiff } from './tools/astDiff.js';
import { formatLint } from './tools/formatLint.js';
import { testRunner } from './tools/testRunner.js';
import { mutationTester } from './tools/mutationTester.js';
import type { PullRequestContext, PullRequestIdentifier, RepoRef } from './tools/types.js';

export interface RewritePRInput {
  jobId: string;
  repo: string; // format: owner/name
  pr: number;
  mode: 'plan' | 'apply';
  stack?: boolean;
  tests?: string[];
  maxFilesPerPR?: number;
}

export interface RewritePROutput {
  jobId: string;
  plan: RewritePlan;
  artifacts: OrchestratorArtifact[];
  publishedPRs: PublishedPR[];
}

export interface RewritePlan {
  context: ContextSummary;
  storyDraft: StoryDraft;
  keepPlan: KeepPlan;
  rewriteOutline: RewriteOutline;
  atomicPlan: AtomicPlan;
  testPlan: TestPlan;
  runnerPlan: RunnerPlan;
  qaSummary: QASummary;
  stackRecommendation: StackRecommendation;
}

export interface StoryDraft {
  problem: string;
  attemptedPaths: AttemptedPath[];
  decision: string;
  risks: string[];
  rollback: string;
}

export interface AttemptedPath {
  summary: string;
  commits: string[];
}

export interface KeepPlan {
  keepCommits: string[];
  dropCommits: string[];
  notesForPr: string[];
}

export interface RewriteOutline {
  branchName: string;
  summary: string;
}

export interface AtomicPlan {
  steps: AtomicStep[];
}

export interface AtomicStep {
  title: string;
  intent: string;
  files: string[];
  tests: string[];
  risk: 'low' | 'medium' | 'high';
}

export interface TestPlan {
  acceptance: string[];
  regression?: string[];
  mutation?: string[];
}

export interface RunnerPlan {
  steps: RunnerStepResult[];
}

export interface RunnerStepResult {
  name: string;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  details?: string;
}

export interface QASummary {
  scores: {
    atomicity: number;
    commitStyle: number;
    reviewability: number;
    literate: number;
    tests: number;
  };
  requiredPass: boolean;
  notes: string[];
}

export interface StackRecommendation {
  suggested: boolean;
  reason?: string;
}

export interface OrchestratorArtifact {
  name: string;
  contentType: 'application/json' | 'text/plain';
  content: string;
}

export interface PublishedPR {
  number: number;
  url: string;
}

export interface ContextSummary {
  repo: string;
  prNumber: number;
  title: string;
  author: string | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  languages: string[];
  commitCount: number;
}

export interface OrchestratorTools {
  github: Pick<
    typeof github,
    'getPRContext' | 'openPullRequest' | 'updatePullRequest' | 'createBranch' | 'pushBranch'
  >;
  gitLocal: typeof gitLocal;
  astDiff: typeof astDiff;
  formatLint: typeof formatLint;
  testRunner: typeof testRunner;
  mutationTester: typeof mutationTester;
}

export interface HistorianAgent {
  (context: PullRequestContext): StoryDraft;
}

export interface PrunerAgent {
  (context: PullRequestContext, story: StoryDraft): KeepPlan;
}

export interface DecomposerAgent {
  (context: PullRequestContext, keepPlan: KeepPlan): AtomicPlan;
}

export interface RewriterAgent {
  (context: PullRequestContext, atomicPlan: AtomicPlan): RewriteOutline;
}

export interface TesterAgent {
  (context: PullRequestContext, atomicPlan: AtomicPlan, requestedTests: string[]): TestPlan;
}

export interface RunnerAgent {
  (plan: TestPlan): RunnerPlan;
}

export interface CriticAgent {
  (context: PullRequestContext, atomicPlan: AtomicPlan, testPlan: TestPlan): QASummary;
}

export interface PublisherAgent {
  (input: {
    context: PullRequestContext;
    mode: 'plan' | 'apply';
    stack: boolean | undefined;
  }): PublishedPR[];
}

export interface OrchestratorAgents {
  historian: HistorianAgent;
  pruner: PrunerAgent;
  decomposer: DecomposerAgent;
  rewriter: RewriterAgent;
  tester: TesterAgent;
  runner: RunnerAgent;
  critic: CriticAgent;
  publisher: PublisherAgent;
}

export interface OrchestratorLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface OrchestratorDependencies {
  tools: OrchestratorTools;
  agents: OrchestratorAgents;
  logger: OrchestratorLogger;
}

export interface AgentLogEntry {
  agent: keyof OrchestratorAgents | 'ingestion';
  message: string;
  timestamp: string;
  detail?: Record<string, unknown>;
}

export interface RewritePROptions {
  dependencies?: Partial<OrchestratorDependencies>;
}

const defaultLogger: OrchestratorLogger = {
  info(message, meta) {
    if (meta) {
      console.log(message, meta);
    } else {
      console.log(message);
    }
  },
  debug(message, meta) {
    if (meta) {
      console.log(message, meta);
    }
  },
  error(message, meta) {
    if (meta) {
      console.error(message, meta);
    } else {
      console.error(message);
    }
  },
};

export async function rewritePR(
  input: RewritePRInput,
  options: RewritePROptions = {},
): Promise<RewritePROutput> {
  const dependencies = resolveDependencies(options.dependencies);
  const { tools, agents, logger } = dependencies;

  if (input.mode === 'apply') {
    throw new Error('apply mode is not yet implemented. Run in plan mode first.');
  }

  const logEntries: AgentLogEntry[] = [];
  const log = (
    agent: AgentLogEntry['agent'],
    message: string,
    detail?: Record<string, unknown>,
  ) => {
    const entry: AgentLogEntry = {
      agent,
      message,
      timestamp: new Date().toISOString(),
      detail,
    };
    logEntries.push(entry);
    logger.debug(`[${agent}] ${message}`, detail);
  };

  const repoRef = parseRepo(input.repo);
  const prIdentifier: PullRequestIdentifier = { ...repoRef, prNumber: input.pr };

  log('ingestion', 'Fetching pull request context', { repo: input.repo, pr: input.pr });
  const prContext = await tools.github.getPRContext(prIdentifier);

  const contextSummary: ContextSummary = {
    repo: input.repo,
    prNumber: input.pr,
    title: prContext.pr.title,
    author: prContext.pr.author?.login ?? null,
    draft: prContext.pr.draft,
    additions: prContext.diffSummary.additions,
    deletions: prContext.diffSummary.deletions,
    changedFiles: prContext.diffSummary.filesChanged,
    languages: prContext.languages,
    commitCount: prContext.commits.length,
  };

  log('historian', 'Synthesising story draft');
  const storyDraft = agents.historian(prContext);

  log('pruner', 'Evaluating keep/drop plan');
  const keepPlan = agents.pruner(prContext, storyDraft);

  log('rewriter', 'Constructing rewrite outline');
  const atomicPlan = agents.decomposer(prContext, keepPlan);
  const rewriteOutline = agents.rewriter(prContext, atomicPlan);

  log('tester', 'Generating test plan');
  const testPlan = agents.tester(prContext, atomicPlan, input.tests ?? []);

  log('runner', 'Synthesising runner plan');
  const runnerPlan = agents.runner(testPlan);

  log('critic', 'Scoring plan against rubric');
  const qaSummary = agents.critic(prContext, atomicPlan, testPlan);

  const stackRecommendation = buildStackRecommendation(contextSummary, input.maxFilesPerPR);

  log('publisher', 'Preparing publishing strategy');
  const publishedPRs = agents.publisher({
    context: prContext,
    mode: input.mode,
    stack: input.stack,
  });

  const plan: RewritePlan = {
    context: contextSummary,
    storyDraft,
    keepPlan,
    rewriteOutline,
    atomicPlan,
    testPlan,
    runnerPlan,
    qaSummary,
    stackRecommendation,
  };

  const artifacts: OrchestratorArtifact[] = [
    {
      name: 'agent-logs.json',
      contentType: 'application/json',
      content: JSON.stringify(logEntries, null, 2),
    },
    {
      name: 'plan-summary.json',
      contentType: 'application/json',
      content: JSON.stringify(plan, null, 2),
    },
  ];

  return {
    jobId: input.jobId,
    plan,
    artifacts,
    publishedPRs,
  };
}

function resolveDependencies(
  overrides?: Partial<OrchestratorDependencies>,
): OrchestratorDependencies {
  if (!overrides) {
    return defaultDependencies;
  }

  return {
    tools: {
      ...defaultDependencies.tools,
      ...(overrides.tools ?? {}),
    },
    agents: {
      ...defaultDependencies.agents,
      ...(overrides.agents ?? {}),
    },
    logger: overrides.logger ?? defaultDependencies.logger,
  };
}

function parseRepo(repo: string): RepoRef {
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid repo format '${repo}'. Expected "owner/name".`);
  }
  return { owner, repo: name };
}

function buildStackRecommendation(
  context: ContextSummary,
  maxFilesPerPR?: number,
): StackRecommendation {
  const threshold = maxFilesPerPR ?? 40;
  if (context.changedFiles > threshold) {
    return {
      suggested: true,
      reason: `changed files (${String(context.changedFiles)}) exceed threshold (${String(threshold)})`,
    };
  }
  return { suggested: false };
}

const defaultHistorian: HistorianAgent = (context) => {
  const primaryLanguage = context.languages[0] ?? 'codebase';
  return {
    problem: `Original PR "${context.pr.title}" touches ${String(
      context.diffSummary.filesChanged,
    )} files across ${primaryLanguage} modules.`,
    attemptedPaths: [
      {
        summary: 'Current head commits',
        commits: context.commits.map((commit) => commit.sha),
      },
    ],
    decision: `Focus on rebuilding the change as ${String(
      context.commits.length,
    )} atomic step(s) aligned to reviewer workflow.`,
    risks: [
      'Ensure behaviour parity between rewritten commits and original head.',
      'Validate tests cover new happy-path and regression scenarios.',
    ],
    rollback: `Revert the storyteller branch or reset to base SHA ${context.pr.base.sha}.`,
  };
};

const defaultPruner: PrunerAgent = (context) => {
  const keepCommits = context.commits.map((commit) => commit.sha);
  return {
    keepCommits,
    dropCommits: [],
    notesForPr: ['All commits retained for rewrite since no explicit dead ends were detected.'],
  };
};

const defaultDecomposer: DecomposerAgent = (context, keepPlan) => {
  const filesByGroup = new Map<string, string[]>();

  for (const file of context.files) {
    if (!keepPlan.keepCommits.length) {
      break;
    }
    const group = deriveGroupKey(file.filename);
    const existing = filesByGroup.get(group) ?? [];
    existing.push(file.filename);
    filesByGroup.set(group, existing);
  }

  const steps: AtomicStep[] = [];
  let index = 1;
  for (const [group, files] of filesByGroup.entries()) {
    steps.push({
      title: `step ${String(index)}: update ${group}`,
      intent: `Refine ${group} changes to ensure semantic clarity`,
      files,
      tests: files.map((file) => inferTestForFile(file)),
      risk: files.length > 5 ? 'medium' : 'low',
    });
    index += 1;
  }

  if (!steps.length) {
    steps.push({
      title: 'step 1: review changes',
      intent: 'Review minimal diff',
      files: context.files.map((file) => file.filename),
      tests: [],
      risk: 'low',
    });
  }

  return { steps };
};

const defaultRewriter: RewriterAgent = (context, atomicPlan) => {
  const sanitizedTitle = context.pr.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const branchName = `storyteller/rewrite/pr-${String(context.pr.number)}/${sanitizedTitle}`;
  return {
    branchName,
    summary: `${String(atomicPlan.steps.length)} planned commit(s) ready for storyteller rewrite`,
  };
};

const defaultTester: TesterAgent = (context, atomicPlan, requestedTests) => {
  const acceptance = [...new Set([...context.testCommands, ...requestedTests])];
  const regression: string[] = [];

  if (!acceptance.length) {
    acceptance.push('npm test --silent');
  }

  const mutation: string[] = [];
  if (context.languages.includes('ts') || context.languages.includes('js')) {
    mutation.push('npx stryker run');
  }
  if (context.languages.includes('py')) {
    mutation.push('mutmut run');
  }

  if (atomicPlan.steps.length > 1) {
    regression.push('npm run lint');
  }

  return { acceptance, regression, mutation };
};

const defaultRunner: RunnerAgent = (plan) => {
  const steps: RunnerStepResult[] = [];
  if (plan.acceptance.length) {
    steps.push({ name: 'acceptance', status: 'pending', details: plan.acceptance.join(', ') });
  }
  if (plan.regression?.length) {
    steps.push({ name: 'regression', status: 'pending', details: plan.regression.join(', ') });
  }
  if (plan.mutation?.length) {
    steps.push({ name: 'mutation', status: 'pending', details: plan.mutation.join(', ') });
  }
  if (!steps.length) {
    steps.push({ name: 'ci', status: 'skipped', details: 'No tests configured' });
  }
  return { steps };
};

const defaultCritic: CriticAgent = (context, atomicPlan, testPlan) => {
  const largeChange = context.diffSummary.filesChanged > 40;
  const hasTests = Boolean(testPlan.acceptance.length);
  const touchesMultipleSubsystems = atomicPlan.steps.length > 4;
  const mostlyDeletions = context.diffSummary.deletions > context.diffSummary.additions * 3;
  const reviewabilityScore = largeChange && touchesMultipleSubsystems ? 4 : 5;

  const scores = {
    atomicity: Math.min(5, Math.max(3, atomicPlan.steps.length >= 1 ? 4 : 3)),
    commitStyle: 4,
    reviewability: reviewabilityScore,
    literate: 4,
    tests: hasTests ? 4 : 3,
  };

  return {
    scores,
    requiredPass:
      scores.atomicity >= 4 &&
      scores.commitStyle >= 4 &&
      scores.reviewability >= 4 &&
      scores.literate >= 4 &&
      scores.tests >= 4,
    notes:
      largeChange && touchesMultipleSubsystems && !mostlyDeletions
        ? ['Consider stacking due to breadth of changes across subsystems.']
        : [],
  };
};

const defaultPublisher: PublisherAgent = ({ mode }) => {
  if (mode === 'plan') {
    return [];
  }
  return [];
};

function createDefaultAgents(): OrchestratorAgents {
  return {
    historian: defaultHistorian,
    pruner: defaultPruner,
    decomposer: defaultDecomposer,
    rewriter: defaultRewriter,
    tester: defaultTester,
    runner: defaultRunner,
    critic: defaultCritic,
    publisher: defaultPublisher,
  };
}

const defaultDependencies: OrchestratorDependencies = {
  tools: {
    github,
    gitLocal,
    astDiff,
    formatLint,
    testRunner,
    mutationTester,
  },
  agents: createDefaultAgents(),
  logger: defaultLogger,
};

function deriveGroupKey(filename: string): string {
  const segments = filename.split('/');
  if (segments.length === 1) {
    return segments[0];
  }
  return `${segments[0]}/${segments[1] ?? ''}`.replace(/\/$/, '');
}

function inferTestForFile(filename: string): string {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
    return `npm test -- ${filename}`;
  }
  if (filename.endsWith('.py')) {
    return `pytest ${filename}`;
  }
  return `review ${filename}`;
}
