import { execa } from 'execa';
import type { Options } from 'execa';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  input?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCommand(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { cwd, env, timeoutMs, input } = options;
  const execaOptions = {
    cwd,
    env,
    reject: false,
    all: false,
    stripFinalNewline: false,
    ...(typeof timeoutMs === 'number' ? { timeout: timeoutMs } : {}),
    ...(input !== undefined ? { input } : {}),
  } satisfies Options;

  const subprocess = execa(command, args, execaOptions);

  const { exitCode, stdout, stderr } = await subprocess;
  return { exitCode: exitCode ?? -1, stdout, stderr };
}
