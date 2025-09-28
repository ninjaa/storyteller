export const STORYTELLER_VERSION = '0.1.0';

export const STORYTELLER_DESCRIPTION =
  'Storyteller rewrites GitHub pull requests into literate, atomic histories.';

export { GitHubAdapter, github } from './tools/github.js';
export { GitLocalAdapter, gitLocal } from './tools/gitLocal.js';
export { AstDiffAdapter, astDiff } from './tools/astDiff.js';
export { FormatLintAdapter, formatLint } from './tools/formatLint.js';
export { TestRunnerAdapter, testRunner } from './tools/testRunner.js';
export { MutationTesterAdapter, mutationTester } from './tools/mutationTester.js';
export * from './tools/types.js';
export * from './orchestrator.js';
