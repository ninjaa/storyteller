import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { testRunner } from '../../src/index.js';

let workspace: string;

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'storyteller-test-runner-'));
  await fs.writeFile(
    path.join(workspace, 'package.json'),
    JSON.stringify({
      name: 'workspace',
      version: '0.0.0',
      scripts: { test: 'echo "ok"' },
      devDependencies: { typescript: '^5.0.0' },
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(workspace, 'pyproject.toml'),
    '[project]\ndependencies = ["pytest"]\n',
    'utf8',
  );
  await fs.mkdir(path.join(workspace, 'tests'), { recursive: true });
  await fs.writeFile(
    path.join(workspace, 'tests', 'example_test.py'),
    'def test_something():\n    assert True\n',
    'utf8',
  );
});

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('TestRunnerAdapter', () => {
  it('detects languages and commands', async () => {
    const detection = await testRunner.detect({ workdir: workspace });
    expect(detection.languages).toEqual(expect.arrayContaining(['js', 'ts', 'py']));
    expect(detection.testCommands).toEqual(
      expect.arrayContaining(['npm test --silent', 'pytest -q']),
    );
  });

  it('runs commands inside workspace', async () => {
    const result = await testRunner.run({ workdir: workspace, command: "printf 'hello'" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
