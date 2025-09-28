import { Octokit as CoreOctokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Buffer } from 'node:buffer';
import type { Endpoints } from '@octokit/types';
import type {
  CreateBranchRequest,
  ListCommitsRequest,
  ListFilesRequest,
  OpenPullRequestRequest,
  OpenPullRequestResponse,
  PullRequestContext,
  PullRequestIdentifier,
  PullRequestSummary,
  RepoRef,
  UpdatePullRequestRequest,
  PushBranchRequest,
  CommitSummary,
  FileSummary,
  CheckSummary,
} from './types.js';

const ExtendedOctokit = CoreOctokit.plugin(paginateRest, retry, throttling);

type Octokit = InstanceType<typeof ExtendedOctokit>;
type PullCommit =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/commits']['response']['data'][number];
type PullFileResponse =
  Endpoints['GET /repos/{owner}/{repo}/pulls/{pull_number}/files']['response']['data'][number];
type CommitStatus =
  Endpoints['GET /repos/{owner}/{repo}/commits/{ref}/statuses']['response']['data'][number];

export interface GitHubAdapterOptions {
  token?: string;
  appId?: string;
  installationId?: number;
  privateKey?: string;
  baseUrl?: string;
}

export class GitHubAdapter {
  private readonly options: GitHubAdapterOptions;
  private octokitPromise: Promise<Octokit> | null = null;

  constructor(options: GitHubAdapterOptions = {}) {
    this.options = options;
  }

  async getPRContext(request: PullRequestIdentifier): Promise<PullRequestContext> {
    const octokit = await this.getOctokit();
    const { owner, repo, prNumber } = request;

    const [{ data: pr }, commits, files, languages, checks] = await Promise.all([
      octokit.pulls.get({ owner, repo, pull_number: prNumber }),
      this.listCommitsInternal(octokit, request),
      this.listFilesInternal(octokit, request),
      this.listLanguages(octokit, { owner, repo }),
      this.collectChecks(octokit, { owner, repo, prNumber }),
    ]);

    const testCommands = await this.deriveTestCommands(octokit, { owner, repo, ref: pr.head.sha });

    let author: PullRequestSummary['author'] = null;
    if (hasLogin(pr.user)) {
      author = { login: pr.user.login };
    }

    const summary: PullRequestSummary = {
      number: pr.number,
      title: pr.title,
      state: pr.state === 'closed' ? 'closed' : 'open',
      merged: Boolean(pr.merged_at),
      head: { ref: pr.head.ref, sha: pr.head.sha },
      base: { ref: pr.base.ref, sha: pr.base.sha },
      author,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      draft: Boolean(pr.draft),
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    };

    return {
      pr: summary,
      commits,
      diffSummary: {
        additions: pr.additions,
        deletions: pr.deletions,
        filesChanged: pr.changed_files,
      },
      ci: { checks },
      files,
      languages,
      testCommands,
      repoPaths: {
        workdir: null,
      },
    };
  }

  async openPullRequest(request: OpenPullRequestRequest): Promise<OpenPullRequestResponse> {
    const octokit = await this.getOctokit();
    const response = await octokit.pulls.create({
      owner: request.owner,
      repo: request.repo,
      title: request.title,
      head: request.head,
      base: request.base,
      body: request.body,
      draft: request.draft,
    });

    return { number: response.data.number, url: response.data.html_url };
  }

  async updatePullRequest(request: UpdatePullRequestRequest): Promise<void> {
    const octokit = await this.getOctokit();
    await octokit.pulls.update({
      owner: request.owner,
      repo: request.repo,
      pull_number: request.number,
      base: request.base,
      body: request.body,
      title: request.title,
      state: request.state,
      draft: request.draft,
    });
  }

  async listCommits(request: ListCommitsRequest): Promise<CommitSummary[]> {
    const octokit = await this.getOctokit();
    return this.listCommitsInternal(octokit, request);
  }

  async listFiles(request: ListFilesRequest): Promise<FileSummary[]> {
    const octokit = await this.getOctokit();
    return this.listFilesInternal(octokit, request);
  }

  async createBranch(request: CreateBranchRequest): Promise<void> {
    const octokit = await this.getOctokit();
    const ref = `refs/heads/${request.name}`;
    const baseSha = await this.getCommitSha(octokit, request);

    try {
      await octokit.git.createRef({
        owner: request.owner,
        repo: request.repo,
        ref,
        sha: baseSha,
      });
    } catch (error) {
      if (request.force && this.isReferenceExists(error)) {
        await octokit.git.updateRef({
          owner: request.owner,
          repo: request.repo,
          ref: `heads/${request.name}`,
          sha: baseSha,
          force: true,
        });
        return;
      }
      throw error;
    }
  }

  async pushBranch(request: PushBranchRequest): Promise<void> {
    const octokit = await this.getOctokit();
    const refName = request.ref.startsWith('heads/') ? request.ref : `heads/${request.ref}`;
    await octokit.git.updateRef({
      owner: request.owner,
      repo: request.repo,
      ref: refName,
      sha: request.sha,
      force: request.force ?? false,
    });
  }

  private async listCommitsInternal(
    octokit: Octokit,
    request: ListCommitsRequest,
  ): Promise<CommitSummary[]> {
    const { owner, repo, prNumber } = request;
    const commits = await octokit.paginate<PullCommit>(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
      {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      },
    );

    return commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name ?? null,
        email: commit.commit.author?.email ?? null,
        login: commit.author?.login ?? null,
      },
      committedDate: commit.commit.author?.date ?? null,
    }));
  }

  private async listFilesInternal(
    octokit: Octokit,
    request: ListFilesRequest,
  ): Promise<FileSummary[]> {
    const { owner, repo, prNumber } = request;
    const files = await octokit.paginate<PullFileResponse>(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
      {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      },
    );

    return files.map((file) => this.mapFileSummary(file));
  }

  private mapFileSummary(file: PullFileResponse): FileSummary {
    const status = normalizeFileStatus(file.status);
    return {
      filename: file.filename,
      status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      previousFilename: file.previous_filename ?? undefined,
    };
  }

  private async listLanguages(octokit: Octokit, repoRef: RepoRef): Promise<string[]> {
    const { owner, repo } = repoRef;
    const { data } = await octokit.repos.listLanguages({ owner, repo });
    return Object.keys(data).map((language) => language.toLowerCase());
  }

  private async collectChecks(
    octokit: Octokit,
    request: PullRequestIdentifier,
  ): Promise<CheckSummary[]> {
    const { owner, repo, prNumber } = request;
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    const ref = pr.head.sha;

    const [checksResponse, statusesResponse] = await Promise.all([
      octokit.checks.listForRef({ owner, repo, ref, per_page: 100 }),
      octokit.repos.listCommitStatusesForRef({ owner, repo, ref, per_page: 100 }),
    ]);

    const checks: CheckSummary[] = checksResponse.data.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      detailsUrl: run.details_url,
    }));

    const statusesData: CommitStatus[] = statusesResponse.data;
    const statuses: CheckSummary[] = statusesData.map((status) => ({
      name: status.context,
      status: status.state,
      conclusion: status.state,
      detailsUrl: status.target_url,
    }));

    return [...checks, ...statuses];
  }

  private async deriveTestCommands(
    octokit: Octokit,
    request: { owner: string; repo: string; ref: string },
  ): Promise<string[]> {
    const commands = new Set<string>();

    const packageJson = await this.tryGetFile(octokit, {
      ...request,
      path: 'package.json',
    });

    if (packageJson) {
      try {
        const parsed = JSON.parse(packageJson) as {
          scripts?: Record<string, string>;
          devDependencies?: Record<string, string>;
          dependencies?: Record<string, string>;
        };
        const scripts = parsed.scripts ?? {};
        if (scripts.test) {
          commands.add('npm test --silent');
        }
        if (scripts['test:e2e']) {
          commands.add('npm run test:e2e');
        }
        if (scripts['test:acceptance']) {
          commands.add('npm run test:acceptance');
        }
      } catch (error) {
        console.warn('Failed to parse package.json for test commands', error);
      }
    }

    const workflow = await this.tryGetFile(octokit, {
      ...request,
      path: '.github/workflows/ci.yml',
    });

    if (workflow && workflow.includes('pytest')) {
      commands.add('pytest -q');
    }

    return Array.from(commands);
  }

  private async tryGetFile(
    octokit: Octokit,
    request: { owner: string; repo: string; ref: string; path: string },
  ): Promise<string | null> {
    try {
      const response = await octokit.repos.getContent(request);
      if (!('content' in response.data)) {
        return null;
      }
      const buffer = Buffer.from(response.data.content, 'base64');
      return buffer.toString('utf8');
    } catch {
      return null;
    }
  }

  private async getCommitSha(octokit: Octokit, request: CreateBranchRequest): Promise<string> {
    const { owner, repo, from } = request;
    const refName = from.startsWith('refs/') ? from : `heads/${from}`;
    const { data } = await octokit.git.getRef({ owner, repo, ref: refName });
    return data.object.sha;
  }

  private isReferenceExists(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
      return (error as { status: number }).status === 422;
    }
    return false;
  }

  private async getOctokit(): Promise<Octokit> {
    if (!this.octokitPromise) {
      this.octokitPromise = this.createOctokit();
    }
    return this.octokitPromise;
  }

  private async createOctokit(): Promise<Octokit> {
    const { token, baseUrl, appId, installationId, privateKey } = this.options;

    const resolvedToken = token ?? process.env.GITHUB_TOKEN;
    if (resolvedToken) {
      return new ExtendedOctokit({
        auth: resolvedToken,
        baseUrl,
        throttle: {
          onRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
          onSecondaryRateLimit: (_retryAfter, options) => {
            console.warn(`Secondary rate limit for ${options.method} ${options.url}`);
          },
        },
      });
    }

    if (appId && installationId && privateKey) {
      const auth = createAppAuth({ appId, privateKey, installationId });
      const installationAuthentication = await auth({ type: 'installation' });
      return new ExtendedOctokit({
        auth: installationAuthentication.token,
        baseUrl,
      });
    }

    throw new Error('GitHub credentials are not configured. Provide a token or App credentials.');
  }
}

export const github = new GitHubAdapter();

function hasLogin(value: unknown): value is { login: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { login?: unknown }).login === 'string'
  );
}

function normalizeFileStatus(status?: string): FileSummary['status'] {
  const allowed: FileSummary['status'][] = [
    'added',
    'removed',
    'modified',
    'renamed',
    'copied',
    'changed',
  ];
  if (status && allowed.includes(status as FileSummary['status'])) {
    return status as FileSummary['status'];
  }
  return 'changed';
}
