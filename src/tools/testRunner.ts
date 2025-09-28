import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import fg from 'fast-glob';
import toml from 'toml';
import { runCommand } from '../utils/exec.js';
import type { DetectRequest, DetectResponse, TestRunRequest, TestRunResult } from './types.js';

type JsonRecord = Record<string, unknown>;

export class TestRunnerAdapter {
  async detect(request: DetectRequest): Promise<DetectResponse> {
    const languages = new Set<string>();
    const commands = new Set<string>();

    await this.detectNodeProject(request.workdir, languages, commands);
    await this.detectPythonProject(request.workdir, languages, commands);

    const testFiles = await fg(['**/*.test.*', '**/*_test.*', '**/tests/**/*.py'], {
      cwd: request.workdir,
      ignore: ['node_modules/**', '.git/**', 'dist/**'],
      onlyFiles: true,
      suppressErrors: true,
      deep: 6,
    });

    for (const file of testFiles) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        languages.add('ts');
      } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.mjs')) {
        languages.add('js');
      } else if (file.endsWith('.py')) {
        languages.add('py');
      }
    }

    return {
      languages: Array.from(languages),
      testCommands: Array.from(commands),
    };
  }

  async run(request: TestRunRequest): Promise<TestRunResult> {
    const start = performance.now();
    const mergedEnv = { ...process.env, ...(request.env ?? {}) } as Record<string, string>;
    const result = await runCommand('bash', ['-lc', request.command], {
      cwd: request.workdir,
      env: mergedEnv,
      timeoutMs: request.timeoutMs,
    });
    const durationMs = performance.now() - start;

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
    };
  }

  private async detectNodeProject(
    workdir: string,
    languages: Set<string>,
    commands: Set<string>,
  ): Promise<void> {
    const packageJsonPath = path.join(workdir, 'package.json');
    if (!(await this.fileExists(packageJsonPath))) {
      return;
    }

    const content = await fs.readFile(packageJsonPath, 'utf8');
    try {
      const pkg = JSON.parse(content) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };

      languages.add('js');
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
        languages.add('ts');
      }

      const scripts = pkg.scripts ?? {};
      if (scripts.test) {
        commands.add('npm test --silent');
      }
      if (scripts['test:acceptance']) {
        commands.add('npm run test:acceptance');
      }
      if (scripts['test:e2e']) {
        commands.add('npm run test:e2e');
      }
    } catch (error) {
      console.warn('Failed to parse package.json', error);
    }

    const tsconfigPath = path.join(workdir, 'tsconfig.json');
    if (await this.fileExists(tsconfigPath)) {
      languages.add('ts');
    }
  }

  private async detectPythonProject(
    workdir: string,
    languages: Set<string>,
    commands: Set<string>,
  ): Promise<void> {
    const pyProjectPath = path.join(workdir, 'pyproject.toml');
    const requirementsPath = path.join(workdir, 'requirements.txt');
    let pytestReferenced = false;

    if (await this.fileExists(pyProjectPath)) {
      try {
        const content = await fs.readFile(pyProjectPath, 'utf8');
        const parsed = toml.parse(content);
        if (isRecord(parsed)) {
          const projectSection = getRecordValue(parsed, 'project');
          if (
            isRecord(projectSection) &&
            arrayIncludesPytest(getRecordValue(projectSection, 'dependencies'))
          ) {
            pytestReferenced = true;
          }
          const toolSection = getRecordValue(parsed, 'tool');
          if (isRecord(toolSection) && getRecordValue(toolSection, 'pytest') !== undefined) {
            pytestReferenced = true;
          }
        }
      } catch (error) {
        console.warn('Failed to parse pyproject.toml', error);
      }
    }

    if (!pytestReferenced && (await this.fileExists(requirementsPath))) {
      const requirements = await fs.readFile(requirementsPath, 'utf8');
      if (/pytest/i.test(requirements)) {
        pytestReferenced = true;
      }
    }

    if (pytestReferenced) {
      languages.add('py');
      commands.add('pytest -q');
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function getRecordValue(record: JsonRecord, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  return record[key];
}

function arrayIncludesPytest(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('pytest'));
}

export const testRunner = new TestRunnerAdapter();
