# Storyteller

A multi-agent refactoring crew that converts gnarly pull requests into reviewer-friendly story arcs. Give it a repo and a PR number; it ingests the history, prunes dead ends, decomposes the change into atomic commits, writes tests, and hands back a literate plan (or a stack of PRs) ready for review.

## Quickstart

```bash
npm install
export GITHUB_TOKEN=ghp_your_read_only_token      # https://github.com/settings/tokens
npx tsx src/cli/main.ts rewrite --repo upstream/repo --pr 123 --mode plan
```

Want to rehearse first? Try these real XXL PRs (plan mode only for now):

- `npx tsx src/cli/main.ts rewrite --repo kubernetes/test-infra --pr 35446 --mode plan` → **cleanup: remove genyaml pkg** (sweeping package deletion)
- `npx tsx src/cli/main.ts rewrite --repo lobehub/lobe-chat --pr 9397 --mode plan` → **style: Optimized model list & search** (large TS/React polish)
- `npx tsx src/cli/main.ts rewrite --repo lobehub/lobe-chat --pr 9326 --mode plan` → **feat: Add MCP UI integration support** (feature + infra)
- `npx tsx src/cli/main.ts rewrite --repo lobehub/lobe-chat --pr 9300 --mode plan` → **feat: add PDF export functionality to share modal** (feature + acceptance tests)

All commands operate in read-only “plan” mode today—Storyteller fetches the PR, emits the atomic commit plan, test strategy, and QA verdict without mutating history. (Apply-mode/PR publishing lands in Phase 4.)

## Status

- Phase 1: ✅ Tool adapters (GitHub, git, diffing, lint/test/mutation runners)
- Phase 2: ✅ Plan-mode orchestrator with agent handoffs
- Phase 3: ✅ CLI + config plumbing (`storyteller.yaml`)
- Phase 4: 🚧 Apply-mode, CI orchestration, stacked publishing

For the full spec, roadmap, and example outputs, see `PLAN.md`, `ROADMAP.md`, and `examples/`.

## Feedback

It's too early for me to allow people to open Github Issues. If you want to chat, DM me on X, my handle is [@aditya_advani](https://x.com/aditya_advani)
