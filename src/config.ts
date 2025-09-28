import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import type { StorytellerYaml } from './types/config.js';

export interface LoadConfigOptions {
  cwd?: string;
  file?: string;
}

export interface LoadedConfig {
  path: string | null;
  config: StorytellerYaml;
}

const DEFAULT_CONFIG_FILENAMES = ['storyteller.yaml', 'storyteller.yml'];

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = options.cwd ?? process.cwd();

  const candidatePaths = options.file
    ? [path.isAbsolute(options.file) ? options.file : path.join(cwd, options.file)]
    : DEFAULT_CONFIG_FILENAMES.map((filename) => path.join(cwd, filename));

  for (const candidate of candidatePaths) {
    try {
      const content = await fs.readFile(candidate, 'utf8');
      const parsed = parseYaml(content, candidate);
      return { path: candidate, config: parsed };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  return { path: null, config: {} };
}

function parseYaml(content: string, source: string): StorytellerYaml {
  const doc = yaml.parse(content, { prettyErrors: true }) as unknown;
  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid configuration in ${source}: expected mapping`);
  }
  return doc as StorytellerYaml;
}
