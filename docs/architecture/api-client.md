# API Client Boundary

## Source of truth

`voice-asset-server/contracts/openapi.yaml` is the only REST contract. This console
consumes contract `0.1.0`, recorded in `CONTRACT_VERSION` and the immutable
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
and trace identifiers in structured errors.

`VITE_API_BASE_URL` is public browser configuration. It must never contain credentials.
The contract version is compiled into the client and cannot be changed at deployment.
ASR, LLM, object-storage, or other provider
secrets remain on VoiceAsset Server and must never be returned to this application.

Authentication, CSRF token acquisition, retries, pagination, ETag handling, and
idempotency will be implemented only against the validated Server contract. They are
deliberately not simulated in the initialization shell.
