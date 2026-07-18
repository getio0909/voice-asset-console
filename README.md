# VoiceAsset Console

Vue 3 administration console for self-hosted VoiceAsset servers.

> **Status:** Phase 6 candidate. The Console can authenticate with a
> secure cookie, run PostgreSQL-backed title/latest-transcript search with
> Collection, Tag, status, UTC date, ASR Provider, and Speaker filters, inspect
> bounded Segment hits with timecodes, page through the workspace catalog, bulk
> trash or restore up to 100 loaded assets with per-item conflict reporting,
> request Owner-only permanent deletion with exact-ID reconfirmation and durable
> job status, read
> one asset, replace its title/language/collection with exact-version conflict
> protection, play its authenticated audio against an immutable waveform with
> pointer/keyboard seek, timestamps, and 0.75–2x speed, inspect processing history, add
> timestamped note/bookmark annotations, upload and verify a WAV file, run Mock
> ASR, display the immutable
> normalized transcript, configure a separate correction glossary and
> Mock LLM profile, review structured changes, create an approved revision, and
> generate audited JSON, Markdown, SRT, or WebVTT downloads for immutable
> revisions. It can also
> administer scoped API keys whose plaintext is shown once. The same UI can
> rotate expired access credentials through HttpOnly refresh cookies and list or
> revoke recognizable personal device sessions. Administrators can also publish
> ASR hotwords and manage Mock, Alibaba, or Tencent profiles with
> write-only credentials, and publish LLM glossaries while managing Mock or
> OpenAI-compatible profiles with write-only API keys and custom headers. Job
> Center, Audit Log, the live Dashboard, and System Status expose only bounded
> `admin:read` operational fields. A public Version Information page shows the
> observed Server/API/contract identity and sorted capability flags without
> sending credentials or changing settings. Manual
> correction review is the default; an administrator may opt a profile into
> Server-validated glossary-only auto-approval. These
> flows pass against the isolated
> `https://api.getio.net:10443` test deployment; this is not a production release.

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
`Copy-Item .env.example .env.local`. Start VoiceAsset Server on
`http://127.0.0.1:8080`; Vite proxies `/api` so the browser and HttpOnly cookie
remain same-origin. Override the server-only proxy target with
`VOICEASSET_API_PROXY_TARGET`. Never add tokens or provider credentials.

For the sibling-repository Compose deployment, the production `Dockerfile`
builds the static bundle and serves it through an unprivileged Caddy process.
The same process proxies `/api`, health, and version routes to Server so secure
session cookies stay same-origin. The complete local stack is available at
`http://localhost:8080`; Server remains separately reachable for diagnostics at
`http://127.0.0.1:18080`.

## Validation

| Command               | Purpose                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| `pnpm lint`           | Run ESLint with zero warnings allowed.                                     |
| `pnpm typecheck`      | Type-check TypeScript and Vue SFCs with `vue-tsc`.                         |
| `pnpm test`           | Run the Vitest suite once.                                                 |
| `pnpm build`          | Type-check and produce the static bundle in `dist/`.                       |
| `pnpm test:e2e`       | Run mocked catalog, session, ASR, review, API-key, and provider workflows. |
| `pnpm licenses:check` | Reject production dependencies without license metadata.                   |

## Release artifact validation

After `pnpm verify`, package the validated `dist/` directory into a new empty
directory:

```bash
commit=$(git rev-parse HEAD)
bash scripts/build-release.sh v0.1.0 dist-release
pnpm licenses:report
mv third-party-licenses.json dist-release/
bash scripts/write-checksums.sh dist-release
bash scripts/verify-release.sh v0.1.0 "$commit" dist-release
```

The archive normalizes entry order, timestamps, ownership, and gzip metadata.
The verifier rejects unsafe paths, symlinks, unexpected artifacts, incomplete
checksums, an empty license inventory, contract drift, or content that differs
from `dist/`. Tag CI additionally builds one checksum-covered OCI archive for
Linux AMD64/ARM64, verifies its digests, platforms, non-root user, port, and OCI
labels, and requires both that archive and the SPDX SBOM before it creates a
draft prerelease. The local commands above validate only the static archive.

Playwright browser binaries are intentionally not installed by `pnpm install`.
Install Chromium explicitly with `pnpm exec playwright install chromium` when local
E2E execution is needed. CI installs its own isolated browser.

`pnpm test:e2e` uses exact API mocks and requires no Server. To prove the same flow
against a real migrated PostgreSQL schema, API, worker, object directory, and cookie,
run the isolated orchestrator from the sibling Server repository:

```powershell
& ..\voice-asset-server\scripts\run-live-console-e2e.ps1
```

The script reads only PostgreSQL fields from the workspace `.env`, generates an
ephemeral owner, exercises manual and glossary-only automatic correction plus
Provider/Hotword and LLM/Glossary workflows, and removes its unique schema and
files in `finally`.

To exercise an already deployed test instance without starting Vite, set
`VOICEASSET_CONSOLE_BASE_URL`. The current `api.getio.net:10443` gateway uses a
system-trusted public certificate and needs no TLS bypass. For a separate
private-CA fixture, `VOICEASSET_E2E_ALLOW_INTERNAL_CA=1` remains restricted to
that test process; production clients must trust the CA normally and must never
disable certificate checks.
The opt-in `e2e/live-api-keys.spec.ts` case requires
`VOICEASSET_LIVE_E2E=1` plus ephemeral Owner email/password environment
variables. It disables traces, screenshots, video, and retries; it revokes its
temporary least-privilege key in both success and failure paths.

The opt-in `e2e/live-sessions.spec.ts` case uses
`VOICEASSET_LIVE_SESSION_E2E=1`, `VOICEASSET_CONSOLE_BASE_URL`,
`VOICEASSET_LIVE_OWNER_EMAIL`, and `VOICEASSET_LIVE_OWNER_PASSWORD`.
It proves both secure cookie paths, access/refresh rotation, device inventory,
current-device revocation, and cleanup. It also disables traces, screenshots,
video, and retries; inject credentials only into the test process.

The opt-in `e2e/deployed-providers.spec.ts` smoke uses the same secret-artifact
controls and performs only credential-free ASR and LLM reads against an existing
isolated deployment. Set `VOICEASSET_DEPLOYED_SMOKE=1` together with the deployed
origin and Owner credentials; do not use this mode against production.

The opt-in `e2e/live-phase1.spec.ts` flow now proves an authenticated waveform
HEAD/GET, PNG signature and browser decode, 1.5x playback, deployed transcript
search with `mock_asr`, `speaker-1`, and exact Segment timecodes before
completing manual and automatic correction approval. The separate
`e2e/deployed-assets.spec.ts` test proves title search, detail reads,
processing/annotation inventory, exact-version metadata replacement, empty Web
Storage, bulk trash/restore with one exact version per asset, and accessibility
against the isolated deployment. It restores the
original title, language, and collection in `finally`; enable it only with
`VOICEASSET_DEPLOYED_ASSET_E2E=1` and the same deployed-origin Owner environment
variables. Annotation creation remains in mocked coverage because the public API
does not provide a cleanup endpoint.

The opt-in `e2e/deployed-exports.spec.ts` test discovers an existing immutable
Revision, creates a one-hour Markdown export through the deployed UI, downloads it
with the authenticated session, and verifies MIME type, size, content, SHA-256,
empty Web Storage, and accessibility. Enable it only with
`VOICEASSET_DEPLOYED_EXPORT_E2E=1` and the same isolated-deployment variables;
the worker removes the bounded artifact after expiry.

The opt-in `e2e/deployed-purge.spec.ts` test creates its own WAV asset, waits for
all asynchronous asset jobs to become terminal, trashes and permanently deletes
the asset, and verifies both Server `404` and immediate removal of the matching
upload/transcript state from Console memory. It purges its own asset in `finally`
when the main flow stops early. Enable it only with
`VOICEASSET_DEPLOYED_PURGE_E2E=1` and the isolated-deployment variables; never
run this destructive check against production.

The Console targets Server OpenAPI contract `0.22.0`, recorded in
`CONTRACT_VERSION` and `src/config/contract.ts`.

## Structure

- `src/api/`: the only browser-to-Server HTTP boundary.
- `src/config/`: centrally configured product and API metadata.
- `src/router/`: route definitions and page titles.
- `src/stores/`: Pinia catalog/detail, web/device-session, media, correction, workspace/membership, API-key, ASR, and LLM state machines.
- `src/views/`: Dashboard, Assets, review, session, workspace/membership, API-key,
  version/status, ASR/Hotword, and LLM/Glossary routes.
- `e2e/`: Playwright browser workflow and accessibility checks.
- `docs/architecture/`: architectural constraints and contract decisions.
- `scripts/`: contract, license, and deterministic release-artifact checks.

The Server's `contracts/openapi.yaml` is the REST source of truth. Do not hand-copy
business models into this repository; see
[`docs/architecture/api-client.md`](docs/architecture/api-client.md).

## License

Copyright contributors. Licensed under `AGPL-3.0-or-later`; see `LICENSE`.
