# Security Policy

## Supported versions

VoiceAsset Console has no released version yet. Security fixes currently target the
active development branch only. A version support table will be published with the
first release.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's **Report a vulnerability** private security
advisory for this repository and include affected versions, reproduction steps,
impact, and any suggested mitigation. Do not include real credentials, recordings,
transcripts, or personal data in the report.

Maintainers will acknowledge a complete report, coordinate validation and a fix,
and publish an advisory when disclosure is safe. Avoid testing against systems or
data you do not own or have permission to access.

## Frontend security boundaries

- Every `VITE_` value is public because Vite bundles it into browser code.
- Provider and LLM secrets belong only on VoiceAsset Server.
- Do not persist access tokens in `localStorage`; use the Server's secure session
  design and CSRF protections.
- Route all REST calls through `src/api/` and preserve request identifiers in errors.
- Never commit `.env` files, real provider responses, cookies, tokens, or user audio.
