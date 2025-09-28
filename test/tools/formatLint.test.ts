import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatLint } from '../../src/index.js';

const workspace = path.join(process.cwd(), 'test', 'tmp-format-workspace');

beforeAll(async () => {
  await fs.mkdir(workspace, { recursive: true });
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('FormatLintAdapter', () => {
  it('formats files using Prettier and lints with ESLint', async () => {
    const sourcePath = path.join(workspace, 'example.ts');
    await fs.writeFile(sourcePath, 'const foo=[1,2]\nconsole.log(foo.length)\n');

    const formatResult = await formatLint.format({ workdir: workspace, files: ['example.ts'] });
    expect(formatResult.formatted).toContain('example.ts');

    const formattedContent = await fs.readFile(sourcePath, 'utf8');
    expect(formattedContent).toContain('const foo = [1, 2];');
    expect(formattedContent).toContain('console.log(foo.length);');

    const lintResult = await formatLint.lint({ workdir: workspace, files: ['example.ts'] });
    expect(lintResult.errors).toBe(0);
  });
});
