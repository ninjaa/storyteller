import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'storyteller-config-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns empty config when file missing', async () => {
    const { path: resolvedPath, config } = await loadConfig({ cwd: workspace });
    expect(resolvedPath).toBeNull();
    expect(config).toEqual({});
  });

  it('parses provided yaml file', async () => {
    const configPath = path.join(workspace, 'storyteller.yaml');
    await writeFile(
      configPath,
      `gating:\n  maxFilesPerPR: 25\nstacking:\n  enabled: true\n`,
      'utf8',
    );

    const { path: resolvedPath, config } = await loadConfig({ cwd: workspace });
    expect(resolvedPath).toBe(configPath);
    expect(config.gating?.maxFilesPerPR).toBe(25);
    expect(config.stacking?.enabled).toBe(true);
  });

  it('prefers explicit file argument', async () => {
    const configPath = path.join(workspace, 'custom.yaml');
    await writeFile(configPath, 'models:\n  coder: gpt-5-codex\n', 'utf8');

    const { path: resolvedPath, config } = await loadConfig({ cwd: workspace, file: configPath });
    expect(resolvedPath).toBe(configPath);
    expect(config.models?.coder).toBe('gpt-5-codex');
  });
});
