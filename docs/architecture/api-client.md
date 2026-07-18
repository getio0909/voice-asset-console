# API Client Boundary

## Source of truth

`voice-asset-server/contracts/openapi.yaml` is the only REST contract. This console
consumes contract `0.22.0`, recorded in `CONTRACT_VERSION` and the immutable
`src/config/contract.ts` build pin, and must not guess Server fields.

When the validated OpenAPI contract changes:

1. Pin its contract version or source commit.
2. Generate deterministic TypeScript types/client code into a clearly marked
   generated directory.
3. Review the generated diff and cover behavior with API mock tests.
4. Update compatibility notes whenever the pinned version changes.

## Runtime rules

All REST calls originate in `src/api/`. Views and stores consume typed services and
do not call `fetch` directly. `ApiClient` accepts only paths relative to the configured
base URL, sends browser session cookies, requests JSON, and preserves Server request
identifiers in structured errors. Asset inventory calls normalize PostgreSQL-backed
title/latest-Transcript terms and Provider/Speaker filters, retain the complete
filter-bound opaque cursor, expose bounded Segment timecodes, exhaust bounded
collection pages, and send full
metadata replacements with the exact quoted resource-version ETag. Asset detail
calls expose only authenticated audio URLs, bounded processing status, complete
annotation paging, and validated note/bookmark creation. Permanent deletion is a
separate Owner-only request after trash: the client sends the exact asset UUID as
confirmation, the exact quoted version, and a fresh idempotency key, then observes
or explicitly resumes the durable purge job without fabricating completion. It
provides the only asset,
upload, job, transcript, device-session, glossary, LLM profile, review, approval,
authenticated-audio, and bounded transcript-export operations used by Pinia stores.
Export URLs are reconstructed from validated UUIDs instead of trusting a returned
navigation target. It also owns ASR capability discovery,
Provider Profile create/update/health, Hotword Set create/version/update, and
their exact resource-version ETags. Workspace profile reads and Owner renames
also stay in this boundary and use the exact current workspace ETag. The
deployment System Settings read returns only the Server's strict allowlist;
there is no client mutation method and no deployment-global table access. The
same boundary validates the exact LLM
capability set, HTTPS-only OpenAI-compatible configuration, safe custom header
names and values, LLM Profile create/update/health, and immutable Glossary Set
version/state ETags. Auto-approval policy changes replace the complete public
profile configuration with the current ETag and never resend a credential.

`VITE_API_BASE_URL` is public browser configuration and defaults to the same-origin
`/api/v1` path. `VOICEASSET_API_PROXY_TARGET` is consumed only by the Vite config for
development and preview. Neither value may contain credentials. The contract version
is compiled into the client and cannot be changed at deployment. ASR, LLM,
object-storage, or other provider secrets remain on VoiceAsset Server and must never
be returned to this application.

The browser never receives or persists a bearer or refresh token. Access and refresh
cookies are HttpOnly; session restoration rotates them through the dedicated refresh
endpoint. Unsafe requests rely on the browser-supplied Origin and Server-side
SameSite/Origin checks. The workflows
create independent idempotency keys, hash the full WAV and every part, and poll
only documented durable-job states. ASR and LLM profile responses contain only
public configuration and `secret_configured`; credential values are write-only.
ASR and LLM credential form refs are cleared after submit, route exit, provider
change, or sign-out, while both stores rebuild profiles from exact public field
lists. LLM custom-header names may be public configuration, but their values
remain write-only. A correction job may return a system-created `approved`
revision only when its review state, parent, and creator type agree; the store
then presents the immutable result instead of fabricating a client-side review.
Pagination and retry recovery are added only with corresponding Console
workflows.
