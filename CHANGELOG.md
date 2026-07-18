# Changelog

All notable changes to this project will be documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases will
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Update the OCI release verifier to safely dereference the standard nested
  image-index layout emitted by hosted BuildKit while retaining exact
  `linux/amd64` and `linux/arm64` platform checks.

- Allow semver prerelease tags to carry the package's base version and disable
  default BuildKit attestations while explicitly selecting OCI media types
  before strict multi-platform OCI verification.

- Updated the local Chromium mock capability fixtures to use the pinned
  `0.22.0` contract instead of stale `0.20.0` literals. The full local e2e
  gate now passes seven flows with ten explicitly skipped live/deployed flows;
  no live credentials are used. Increased the isolated preview startup timeout
  to two minutes for cold hosted runners.
- Advanced the fail-closed Server contract pin to additive contract `0.20.0`.
  Personal terminal-job notifications remain a Session-only Server API and do
  not add a Console route, required capability, persisted state, or authority.
  Formatting, contract, lint, 107 unit tests, typecheck, production build, and
  license gates pass; the matching static bundle is deployed on isolated 10443.
- Advanced the fail-closed Server contract pin to additive contract `0.19.0`
  and added a read-only System Settings route for `admin:read`. It renders only
  the Server allowlist of safe runtime facts, exposes no form or save action,
  retains no credentials, and has mocked Chromium zero-write and axe coverage.
  The matching bundle is deployed with Server/MCP `.20260718.4`; strict-TLS
  API acceptance verifies the exact allowlist, mutation/query rejection, and
  immutable audit.
- Advanced the fail-closed Server contract pin to additive contract `0.18.0`
  and added personal-session-only Android pairing. The Console validates the
  complete one-time URI, keeps it only in Pinia memory, masks it by default,
  and clears it on refresh, reset, expiry, or route unmount. The matching
  bundle is deployed with Server/MCP `.20260718.3`; strict-TLS issue/claim/
  replay/logout acceptance passes after the Server canonicalized response and
  URI expiry to the same whole second.
- Advanced the fail-closed Server contract pin to additive contract `0.17.0`.
  The Console does not expose the new mobile-oriented failed-job retry action
  and continues to ignore unknown advertised capabilities safely.

### Added

- Added a Tag-only Linux AMD64/ARM64 OCI archive built from digest-pinned base,
  QEMU, and BuildKit images. The checksum-covered artifact is rejected unless
  both platforms, exact version/revision labels, port `8080`, and the unprivileged
  `65532:65532` runtime identity are present.
- Added a public Version Information route that reuses the fail-closed capability
  store to show the observed Server, API, contract, and sorted feature flags.
  Incompatible documents remain visible for diagnosis without marking the Server
  ready; the page sends no credentials, performs no writes, and has mocked
  Chromium accessibility coverage.
- Added the contract `0.15.0` Account route for session-only password changes.
  All three plaintext fields clear at submit start, success forgets the locally
  revoked session without a redundant logout call, and the Chromium flow proves
  cookie-only requests, empty Web Storage, and zero axe violations.
- Added an Admin-readable, Owner-writable Workspace route for contract
  `0.14.0`. The typed client and Pinia store use the current exact ETag for
  renames, surface stale-write failures, and retain no bearer credentials in
  browser storage; the mocked Chromium flow includes a zero-axe check.
- Added contract `0.14.0` workspace member administration. Admin readers get
  filter-bound inventory; Owners can create local members and change role or
  status with exact ETags. The create form clears the plaintext password as
  soon as the request starts, and the UI explains last-Owner and credential-
  revocation safeguards enforced by the Server.

### Changed

- Advanced the fail-closed Server contract pin to `0.16.0`. The Console does
  not yet consume the incremental asset feed, but capability negotiation now
  requires the additive `incremental_sync` contract surface before marking a
  `0.16.0` Server ready.
- Advanced the fail-closed Server contract pin to `0.13.0` and added
  `admin:read` Job Center, Audit Log, and System Status routes. The typed client
  validates bounded filters/cursors, Pinia isolates each read model's state,
  and Dashboard renders only authenticated live aggregates.
- Deployed the matching `0.13.0` bundle to the isolated `10443` gateway. A real
  Owner browser validated Job filters, exact response-field allowlists, Audit
  Log, Dashboard/System Status, empty Web Storage, no unexpected writes, and
  zero axe violations. Status-card description markup was corrected to valid
  definition-list semantics before the final deployment archive, whose SHA-256
  is `01a24dfd000f8577e44da6010b9720c17f928d58b998ca18edb08452806b0974`.

- Advanced the fail-closed Server contract pin to `0.12.0`. The trash detail now
  exposes an Owner-only permanent-deletion flow that requires the exact asset ID,
  exact version, and an independent idempotency key; the Console can observe the
  durable purge job and explicitly resume a terminal failure after reconfirmation.
- A succeeded permanent-purge status now clears the matching upload, audio, and
  transcript state from memory immediately. An opt-in, self-cleaning deployed
  Chromium test covers the complete upload-to-purge path and waits for all
  asset jobs to become terminal before requesting deletion.
- Advanced the fail-closed Server contract pin to `0.11.0`. Asset details now
  render the authenticated immutable waveform, support pointer/keyboard seeking,
  expose bounded playback-speed controls, and degrade to audio-only playback
  while the asynchronous derivative is pending.
- Deployed the matching waveform bundle with Server/MCP
  `0.1.0-dev+phase6.20260717.2` to the isolated `10443` gateway. Real Chromium
  validated authenticated PNG HEAD/GET, signature, decoded display, 1.5x
  playback, search, Mock ASR, manual review, automatic approval, empty Web
  Storage, and accessibility without restarting either Caddy process.
- Deployed the bounded bulk lifecycle bundle to the isolated `10443` gateway.
  A real Chromium flow changed and restored metadata, bulk-trashed and restored
  the selected asset with exact versions, passed accessibility and empty Web
  Storage checks, and restored the original state. No service restarted; the
  retained archive SHA-256 is
  `08a8c2ffd4f5078825b31187f1c54767b136db5a404a677cd609b4c87d3ba5a5`.
- Deployed the contract `0.10.0` bundle with Server/MCP
  `0.1.0-dev+phase6.20260717.1`. A real Chromium flow uploaded a WAV, completed
  Mock ASR, filtered its transcript hit by Provider and Speaker, checked the
  exact timecode, and completed manual plus automatic approval. Lifecycle,
  export, and credential-free Provider regressions also pass; the retained
  archive SHA-256 is
  `20fa1e08bd6a162792626aa780f865b8c046560b1dd10d06e52f747b3788fc41`.
- Advanced the fail-closed Server contract pin to `0.10.0`. Catalog cursors now
  retain title/transcript terms plus Collection, Tag, status, date, ASR Provider,
  and Speaker filters; structured search metadata renders immutable Segment
  timecodes without client-side transcript scanning.
- Advanced the fail-closed Server contract pin to `0.9.0` and deployed the
  matching bundle with Server/MCP `0.1.0-dev+phase5.20260717.2`. A real
  Chromium flow combined collection/tag/status/date filters, assigned-tag
  reads, exact-ETag metadata changes, trash, default-list exclusion, restore,
  empty Web Storage, and axe checks while restoring the source asset. The
  deterministic archive SHA-256 is
  `a8c1dd4fb92e7d574495952eabe4457dd0d2585a6edfb6e75405fbcc09bba7cc`.
- Deployed the immutable-export bundle to the isolated `10443` gateway without
  restarting either Caddy process. A real Chromium flow exported, downloaded,
  and SHA-256-verified an existing Revision with zero axe violations and empty
  Web Storage; the retained archive SHA-256 is
  `41fe4b600d8bbe9f00f7291915c609f92b22cb8014193a225898ce4b6f72613f`.
- Deployed the asset-detail bundle to the isolated `10443` gateway without
  restarting either Caddy process. A real Chromium flow searched, inspected
  processing/annotation state, edited, verified, and restored one asset's metadata
  with zero axe violations and empty Web Storage; the retained archive SHA-256 is
  `5a0b7b0f2e7f2e20bc7c4c474c7676182ff7902e849e5dccd751b748fd80bb6e`.
- Moved every CI, browser, and Tag job to the signed `pnpm/action-setup`
  `v6.0.9` commit so GitHub Actions uses its native Node.js 24 runtime.
- Deployed the contract `0.8.0` bundle with Server/MCP
  `0.1.0-dev+phase5.20260717.1` to the isolated `10443` gateway. A real Chromium
  flow proved secure access/refresh cookie attributes, rotation after access
  expiry, personal device inventory, current-device revocation, and cleanup;
  public Caddy and the independent gateway were not restarted. The retained
  archive SHA-256 is `01cf3c35bcb7e51083da69acf8b3cf4b202b174b524be7418673a3b262fad8e2`.
- Advanced the fail-closed Server contract pin to `0.8.0`; expired access
  sessions now rotate Server-managed HttpOnly refresh cookies during restore.
- Deployed the glossary-only auto-approval bundle with Server
  `0.1.0-dev+phase5.20260716.6` to the isolated `10443` gateway. Strict TLS and
  the credential-free deployed browser smoke passed without restarting MCP,
  the gateway, or public Caddy; the retained Console archive SHA-256 is
  `1bf50f47b874b8b10950166004d3ff0ba540728cf34d058f559133d5ce127e2c`.
- Deployed the LLM/Glossary administration bundle to the isolated `10443`
  gateway. Strict CA/hostname checks and a real credential-free ASR-plus-LLM
  browser session passed without restarting either Caddy process; the retained
  archive SHA-256 is
  `034f7c2e233e032e5857f9e10388b225c3b597bd4a110e81a97d4d9be2ea13c6`.
- Deployed the Provider/Hotword administration bundle to the isolated `10443`
  gateway. Strict CA/hostname checks and a real credential-free browser session
  passed without restarting either Caddy process; the retained archive SHA-256
  is `a8f07a9766b7c9eff89c595fca0ed616be131a921cd0da284087a4d0b648f8a1`.
- Deployed the API-key administration bundle to the isolated `10443` gateway
  with strict CA/hostname validation and no gateway or public Caddy restart.
  A real browser run created, displayed once, and revoked a one-scope key while
  leaving browser storage empty and no active test key.
- Advanced the fail-closed Server contract pin to `0.7.0`; the additive
  organization read models do not change Console runtime behavior yet.
- Advanced the fail-closed Server contract pin to `0.6.0` for scoped API-key
  lifecycle support used by durable Agent integrations.
- Advanced the fail-closed Server contract pin to `0.5.0` for the additive
  asset-search API consumed by MCP.

### Added

- Bounded catalog bulk lifecycle actions for up to 100 loaded assets. Each
  trash/restore request uses that asset's exact version, successful items keep
  progressing after an individual conflict, and failed items remain selected
  with a safe message and Request ID for refresh or retry.
- Provider and Speaker catalog controls plus bounded chronological Segment-hit
  cards. Mocked Chromium proves transcript search, Provider/Speaker query
  propagation, timecodes, accessibility, and empty browser persistence; the
  deployed upload/ASR workflow contains the matching opt-in 0.10 assertion.
- Typed asset collection/tag/status/date filters, complete workspace and
  assigned-tag paging, tag assignment controls, and versioned trash/restore UI.
  Trashed assets are excluded by default and immutable detail/audio operations
  remain disabled until restoration. The full gate now passes 64 Vitest tests
  and three default mocked Chromium workflows.
- Audited JSON, Markdown, SRT, and WebVTT export creation for any immutable
  Revision, with an authenticated same-origin download, bounded expiry metadata,
  response identity checks, and SHA-256 visibility.
- A workspace asset catalog with literal title search, cursor pagination,
  deterministic collection paging, detail refresh, and full title/language/
  collection replacement guarded by exact resource-version ETags.
- Authenticated asset audio playback, bounded processing-job history, complete
  annotation paging, and validated timestamped note/bookmark creation.
- Catalog client, Pinia, mocked Chromium, and accessibility coverage for search,
  selection, metadata updates, collection assignment, processing/annotation
  detail, annotation creation, and conflict-safe state.
- Deterministic static-bundle packaging, complete SHA-256 manifests, safe-path
  and symlink rejection, exact `dist/` comparison, compiled-contract checks,
  license validation, and a required-SPDX mode for Tag release candidates.
- An opt-in deployed-origin refresh/device-session Playwright E2E with unique
  labels, exact cookie/path checks, rotation proof, failure-safe revocation, and
  all secret-bearing browser artifacts disabled.
- Personal device-session inventory and revocation, including current-browser
  sign-out behavior, recognizable login labels, and typed client/Pinia tests.
- LLM Profile and Glossary administration for the exact Mock and
  OpenAI-compatible adapters, including capability-driven limits, immutable
  glossary versions, optimistic state changes, profile health, write-only API
  key/custom-header creation, and credential rotation. Manual review remains
  the default; administrators can explicitly enable the narrower
  `validated_glossary_only` policy without exposing stored credentials.
- Profile-policy updates with exact ETags and secret-free replacement payloads,
  plus a correction result state that recognizes the Server's system-created
  approved revision without synthesizing review state in the browser.
- Unit, mocked Chromium, and disposable-schema Chromium coverage for policy
  changes and a manual correction followed by glossary-only automatic approval.
  The feature gate was incorporated into the current 64-test suite and three
  mocked browser workflows.
- Typed `0.7.0` LLM capability/profile/health and glossary version/state client
  methods plus Pinia state that exact-field whitelists profiles and never retains
  submitted credentials.
- Mocked Chromium OpenAI-compatible credential create/rotate coverage, a real
  disposable-schema Mock LLM/Glossary flow, and deployed credential-free ASR
  plus LLM smoke coverage with empty Web Storage and axe assertions.
- ASR Provider and Hotword administration with capability-driven configuration,
  immutable vocabulary versions, optimistic state changes, profile health,
  encrypted vendor credential creation, and write-only rotation.
- Typed `0.7.0` ASR capability, profile, health, and hotword client methods plus
  Pinia state that exact-field whitelists public profiles and never retains
  submitted credentials.
- Mocked Chromium credential create/rotate coverage, a real disposable-schema
  Mock ASR/Hotword flow, and a deployed read-only smoke; all include empty Web
  Storage and accessibility assertions, with secret-bearing artifacts disabled.
- An opt-in deployed-origin API-key Playwright E2E with unique test names,
  response-shape validation, one-time plaintext and browser-storage checks,
  accessibility coverage, and failure-safe revocation. Secret-bearing traces,
  screenshots, videos, and retries are disabled for this test.
- Scoped API-key administration with redacted inventory, bounded expiry and scope
  selection, revocation, and a one-time plaintext panel that is cleared on
  dismissal, matching revocation, sign-out, or route exit and never persisted.
- Typed API-key list/create/revoke client methods, deterministic Pinia lifecycle
  tests, and mocked Chromium coverage for creation, one-time display, empty
  browser storage, dismissal, and revocation.
- A multi-stage, unprivileged Console image with SPA fallback, same-origin API
  proxying, compression, health checks, and hardened browser response headers
  for the sibling Server Compose stack.
- CI image/Caddy validation and a Tag-triggered draft release pipeline for the
  static bundle, license inventory, checksum, and SPDX SBOM.
- Phase 3 correction workspace for versioned glossary creation, enabled Mock LLM
  profiles, profile health checks, durable correction polling, structured diff
  review, conservative partial acceptance, and immutable approval results.
- Typed OpenAPI `0.4.0` browser methods for glossary/LLM administration,
  correction jobs, append-only decisions, and approval, without exposing
  provider credentials or accepting absolute request URLs.
- A single mocked Chromium flow from secure login and verified upload through
  `normalized`, Mock LLM correction, selected review, and `approved`, including
  request-integrity, empty token storage, and axe checks.
- An opt-in real Chromium Phase 3 flow against the isolated `10443` deployment,
  covering PostgreSQL, object storage, API/worker, internal-CA gateway, Mock ASR,
  Mock LLM, selected review, and approval without browser token persistence.
- Phase 1 login, verified resumable WAV upload, Mock ASR job polling, authenticated
  audio playback, and synchronized immutable transcript timeline.
- Cookie-only session state, bounded workflow transitions, upload progress, safe
  terminal errors, and deterministic Pinia tests.
- Same-origin Vite API proxying and an end-to-end Chromium test covering the complete
  browser workflow, request integrity, absence of stored tokens, and accessibility.
- Opt-in live Chromium coverage against an isolated real Server migration, API,
  worker, PostgreSQL schema, and local object store with automatic cleanup.
- An explicit deployed-origin Playwright mode used to verify the complete
  browser workflow through the independent `10443` test gateway; internal-CA
  certificate bypass is restricted to the opt-in test process.
- Vue 3, TypeScript, Vite, Vue Router, and Pinia application foundation.
- Honest Dashboard and Assets initialization views without synthetic product data.
- Server API client boundary with structured error handling and contract metadata.
- Vitest unit tests, Playwright smoke coverage, ESLint, type checking, and CI.
- Contributor, security, architecture, and local-development documentation.
- Fail-closed Server capability negotiation and strict structured-error parsing.
- Prettier format checks, contract-pin verification, accessibility smoke checks,
  dependency audit, license inventory, and SBOM CI.

### Fixed

- Capability negotiation now enables the implemented Phase 3 workflow only for exact
  API contract `0.4.0` and required feature compatibility.
- The typed upload contract now recognizes server-validated Android M4A originals
  while the browser workflow continues to select WAV files.
- Playwright preview startup now invokes Vite directly so hosted CI can detect
  the web server reliably.
