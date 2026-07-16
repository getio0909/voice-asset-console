# Contributing

Thank you for improving VoiceAsset Console. The repository is in initialization;
open an issue before implementing a large feature or changing the API boundary.

## Development workflow

1. Install the pinned pnpm version and a supported Node.js release.
2. Run `pnpm install --frozen-lockfile`.
3. Copy `.env.example` to `.env.local` and use non-secret local values only.
4. Keep changes focused and add tests for behavior changes.
5. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
6. Run `pnpm test:e2e` for navigation or user-flow changes when Chromium is available.

Use two-space indentation. Vue components use `PascalCase.vue`; composables and
functions use `camelCase`; tests use `*.spec.ts`. Prefer Composition API with
`<script setup lang="ts">` and keep strict types at external boundaries.

## API changes

`voice-asset-server/contracts/openapi.yaml` is authoritative. Change and validate
the Server contract first, record its contract version, then regenerate or update
the typed client and API mock tests here. Never invent fields independently.

## Commits and pull requests

Use Conventional Commits, for example `feat(console): add asset filters`. Pull
requests should explain user-visible behavior, link the relevant issue, list exact
validation commands, and include screenshots for visual changes. Call out any
accessibility or security impact.

Report vulnerabilities through the private process in `SECURITY.md`, not a public
issue.
