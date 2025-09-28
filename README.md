# Storyteller

Rewrites PRs to make them easy to read – powered by GPT-5-Codex.

## Development Setup

1. Install Node.js 20.11 or newer (LTS recommended).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run linting & formatting checks:
   ```bash
   npm run lint
   npm run format:check
   ```
4. Execute the (stub) test suite:
   ```bash
   npm test
   ```
5. Launch the placeholder CLI while developing:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm run dev` – Runs the placeholder CLI with live reload via `tsx`.
- `npm run lint` / `npm run lint:fix` – ESLint with TypeScript rules.
- `npm run format` / `npm run format:check` – Prettier enforcement with shared config.
- `npm run typecheck` – TypeScript project validation without emitting JS.
- `npm run build` – Emits compiled JS + type declarations to `dist/`.
- `npm test` – Executes Vitest (currently stubbed).
- `npm run test:coverage` – Runs tests with V8 coverage output.

## Orchestrator (Plan Mode)

Storyteller’s orchestrator is exposed via the `rewritePR` helper:

```ts
import { rewritePR } from './src/orchestrator.js';

const result = await rewritePR({
  jobId: 'local-dev',
  repo: 'acme/example',
  pr: 123,
  mode: 'plan',
  stack: false,
});

console.log(result.plan.atomicPlan.steps);
```

By default it wires the concrete tool adapters; tests inject mocks through the optional `dependencies` override to exercise the pipeline without touching live infrastructure.

## Project Layout

- `PLAN.md` – Immutable product + architecture specification.
- `ROADMAP.md` – Execution tracker for phases and tasks.
- `src/orchestrator.ts` – Plan/apply coordinator assembling agents and tool adapters.
- `src/` – TypeScript source (CLI entry point scaffolding in place).
- `test/` – Test harness (empty placeholder for now).

## Next Steps

See `ROADMAP.md` for the active phase and detailed tasks. Phase 1 kicks off the tool adapter implementations required by the multi-agent workflow.
