import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type {
  ApplyPatchRequest,
  BranchRequest,
  CheckoutRequest,
  CherryPickRequest,
  CloneRequest,
  CloneResult,
  CommitRequest,
  DiffRequest,
  DiffResult,
  GitCommandResult,
  GitStatusResult,
  RebaseInteractiveRequest,
  StageRequest,
  StatusSummary,
} from './types.js';
import { runCommand } from '../utils/exec.js';

export class GitLocalAdapter {
  async clone(request: CloneRequest): Promise<CloneResult> {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-'));
    const workdir = path.join(baseDir, 'repo');

    const args = ['clone', '--origin', 'origin', '--config', 'advice.detachedHead=false'];
    if (typeof request.depth === 'number') {
      args.push('--depth', String(request.depth), '--single-branch');
    }
    args.push(request.repoUrl, workdir);

    const cloneResult = await runCommand('git', args, { cwd: baseDir });
    if (cloneResult.exitCode !== 0) {
      throw new Error(`Failed to clone repository: ${cloneResult.stderr}`);
    }

    if (request.ref) {
      const checkoutResult = await this.checkout({ workdir, ref: request.ref });
      if (checkoutResult.exitCode !== 0) {
        throw new Error(`Failed to checkout '${request.ref}': ${checkoutResult.stderr}`);
      }
    }

    return { workdir };
  }

  async checkout(request: CheckoutRequest): Promise<GitCommandResult> {
    return runCommand('git', ['checkout', request.ref], { cwd: request.workdir });
  }

  async createBranch(request: BranchRequest): Promise<GitCommandResult> {
    const args = ['checkout', request.force ? '-B' : '-b', request.name];
    if (request.from) {
      args.push(request.from);
    }
    return runCommand('git', args, { cwd: request.workdir });
  }

  async applyPatch(request: ApplyPatchRequest): Promise<GitCommandResult> {
    const stripArgs = typeof request.strip === 'number' ? ['-p', String(request.strip)] : [];
    return runCommand('git', ['apply', '--whitespace=nowarn', ...stripArgs], {
      cwd: request.workdir,
      input: request.patch,
    });
  }

  async stage(request: StageRequest): Promise<GitCommandResult> {
    return runCommand('git', ['add', '--', ...request.paths], { cwd: request.workdir });
  }

  async commit(request: CommitRequest): Promise<GitCommandResult> {
    const args = ['commit', '--message', request.message];
    if (request.allowEmpty) {
      args.push('--allow-empty');
    }
    return runCommand('git', args, { cwd: request.workdir });
  }

  async cherryPick(request: CherryPickRequest): Promise<GitCommandResult> {
    const args = ['cherry-pick', request.sha];
    if (request.strategyOption) {
      args.push(`--strategy-option=${request.strategyOption}`);
    }
    return runCommand('git', args, { cwd: request.workdir });
  }

  async rebaseInteractive(request: RebaseInteractiveRequest): Promise<GitCommandResult> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-rebase-'));
    const editorScriptPath = path.join(tempDir, 'sequence-editor.sh');
    const scriptContent = `#!/bin/sh\ncat <<'__STORYTELLER_TODO__' > "$1"\n${request.script}\n__STORYTELLER_TODO__\n`;
    await fs.writeFile(editorScriptPath, scriptContent, { mode: 0o755 });

    const args = ['rebase', '-i'];
    if (request.autosquash !== false) {
      args.push('--autosquash');
    }
    args.push(request.baseRef);

    const env = {
      ...process.env,
      GIT_SEQUENCE_EDITOR: editorScriptPath,
    } as Record<string, string>;

    try {
      return await runCommand('git', args, { cwd: request.workdir, env });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async diff(request: DiffRequest): Promise<DiffResult> {
    const args = ['diff'];
    if (typeof request.unified === 'number') {
      args.push('-U' + String(request.unified));
    }

    if (request.from && request.to) {
      args.push(`${request.from}..${request.to}`);
    } else if (request.from) {
      args.push(request.from);
    } else if (request.to) {
      args.push(request.to);
    }

    if (request.path) {
      args.push('--', request.path);
    }

    const result = await runCommand('git', args, { cwd: request.workdir });
    return { patch: result.stdout };
  }

  async status(workdir: string): Promise<GitStatusResult> {
    const result = await runCommand('git', ['status', '--short', '--branch'], { cwd: workdir });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'git status failed');
    }

    return { status: this.parseStatus(result.stdout) };
  }

  async revParse(workdir: string, ref: string): Promise<string> {
    const result = await runCommand('git', ['rev-parse', ref], { cwd: workdir });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to resolve ref '${ref}'`);
    }
    return result.stdout.trim();
  }

  private parseStatus(statusOutput: string): StatusSummary {
    const lines = statusOutput.split('\n').filter(Boolean);
    const branchLine = lines.shift() ?? '';
    const branchTokens = branchLine.split(' ');
    const branchInfo = branchTokens.length > 1 ? branchTokens[1] : undefined;
    const [branchName, tracking] = branchInfo ? branchInfo.split('...') : ['unknown', undefined];

    const aheadMatch = statusOutput.match(/ahead (\d+)/);
    const behindMatch = statusOutput.match(/behind (\d+)/);

    const changes = lines.map((line) => {
      const indexStatus = line.length > 0 ? line[0] : ' ';
      const worktreeStatus = line.length > 1 ? line[1] : ' ';
      const changePath = line.slice(3).trim();
      return { indexStatus, worktreeStatus, path: changePath };
    });

    const normalizedBranch = branchName ? branchName : 'unknown';
    const behind = tracking ? (behindMatch ? Number(behindMatch[1]) : 0) : 0;

    return {
      branch: normalizedBranch,
      ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
      behind,
      changes,
    };
  }
}

export const gitLocal = new GitLocalAdapter();
