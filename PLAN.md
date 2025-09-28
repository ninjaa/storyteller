Below is a single **omnibus Markdown spec** for **Storyteller**—ready for you to hand to **GPT‑5‑Codex** (plus a small coordinator using GPT‑5 for the critic). It contains system prompts, tool schemas, config, CLI contract, gating rubric, and templates. Defaults are set to your “yes to all” answers.

---

# Storyteller — Multi‑Agent PR Historian & Rewriter

**Goal:** Given a (private) GitHub Pull Request, produce a reviewer‑friendly, *literate* history:

* prune dead ends,
* split into **atomic commits**,
* write clear commit messages + a literate PR description,
* propose/publish **stacked PRs** when helpful,
* and add **acceptance tests** (with minimal unit tests) so every commit is green.
* gate via an **actor‑critic** structure (writer vs. QA critic).

**Tech:** OpenAI **Agents SDK** orchestrating multiple agents; **GPT‑5‑Codex** for coding/editing agents; **GPT‑5** for prose‑heavy critique. (See Agents SDK & model docs.) ([OpenAI Platform][1])

<br>

---

## Table of Contents

1. [Architecture & Workflow](#architecture--workflow)
2. [Agent Roster & System Prompts](#agent-roster--system-prompts)
3. [Tool Schemas (MCP/agents “tools”)](#tool-schemas-mcpagents-tools)
4. [Rubrics & Gates](#rubrics--gates)
5. [Config: `storyteller.yaml`](#config-storytelleryaml)
6. [CLI Contract](#cli-contract)
7. [Templates (Commits, PR body, Reviewer’s Map)](#templates-commits-pr-body-reviewers-map)
8. [Heuristics: Pruning, Decomposition, Stacking](#heuristics-pruning-decomposition-stacking)
9. [Mutation Testing Budget (JS/TS, Python)](#mutation-testing-budget-jsts-python)
10. [Operational Notes (Security, Observability)](#operational-notes-security-observability)
11. [Appendix A: Example Gnarly PRs to Practice On](#appendix-a-example-gnarly-prs-to-practice-on)
12. [Appendix B: References](#appendix-b-references)

<br>

---

## Architecture & Workflow

```
GitHub webhook  ──► Orchestrator (Director)
                        │
                        ├─► Ingestion (PR graph, diffs, CI)
                        ├─► Historian (story, failed paths)
                        ├─► Pruner (drop dead ends)
                        ├─► Decomposer (atomic plan)
                        ├─► Rewriter (semantic commits + messages)
                        ├─► Test Writer (acceptance + minimal unit)
                        ├─► Runner (per-commit: fmt/lint/build/test)
                        ├─► QA Critic (actor-critic gate)
                        └─► Publisher (single or stacked PRs)
```

**Core ideas**

* **AST-aware** diffs and splits (tree‑sitter/diffsitter) to separate semantics from formatting. ([Tree-sitter][2])
* **Conventional Commits** for clear, searchable history. ([Conventional Commits][3])
* **Rebase with `--autosquash`** to fold fixups. ([Git][4])
* **Stacked PRs** when diff is large or concerns separable threads; optionally automate via `git spr` / `stack-pr`. ([GitHub Docs][5])

<br>

---

## Agent Roster & System Prompts

> **Model policy:**
>
> * **Codex agents:** use `gpt-5-codex`. Keep prompts **minimal** (Codex prompting guide). Prefer tool calls, avoid prose preambles. ([OpenAI Cookbook][6])
> * **Critic & Director:** use `gpt-5`.

Each agent has:

* **System prompt** (succinct, action‑oriented).
* **Expected input / output contracts.**
* **Allowed tools**.

> **Note:** The Orchestrator routes data and composes calls. Sub‑agents should **only** return JSON or tool calls.

### 1) Orchestrator (Director) — *GPT‑5*

**System prompt**

```
You are the Director coordinating specialist agents to transform a messy GitHub PR
into a literate, reviewable, correct history. Objectives: preserve behavior, maximize
readability and atomicity, keep every commit green. Prefer smaller changes and stacked PRs
when beneficial. Use only registered tools and sub‑agents. Produce an explicit plan first,
then execute. Gate publishing on QA Critic pass and CI green.
```

**Inputs:** `{ repo, prNumber, mode: "plan"|"apply", stack: boolean, tests: string[], maxFilesPerPR }`
**Outputs:** `{ plan, artifacts[], publishedPRs[] }`
**Tools:** all tools; all sub‑agents as “agents‑as‑tools”.

---

### 2) Ingestion — *GPT‑5‑Codex*

**System prompt**

```
Gather PR context. Call tools to fetch:
- PR metadata, head/base, files, commits, comments, statuses/checks.
- Clone repo (read-only), detect languages and test commands.
Return PRContext (no prose).
```

**Output (PRContext):**

```json
{
  "pr": {...}, "commits": [...], "diffSummary": {...},
  "ci": {...}, "files": [...],
  "languages": ["ts","py"], "testCommands": ["pytest -q","npm test --silent"],
  "repoPaths": {"workdir": "..."}
}
```

**Tools:** `github`, `gitLocal`.

---

### 3) Historian — *GPT‑5*

**System prompt**

```
Infer the story behind this PR. Identify problem, constraints, false starts, and the
final approach. Summarize risks and rollback. Mark "dead-end" commits (e.g., later
reverted or overwritten). Keep output structured; no code edits.
```

**Output (StoryDraft):**

```json
{
  "problem": "...",
  "attempted_paths": [{"summary":"...","commits":["abc","def"]}],
  "decision": "...",
  "risks": ["..."],
  "rollback": "..."
}
```

---

### 4) Pruner — *GPT‑5‑Codex*

**System prompt**

```
Propose a keep/drop list. Keep only commits necessary to the final approach.
Move lessons from dropped commits into notes for the PR description (not history).
Do not perform changes; return KeepPlan.
```

**Output (KeepPlan):**

```json
{
  "keep_commits": ["..."],
  "drop_commits": ["..."],
  "notes_for_pr": ["Lesson: ...", "Trade-off: ..."]
}
```

---

### 5) Decomposer — *GPT‑5‑Codex*

**System prompt**

```
Decompose the final change set into atomic steps (commit plan).
Each step is coherent, testable, and reversible. Prefer smaller steps.
Assign files and intent, and propose tests per step.
```

**Output (AtomicPlan):**

```json
{
  "steps": [
    {
      "title": "feat(router): extract interface X",
      "intent": "Introduce interface for Y to decouple Z",
      "files": ["src/router/*.ts"],
      "tests": ["acceptance: ...", "unit: ..."],
      "risk": "low"
    }
  ]
}
```

---

### 6) Rewriter — *GPT‑5‑Codex*

**System prompt**

```
Create a new branch from base and recreate the changes as the planned sequence of
atomic commits. Use AST-aware chunking to avoid formatting noise. Enforce Conventional
Commits for messages. Use 'rebase -i --autosquash' to fixup incidental commits.
Return commit SHAs and branch names, no prose.
```

**Tools:** `gitLocal`, `astDiff`, `formatLint`.
**Notes:** Conventional Commits spec for messages. ([Conventional Commits][3])
**Autosquash reference.** ([Git][4])

**Output:**

```json
{
  "branch": "storyteller/rewrite/pr-123/ch1",
  "commits": [{"sha":"...","message":"type(scope): summary"}, ...]
}
```

---

### 7) Test Writer — *GPT‑5‑Codex*

**System prompt**

```
Author acceptance tests (and minimal unit tests) that:
- Fail on base (pre-change) and pass post-change.
- Assert observable behavior (I/O, invariants), not internals.
For JS/TS and Python, prepare a small mutation-test job.
Return a patch or staged changes; no prose.
```

**Tools:** `testRunner`, `mutationTester`, `gitLocal`.

---

### 8) Runner — *GPT‑5‑Codex*

**System prompt**

```
For each commit on the rewrite branch: run format, lint, build, and tests.
If a step fails, report back to Rewriter or Test Writer with minimal diagnostics.
Aggregate results for QA Critic. Return machine-readable results.
```

**Tools:** `formatLint`, `testRunner`.

---

### 9) QA Critic (Actor‑Critic) — *GPT‑5*

**System prompt**

```
Evaluate against the rubric. Refuse publish if any required score < threshold.
Return a verdict and actionable, terse reasons (bulleted JSON).
Focus on: Atomicity, Conventional Commits compliance, Reviewability, Literate clarity,
and Test Non‑Vacuity (incl. mutation test summary where applicable).
```

**Output:**

```json
{
  "scores": { "atomicity":4, "commits":"pass", "reviewability":4, "literate":5, "tests":4 },
  "required_pass": true,
  "notes": ["Split step 3: mixed refactor+feature"]
}
```

---

### 10) Publisher — *GPT‑5*

**System prompt**

```
Publish either a single PR or a stacked set:
- Create storyteller/* branches and PRs.
- For stacks, set base branches to chain PRs and add "Depends on #NNN".
- Post a literate PR description with a Reader’s Map and Review Checklist.
Return the URLs/IDs of the created PR(s).
```

**Tools:** `github`, `gitLocal`.
**Stacking reference (base changes/tools).** ([GitHub Docs][5])

<br>

---

## Tool Schemas (MCP/agents “tools”)

> Implement these as MCP servers or direct tool bindings. Names are illustrative; keep descriptions **concise** for Codex (per prompting guide). ([OpenAI Cookbook][6])

### `github` (GitHub App / REST+GraphQL)

* `getPRContext({repo, prNumber}) -> PRContext`
* `openPR({repo, head, base, title, body}) -> {number, url}`
* `updatePR({repo, number, base?, title?, body?})`
* `listCommits({repo, prNumber}) -> Commit[]`
* `listFiles({repo, prNumber}) -> File[]`
* `createBranch({repo, fromRef, name})`
* `pushBranch({repo, branch, refspec?})`

### `gitLocal` (executes in an ephemeral workspace)

* `clone({repoUrl, ref}) -> {workdir}`
* `checkout({ref})`
* `createBranch({name, from})`
* `applyPatch({unifiedDiff})`
* `stage({paths})`
* `commit({message}) -> {sha}`
* `cherryPick({sha})`
* `rebaseInteractive({script, autosquash:true})`
* `diff({from,to, path?}) -> {patch}`
* `status()`, `revParse({ref})`
* **(rare)** `filterRepo({...})` for surgical history ops (backed by `git-filter-repo`). ([GitHub][7])

### `astDiff`

* `semanticDiff({fileBefore, fileAfter, language}) -> ASTChanges`
* `splitPatchBySymbol({patch, language, strategy}) -> Patch[]`

  * Implement via **tree‑sitter** parsers; diffsitter is a good reference. ([Tree-sitter][2])

### `formatLint`

* `format({lang})`, `lint({lang})`

### `testRunner`

* `detect({workdir}) -> {langs, testCommands[]}`
* `run({command, env?, timeout?}) -> {exitCode, junitXml?, textLog}`

### `mutationTester`

* `stryker({config?, timeBudgetMins?}) -> {score?, killed?, survived?}` for JS/TS. ([Stryker Mutator][8])
* `mutmut({paths?, timeBudgetMins?}) -> {killed?, survived?, total?}` for Python. ([Mutmut][9])

<br>

---

## Rubrics & Gates

**Required pass dimensions (1–5):**

1. **Atomicity:** One coherent intent per commit (≥4 to pass).
2. **Commit style:** Conventional Commits header; informative body (≥4). ([Conventional Commits][3])
3. **Reviewability:** Prefer ≤ **40 files** per PR, justify if exceeded (≥4).
4. **Literate clarity:** Why/What/How‑to‑review/Risks (≥4).
5. **Tests non‑vacuity:** All tests green; where supported, mutation test kills ≥5 mutants **or** meets time‑boxed budget (≥4). ([Stryker Mutator][8])

**Advisory checks:** Changed LOC > **1000** → suggest stacking. (Size labels often use **size/XXL = 1000+ lines**.) ([GitHub][10])

**Publish only if:** `required_pass = true` and CI green on the head of each PR in the stack.

<br>

---

## Config: `storyteller.yaml`

```yaml
githubApp:
  appId: ${GITHUB_APP_ID}
  privateKey: ${GITHUB_APP_PRIVATE_KEY}

models:
  coder: gpt-5-codex
  critic: gpt-5

gating:
  maxFilesPerPR: 40
  suggestStackOverLoc: 1000
  requireMutationTesting:
    - js
    - ts
    - py
  mutation:
    js:
      cmd: "npx stryker run"
      timeBudgetMins: 6
      minKilled: 5
    py:
      cmd: "mutmut run"
      timeBudgetMins: 6
      minKilled: 5

commit:
  style: conventional
  bodyTemplate: |
    Why:
    What changed:
    How to review:
    Risks / Rollback:
    Related commits/PRs:

stacking:
  enabled: true
  mode: native   # or "spr" | "stack-pr"
```

<br>

---

## CLI Contract

```bash
storyteller rewrite \
  --repo github.com/<org>/<repo> \
  --pr 123 \
  --mode plan|apply \
  --stack yes \
  --max-files-per-pr 40 \
  --test "pytest -q" \
  --test "npm test --silent"
```

**Return JSON (stdout):**

```json
{
  "jobId":"...", "plan":{...}, "publishedPRs":[{"number":123, "url":"..."}]
}
```

<br>

---

## Templates (Commits, PR body, Reviewer’s Map)

### Conventional Commit message

```
<type>(<scope>): <summary>

Why:
What changed:
How to review:
Risks / Rollback:
Related:
```

(*Follow the Conventional Commits spec for `type`, optional `scope`, and breaking changes.*) ([Conventional Commits][3])

### PR description (single or stack)

```
TL;DR
- One-line purpose and expected outcome.

Reader’s Map
- Commit 1 — <short intent>
- Commit 2 — <short intent>
- ...

Review Checklist
- Run: <commands>
- Focus areas: <files/modules>
- Edge cases: <bullets>

Lessons learned (from pruned paths)
- <concise bullets, no code from dead ends>

Risks / Rollback
- <how to revert safely>
```

<br>

---

## Heuristics: Pruning, Decomposition, Stacking

**Prune “dead ends” when:**

* Commits later fully reverted or overwritten, or message marks `revert`, `fixup!`, `wip`.
* AST‑semantic removal of previously added symbols (signals rework).

**Decompose by:**

* **AST boundaries** (functions, classes, modules) to keep intent clear. ([Tree-sitter][2])
* Group by *behavioral seams* (public API, invariants).
* Keep infra/no‑op formatting in separate commits.

**Stacking triggers:**

* > 1000 LOC total (suggest stack). ([GitHub][10])
* Touching multiple subsystems with limited coupling → multiple dependent PRs.
* Publish with base-branch chaining (PR2 base = PR1 branch). ([GitHub Docs][5])
* Optional tooling: `git spr`, `stack-pr`. ([GitHub][11])

<br>

---

## Mutation Testing Budget (JS/TS, Python)

* **When:** Only on the final head of the rewritten branch (after unit/acceptance tests pass).
* **Budget:** ~5–6 minutes per language (CI‑friendly).
* **Targets:**

  * JS/TS → **StrykerJS** (`killed ≥ 5` or report a score if quickly available). ([Stryker Mutator][8])
  * Python → **mutmut** (`killed ≥ 5` within budget). ([Mutmut][9])
* **Purpose:** catch vacuous tests (assertions that never fail).

<br>

---

## Operational Notes (Security, Observability)

**Security**

* Clone to ephemeral workspace; avoid pushing to author’s branch.
* Scan diffs for secret‑like tokens before publishing.
* `git filter-repo` only for exceptional history surgery (recommended over `filter-branch`). ([GitHub][7])

**Observability**

* Enable Agents SDK traces per step; store artifacts (patches, logs, rubric JSON) with jobId. ([OpenAI Platform][1])

<br>

---

## Minimal TypeScript Skeleton (Agents + Tools)

> *Codex can expand the placeholders into full implementations using the Agents SDK.* ([OpenAI Platform][1])

```ts
// src/orchestrator.ts
import { createAgent, runWorkflow } from "@openai/agents";
import * as tools from "./tools"; // export github, gitLocal, astDiff, formatLint, testRunner, mutationTester

export async function rewritePR(input: {
  repo: string; pr: number; mode: "plan"|"apply";
  stack: boolean; tests: string[]; maxFilesPerPR: number;
}) {
  const director = createAgent({ name: "director", model: "gpt-5", tools: Object.values(tools),
    system: `You are the Director ... (system prompt from spec)` });

  const historian = createAgent({ name: "historian", model: "gpt-5", system: `Infer the story...` });
  const pruner    = createAgent({ name: "pruner",    model: "gpt-5-codex", system: `Propose keep/drop...` });
  const decomp    = createAgent({ name: "decomposer",model: "gpt-5-codex", system: `Decompose into atomic steps...` });
  const rewriter  = createAgent({ name: "rewriter",  model: "gpt-5-codex", system: `Create branch and commits...` });
  const tester    = createAgent({ name: "tester",    model: "gpt-5-codex", system: `Write acceptance tests...` });
  const runner    = createAgent({ name: "runner",    model: "gpt-5-codex", system: `Run per-commit CI...` });
  const critic    = createAgent({ name: "critic",    model: "gpt-5", system: `Evaluate rubric...` });
  const publisher = createAgent({ name: "publisher", model: "gpt-5", system: `Publish (stacked) PRs...` });

  // Agents-as-tools registration skipped for brevity; Codex can wire these according to SDK docs.

  return runWorkflow(director, {
    steps: [
      { call: "github.getPRContext", with: { repo: input.repo, prNumber: input.pr } },
      { handoff: historian }, { handoff: pruner }, { handoff: decomp },
      { handoff: rewriter }, { handoff: tester }, { handoff: runner },
      { handoff: critic, gate: "mustPass" },
      { when: input.stack, handoff: publisher, else: publisher }
    ]
  });
}
```

```ts
// src/tools/github.ts (sketch)
export const github = {
  name: "github",
  description: "GitHub App operations",
  // implement with Octokit (App auth). Expose minimal, high-signal methods.
};
```

```ts
// src/tools/gitLocal.ts (sketch)
export const gitLocal = {
  name: "gitLocal",
  description: "Local git operations in ephemeral workspace"
};
```

*(Provide similar stubs for `astDiff`, `formatLint`, `testRunner`, `mutationTester`.)*

<br>

---

## Appendix A: Example Gnarly PRs to Practice On

* **kubernetes/test‑infra — “remove genyaml pkg” (size/**XXL**)** → **PR #35446** (1000+ LOC). Great for deletion/sweep semantics and stack splitting. ([GitHub][12])
* **lobehub/lobe‑chat — “style: Optimized model list & search” (size: **XXL**) → PR #9397.** Large UI/TS change—ideal to test atomic splits around components & tests. ([GitHub][13])
* **lobehub/lobe‑chat — “feat: Add MCP UI integration support” (size: **XXL**) → PR #9326.** Good for feature vs. infra separation and acceptance tests. ([GitHub][13])
* **lobehub/lobe‑chat — “feat: add PDF export functionality to share modal” (size: **XXL**) → PR #9300.** Acceptance tests around export flows. ([GitHub][13])

> **Tip:** Repos using **Pull Request Size** labels treat **size/XXL** as **1000+ lines changed**; use this as a trigger to suggest stacking. ([GitHub][10])

<br>

---

## Appendix B: References

* **Agents SDK & Responses API (official docs):** building multi‑agent apps, models, streaming. ([OpenAI Platform][1])
* **GPT‑5‑Codex docs & guide:** model page, prompting guide, system‑card addendum. ([OpenAI Platform][14])
* **Conventional Commits spec:** message format and semantics. ([Conventional Commits][3])
* **Git autosquash & rebase docs:** fold fixups during interactive rebase. ([Git][4])
* **git‑filter‑repo (recommended) & GitHub docs:** safe history surgery. ([GitHub][7])
* **AST diffs:** tree‑sitter (official) & diffsitter tool. ([Tree-sitter][2])
* **Stacked PRs:** change PR base; `git spr` and `stack-pr` CLIs; overviews. ([GitHub Docs][5])
* **Mutation testing:** StrykerJS (JS/TS) and mutmut (Python). ([Stryker Mutator][8])

---

### Build Checklist (for Codex)

* [ ] Implement tool adapters (`github`, `gitLocal`, `astDiff`, `formatLint`, `testRunner`, `mutationTester`).
* [ ] Wire agents‑as‑tools in the Director per SDK docs. ([OpenAI Platform][1])
* [ ] Parse `storyteller.yaml`, hydrate defaults.
* [ ] End‑to‑end “plan” run on a public PR (read‑only).
* [ ] “apply” run on a fork play repo; verify each commit is green and stacked PRs chain correctly.

---

**That’s the whole spec.** Hand this file to GPT‑5‑Codex with your repo scaffolding and it can generate the code, prompts, and wiring.

[1]: https://platform.openai.com/docs/guides/agents-sdk?utm_source=chatgpt.com "OpenAI Agents SDK"
[2]: https://tree-sitter.github.io/?utm_source=chatgpt.com "Tree-sitter: Introduction"
[3]: https://www.conventionalcommits.org/en/v1.0.0/?utm_source=chatgpt.com "Conventional Commits"
[4]: https://git-scm.com/docs/git-rebase?utm_source=chatgpt.com "Git - git-rebase Documentation"
[5]: https://docs.github.com/articles/changing-the-base-branch-of-a-pull-request?utm_source=chatgpt.com "Changing the base branch of a pull request"
[6]: https://cookbook.openai.com/examples/gpt-5-codex_prompting_guide?utm_source=chatgpt.com "GPT-5-Codex Prompting Guide"
[7]: https://github.com/newren/git-filter-repo?utm_source=chatgpt.com "newren/git-filter-repo: Quickly rewrite git repository history ..."
[8]: https://stryker-mutator.io/docs/stryker-js/introduction/?utm_source=chatgpt.com "Introduction"
[9]: https://mutmut.readthedocs.io/?utm_source=chatgpt.com "mutmut - python mutation tester — mutmut documentation"
[10]: https://github.com/marketplace/pull-request-size?utm_source=chatgpt.com "Pull Request Size · GitHub Marketplace"
[11]: https://github.com/ejoffe/spr?utm_source=chatgpt.com "ejoffe/spr: Stacked Pull Requests on GitHub"
[12]: https://github.com/kubernetes/test-infra/pulls "Pull requests · kubernetes/test-infra · GitHub"
[13]: https://github.com/lobehub/lobe-chat/pulls "Pull requests · lobehub/lobe-chat · GitHub"
[14]: https://platform.openai.com/docs/models/gpt-5-codex?utm_source=chatgpt.com "Model - OpenAI API"

