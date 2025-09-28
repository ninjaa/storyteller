import { performance } from 'node:perf_hooks';
import { runCommand } from '../utils/exec.js';
import type { MutationRunRequest, MutationTesterResponse, MutationSummary } from './types.js';

export class MutationTesterAdapter {
  async run(request: MutationRunRequest): Promise<MutationTesterResponse> {
    const start = performance.now();
    const result = await runCommand('bash', ['-lc', request.command], {
      cwd: request.workdir,
      timeoutMs: request.timeoutMs,
    });
    const durationMs = performance.now() - start;
    const summary = this.parseSummary(`${result.stdout}\n${result.stderr}`);

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      summary,
    };
  }

  async stryker(
    request: Omit<MutationRunRequest, 'command'> & { command?: string },
  ): Promise<MutationTesterResponse> {
    const command = request.command ?? 'npx stryker run';
    return this.run({ ...request, command });
  }

  async mutmut(
    request: Omit<MutationRunRequest, 'command'> & { command?: string },
  ): Promise<MutationTesterResponse> {
    const command = request.command ?? 'mutmut run';
    return this.run({ ...request, command });
  }

  private parseSummary(output: string): MutationSummary | undefined {
    const killed = this.findFirstNumber(output, [
      /Killed mutants?:\s*(\d+)/i,
      /(\d+)\s+mutants?\s+killed/i,
    ]);
    const survived = this.findFirstNumber(output, [
      /Survived mutants?:\s*(\d+)/i,
      /(\d+)\s+mutants?\s+survived/i,
    ]);
    const total = this.findFirstNumber(output, [
      /Total mutants?:\s*(\d+)/i,
      /(\d+)\s+mutants?\s+generated/i,
    ]);
    const score = this.findFirstNumber(output, [
      /Mutation score:?\s*(\d+(?:\.\d+)?)/i,
      /Score of\s*(\d+(?:\.\d+)?)/i,
    ]);

    if (
      killed === undefined &&
      survived === undefined &&
      total === undefined &&
      score === undefined
    ) {
      return undefined;
    }

    return { killed, survived, total, score };
  }

  private findFirstNumber(output: string, patterns: RegExp[]): number | undefined {
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const numericValue = Number(match[1]);
        if (!Number.isNaN(numericValue)) {
          return numericValue;
        }
      }
    }
    return undefined;
  }
}

export const mutationTester = new MutationTesterAdapter();
