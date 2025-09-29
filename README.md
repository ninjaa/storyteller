# Storyteller

A multi-agent refactoring crew that converts gnarly pull requests into reviewer-friendly story arcs. Give it a repo and a PR number; it ingests the history, prunes dead ends, decomposes the change into atomic commits, writes tests, and hands back a literate plan (or a stack of PRs) ready for review.

## Quickstart

```bash
npm install
npx tsx examples/run-plan.ts # demo plan on a sample XXL PR
npx storyteller rewrite --repo your-org/your-repo --pr 123 --mode plan
```

## Status
- Phase 1: ✅ Tool adapters (GitHub, git, diffing, lint/test/mutation runners)
- Phase 2: ✅ Plan-mode orchestrator with agent handoffs
- Phase 3: ✅ CLI + config plumbing (`storyteller.yaml`)
- Phase 4: 🚧 Apply-mode, CI orchestration, stacked publishing

For the full spec, roadmap, and example outputs, see `PLAN.md`, `ROADMAP.md`, and `examples/`.

## Feedback

It's too early for me to allow people to open Github Issues. If you want to chat, DM me on X, my handle is [@aditya_advani](https://x.com/aditya_advani)
