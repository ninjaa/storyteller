# Storyteller Roadmap

> Execution tracker for Storyteller implementation. `PLAN.md` remains the immutable spec; this doc captures phased work, tasks, status, and exit criteria.

## Phase 0 — Environment & Foundations
- [ ] Task 0.1: Confirm runtime/tooling baselines (Node.js version, package manager, TypeScript config scaffold).
- [ ] Task 0.2: Establish repo hygiene (lint/test npm scripts, formatting defaults, CI placeholders).
- [ ] Task 0.3: Document developer setup prerequisites in `README.md`.
- **Exit criteria:** Local dev environment reproducible; yarn/npm scripts in place for lint/test; contributors can run baseline checks.

## Phase 1 — Tool Adapters (MCP Servers)
- [ ] Task 1.1: Implement `github` adapter with GitHub App auth and minimal method surface (`getPRContext`, `openPR`, etc.).
- [ ] Task 1.2: Implement `gitLocal` adapter managing ephemeral workspaces and git operations.
- [ ] Task 1.3: Implement `astDiff` adapter backed by tree-sitter/diffsitter for semantic diffs and symbol-splitting.
- [ ] Task 1.4: Implement `formatLint` adapter integrating project formatters/linters per language.
- [ ] Task 1.5: Implement `testRunner` adapter (command detection + execution with structured results).
- [ ] Task 1.6: Implement `mutationTester` adapter wiring StrykerJS and mutmut with budget controls.
- **Exit criteria:** All adapters callable from Agents SDK; return shapes match PLAN spec; basic smoke tests confirm they operate on sample repositories.

## Phase 2 — Orchestrator & Agent Wiring
- [ ] Task 2.1: Flesh out `src/orchestrator.ts` to instantiate Director and specialist agents with system prompts.
- [ ] Task 2.2: Register agents-as-tools and connect adapters per Agents SDK requirements.
- [ ] Task 2.3: Implement workflow sequencing (plan/apply modes, stack flag handling, gating against QA critic output).
- [ ] Task 2.4: Capture artifacts/logging per job ID for observability hooks.
- **Exit criteria:** CLI can invoke `rewrite` in `plan` mode with mocked tool responses; workflow produces structured plan JSON without executing repo mutations.

## Phase 3 — Configuration & CLI Experience
- [ ] Task 3.1: Parse `storyteller.yaml`, hydrate defaults for models, gating, mutation budgets.
- [ ] Task 3.2: Implement CLI argument parsing and validation matching contract in PLAN.
- [ ] Task 3.3: Surface configuration + CLI inputs into orchestrator invocation.
- [ ] Task 3.4: Write user-facing docs for CLI usage and config overrides.
- **Exit criteria:** `storyteller rewrite` runs locally end-to-end in plan mode using real config; documentation covers setup and CLI flags.

*Later phases (end-to-end runs, apply mode, stacking, mutation-test automation) will be detailed after Phase 1 review.*
