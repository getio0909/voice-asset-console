# Repository Guidelines

## Structure

Keep Vue application code in `src/`, route views in `src/views/`, reusable UI
in `src/components/`, state in `src/stores/`, and all Server access behind
`src/api/`. The Console consumes the versioned public OpenAPI contract and must
not duplicate Server authorization or domain rules.

## Commands

- `pnpm lint`: run ESLint with zero warnings.
- `pnpm typecheck`: validate Vue and TypeScript types.
- `pnpm test`: run Vitest once.
- `pnpm build`: type-check and build the static bundle.
- `pnpm test:e2e`: build and run Playwright smoke tests.

Use two-space indentation, `<script setup lang="ts">`, `PascalCase` components,
and `camelCase` functions. Put tests beside the behavior as `*.spec.ts`. Add
accessible names and keyboard behavior for interactive controls. UI text must
be ready for English and Chinese localization.

Use Conventional Commits such as `feat(assets): add status filter`. Pull
requests need test commands and screenshots for visual changes. Never expose
tokens, provider secrets, or raw error bodies in the browser or logs.
