# VoiceAsset Console

Vue 3 administration console for self-hosted VoiceAsset servers.

> **Status:** Phase 0 initialization. Routing, state management, API boundaries,
> tests, and build automation are operational. Authentication, uploads, asset
> management, transcripts, providers, jobs, and system administration are not yet
> implemented.

## Requirements

- Node.js `^22.18.0` or `>=24.12.0`
- pnpm `11.5.0` (pinned by `packageManager`)

## Local development

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

On PowerShell, copy configuration with
`Copy-Item .env.example .env.local`. Only `VITE_` browser-visible settings belong
in this file; never add tokens or provider credentials.

## Validation

| Command               | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `pnpm lint`           | Run ESLint with zero warnings allowed.                   |
| `pnpm typecheck`      | Type-check TypeScript and Vue SFCs with `vue-tsc`.       |
| `pnpm test`           | Run the Vitest suite once.                               |
| `pnpm build`          | Type-check and produce the static bundle in `dist/`.     |
| `pnpm test:e2e`       | Build and run the Playwright Chromium smoke test.        |
| `pnpm licenses:check` | Reject production dependencies without license metadata. |

Playwright browser binaries are intentionally not installed by `pnpm install`.
Install Chromium explicitly with `pnpm exec playwright install chromium` when local
E2E execution is needed. CI installs its own isolated browser.

The Console targets Server OpenAPI contract `0.1.0`, recorded in
`CONTRACT_VERSION` and `.env.example`.

## Structure

- `src/api/`: the only browser-to-Server HTTP boundary.
- `src/config/`: centrally configured product and API metadata.
- `src/router/`: route definitions and page titles.
- `src/stores/`: Pinia state stores.
- `src/views/`: route-level views; placeholders state their incomplete status.
- `e2e/`: Playwright browser smoke tests.
- `docs/architecture/`: architectural constraints and contract decisions.

The Server's `contracts/openapi.yaml` is the REST source of truth. Do not hand-copy
business models into this repository; see
[`docs/architecture/api-client.md`](docs/architecture/api-client.md).

## License

Copyright contributors. Licensed under `AGPL-3.0-or-later`; see `LICENSE`.
