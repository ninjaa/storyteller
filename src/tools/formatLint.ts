import { promises as fs } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { ESLint } from 'eslint';
import type { FormatRequest, FormatResult, LintRequest, LintResult } from './types.js';

const ROOT_CONFIG = path.resolve(process.cwd(), 'eslint.config.js');

export class FormatLintAdapter {
  async format(request: FormatRequest): Promise<FormatResult> {
    const formatted: string[] = [];
    const skipped: string[] = [];

    for (const file of request.files) {
      const absolutePath = path.resolve(request.workdir, file);
      try {
        const info = await prettier.getFileInfo(absolutePath, {
          ignorePath: path.join(request.workdir, '.prettierignore'),
        });
        if (info.ignored || !info.inferredParser) {
          skipped.push(file);
          continue;
        }

        const content = await fs.readFile(absolutePath, 'utf8');
        const resolved = await prettier.resolveConfig(absolutePath);
        const formattedContent = await prettier.format(content, {
          ...resolved,
          filepath: absolutePath,
        });

        if (formattedContent !== content) {
          await fs.writeFile(absolutePath, formattedContent, 'utf8');
        }
        formatted.push(file);
      } catch {
        skipped.push(file);
      }
    }

    return { formatted, skipped };
  }

  async lint(request: LintRequest): Promise<LintResult> {
    if (!request.files.length) {
      return { errors: 0, warnings: 0 };
    }

    const projectRoot = process.cwd();
    const eslint = new ESLint({
      cwd: projectRoot,
      overrideConfigFile: ROOT_CONFIG,
      fix: request.fix ?? false,
      errorOnUnmatchedPattern: false,
    });

    const absoluteFiles = request.files.map((file) => path.resolve(request.workdir, file));
    const results = await eslint.lintFiles(absoluteFiles);

    if (request.fix) {
      await ESLint.outputFixes(results);
    }

    const errors = results.reduce((total, result) => total + result.errorCount, 0);
    const warnings = results.reduce((total, result) => total + result.warningCount, 0);

    return { errors, warnings };
  }
}

export const formatLint = new FormatLintAdapter();
