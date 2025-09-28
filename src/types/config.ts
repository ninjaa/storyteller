export interface StorytellerYaml {
  githubApp?: GithubAppConfig;
  models?: ModelsConfig;
  gating?: GatingConfig;
  mutation?: MutationConfig;
  commit?: CommitConfig;
  stacking?: StackingConfig;
}

export interface GithubAppConfig {
  appId?: string;
  privateKey?: string;
}

export interface ModelsConfig {
  coder?: string;
  critic?: string;
}

export interface GatingConfig {
  maxFilesPerPR?: number;
  suggestStackOverLoc?: number;
  requireMutationTesting?: string[];
}

export interface MutationConfig {
  [language: string]: MutationBudget | undefined;
}

export interface MutationBudget {
  cmd?: string;
  timeBudgetMins?: number;
  minKilled?: number;
}

export interface CommitConfig {
  style?: string;
  bodyTemplate?: string;
}

export interface StackingConfig {
  enabled?: boolean;
  mode?: 'native' | 'spr' | 'stack-pr';
}
