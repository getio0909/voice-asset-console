# ADR 0001: Contract-First Vue Client

- Status: Accepted
- Date: 2026-07-16

## Decision

Use Vue 3, TypeScript, Vite, Vue Router, and Pinia. All HTTP traffic crosses the
typed boundary in `src/api/`; views do not call `fetch`. The client compiles in
Server contract `0.22.0`, checks `/api/v1/system/capabilities` at startup, and
fails closed on incompatible versions, missing required features, or malformed
wire documents.

## Consequences

Deployment can configure only the public API base URL, not rewrite the contract
pin. The first tested view consumes authentication, uploads, Mock ASR jobs, audio,
and raw transcripts through this boundary. Future OpenAPI generation must preserve
the boundary and update the compatibility matrix with the contract source commit.
