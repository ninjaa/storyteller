import { Command, InvalidArgumentError } from 'commander';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from '../config.js';
import type { StorytellerYaml } from '../types/config.js';
import {
  STORYTELLER_DESCRIPTION,
  STORYTELLER_VERSION,
  rewritePR,
  type RewritePRInput,
  type RewritePROutput,
} from '../index.js';

export interface CLIContext {
  rewrite: (input: RewritePRInput) => Promise<RewritePROutput>;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  now: () => Date;
}

const defaultContext: CLIContext = {
  rewrite: rewritePR,
  stdout: process.stdout,
  stderr: process.stderr,
  now: () => new Date(),
};

export async function runCLI(argv: string[], context: CLIContext = defaultContext): Promise<void> {
  const program = new Command();
  program
    .name('storyteller')
    .description(STORYTELLER_DESCRIPTION)
    .version(STORYTELLER_VERSION, '-v, --version', 'output the current version')
    .configureOutput({
      writeOut: (str) => {
        context.stdout.write(str);
      },
      writeErr: (str) => {
        context.stderr.write(str);
      },
      outputError: (str, write) => {
        write(str);
      },
    })
    .exitOverride();

  program
    .command('rewrite')
    .description('Generate a storyteller rewrite plan for a pull request')
    .requiredOption('--repo <owner/repo>', 'GitHub repository identifier')
    .requiredOption('--pr <number>', 'Pull request number', parseInteger)
    .option('--mode <mode>', 'Execution mode: plan | apply', 'plan')
    .option('--stack', 'Force stacked PR publishing')
    .option('--no-stack', 'Disable stacked PR publishing')
    .option('--test <command...>', 'Additional acceptance test command(s)', [])
    .option('--max-files-per-pr <number>', 'Override gating threshold', parseInteger)
    .option('--config <file>', 'Path to storyteller config (yaml)')
    .option('--job-id <id>', 'Override generated job id')
    .action(async (options: RewriteCommandOptions) => {
      const { config, path: configPath } = await loadConfig({ file: options.config });
      const jobId = options.jobId ?? `storyteller-${context.now().toISOString()}`;

      const mode = validateMode(options.mode);
      const stack = resolveStack(options, config);
      const maxFilesPerPR = options.maxFilesPerPr ?? config.gating?.maxFilesPerPR;
      const tests = Array.from(new Set(options.test ?? []));

      const input: RewritePRInput = {
        jobId,
        repo: options.repo,
        pr: options.pr,
        mode,
        stack,
        tests,
        maxFilesPerPR,
      };

      try {
        const result = await context.rewrite(input);
        const payload = {
          jobId: result.jobId,
          configPath,
          plan: result.plan,
          publishedPRs: result.publishedPRs,
        };
        context.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } catch (unknownError) {
        const message = unknownError instanceof Error ? unknownError.message : String(unknownError);
        context.stderr.write(`${message}\n`);
        throw unknownError;
      }
    });

  await program.parseAsync(argv);
}

interface RewriteCommandOptions {
  repo: string;
  pr: number;
  mode: string;
  stack?: boolean;
  test?: string[];
  maxFilesPerPr?: number;
  config?: string;
  jobId?: string;
}

function resolveStack(
  options: Pick<RewriteCommandOptions, 'stack'>,
  config: StorytellerYaml,
): boolean | undefined {
  if (typeof options.stack === 'boolean') {
    return options.stack;
  }
  if (config.stacking && typeof config.stacking.enabled === 'boolean') {
    return config.stacking.enabled;
  }
  return undefined;
}

function parseInteger(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`Expected integer but received '${raw}'`);
  }
  return parsed;
}

function validateMode(mode: string): 'plan' | 'apply' {
  if (mode === 'plan' || mode === 'apply') {
    return mode;
  }
  throw new InvalidArgumentError(`Invalid mode '${mode}'. Expected 'plan' or 'apply'.`);
}

export async function main(): Promise<void> {
  try {
    await runCLI(process.argv);
  } catch {
    // Commander throws on exitOverride; ensure non-zero exit
    if (process.exitCode === 0) {
      process.exitCode = 1;
    }
  }
}

const invokedDirectly = (() => {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  const resolvedModulePath = fileURLToPath(import.meta.url);
  return path.resolve(entryPath) === resolvedModulePath;
})();

if (invokedDirectly) {
  void main();
}
