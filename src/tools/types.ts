export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PullRequestIdentifier extends RepoRef {
  prNumber: number;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  author: {
    login: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: {
    name: string | null;
    email: string | null;
    login?: string | null;
  };
  committedDate: string | null;
}

export interface FileSummary {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed';
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
}

export interface CheckSummary {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl?: string | null;
}

export interface DiffSummary {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface PullRequestContext {
  pr: PullRequestSummary;
  commits: CommitSummary[];
  diffSummary: DiffSummary;
  ci: {
    checks: CheckSummary[];
  };
  files: FileSummary[];
  languages: string[];
  testCommands: string[];
  repoPaths: {
    workdir: string | null;
  };
}

export interface CloneRequest {
  repoUrl: string;
  ref?: string;
  depth?: number;
}

export interface CloneResult {
  workdir: string;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ApplyPatchRequest {
  workdir: string;
  patch: string;
  strip?: number;
}

export interface StageRequest {
  workdir: string;
  paths: string[];
}

export interface CommitRequest {
  workdir: string;
  message: string;
  allowEmpty?: boolean;
}

export interface BranchRequest {
  workdir: string;
  name: string;
  from?: string;
  force?: boolean;
}

export interface CheckoutRequest {
  workdir: string;
  ref: string;
}

export interface CherryPickRequest {
  workdir: string;
  sha: string;
  strategyOption?: string;
}

export interface RebaseInteractiveRequest {
  workdir: string;
  baseRef: string;
  script: string;
  autosquash?: boolean;
}

export interface DiffRequest {
  workdir: string;
  from?: string;
  to?: string;
  path?: string;
  unified?: number;
}

export interface StatusSummary {
  branch: string;
  ahead: number;
  behind: number;
  changes: Array<{
    path: string;
    worktreeStatus: string;
    indexStatus: string;
  }>;
}

export interface DiffResult {
  patch: string;
}

export interface GitStatusResult {
  status: StatusSummary;
}

export interface SemanticDiffRequest {
  before: string;
  after: string;
  language: string;
  filePath?: string;
}

export type SemanticChangeType = 'insert' | 'delete' | 'update';

export interface SemanticChange {
  type: SemanticChangeType;
  symbol: string;
  detail: string;
  location?: {
    line: number;
    column: number;
  };
}

export interface SemanticDiffResponse {
  language: string;
  changes: SemanticChange[];
}

export interface SplitPatchRequest {
  patch: string;
  language: string;
  strategy?: 'symbol' | 'hunk';
}

export interface SplitPatchResponse {
  chunks: string[];
}

export interface FormatRequest {
  workdir: string;
  files: string[];
}

export interface FormatResult {
  formatted: string[];
  skipped: string[];
}

export interface LintRequest {
  workdir: string;
  files: string[];
  fix?: boolean;
}

export interface LintResult {
  errors: number;
  warnings: number;
}

export interface DetectRequest {
  workdir: string;
}

export interface DetectResponse {
  languages: string[];
  testCommands: string[];
}

export interface TestRunRequest {
  workdir: string;
  command: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface MutationRunRequest {
  workdir: string;
  command: string;
  timeoutMs?: number;
}

export interface MutationRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface MutationSummary {
  killed?: number;
  survived?: number;
  total?: number;
  score?: number;
}

export interface MutationTesterResponse extends MutationRunResult {
  summary?: MutationSummary;
}

export interface OpenPullRequestRequest extends RepoRef {
  head: string;
  base: string;
  title: string;
  body: string;
  draft?: boolean;
}

export interface OpenPullRequestResponse {
  number: number;
  url: string;
}

export interface UpdatePullRequestRequest extends RepoRef {
  number: number;
  base?: string;
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  draft?: boolean;
}

export interface CreateBranchRequest extends RepoRef {
  name: string;
  from: string;
  force?: boolean;
}

export interface PushBranchRequest extends RepoRef {
  ref: string;
  sha: string;
  force?: boolean;
}

export type ListCommitsRequest = PullRequestIdentifier;

export type ListFilesRequest = PullRequestIdentifier;
