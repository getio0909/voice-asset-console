# ADR 0002: Same-Origin Session Workflow

- Status: Accepted
- Date: 2026-07-16

## Decision

Keep the browser API base at the same-origin `/api/v1` path. Vite development and
preview servers proxy that path to VoiceAsset Server; production deployments must
provide the equivalent reverse-proxy route. Authentication uses only the Server's
HttpOnly, SameSite session cookie. Console code does not set `Origin`, read a token,
or persist authentication data.

The Phase 1 workflow hashes the whole WAV and each Server-sized part with Web Crypto,
uploads parts sequentially, completes verification, creates a Mock ASR job, and polls
documented terminal states with a five-minute bound. The transcript revision and audio
are then read through the authenticated public API.

## Consequences

Cross-origin Console/API deployments are unsupported until an explicit Server CORS
and CSRF contract exists. Browser hashing currently materializes the selected file for
Web Crypto, so very large files can increase memory pressure even though the Server
accepts files up to 512 MiB. No provider or storage secret enters browser configuration.
