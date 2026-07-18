# syntax=docker/dockerfile:1.9@sha256:fe40cf4e92cd0c467be2cfc30657a680ae2398318afd50b0c80585784c604f28
FROM node:24.12.0-alpine3.23@sha256:c921b97d4b74f51744057454b306b418cf693865e73b8100559189605f6955b8 AS build

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS runtime
ARG VERSION=0.1.0-dev
ARG COMMIT=unknown
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.source="https://github.com/getio0909/voice-asset-console" \
      org.opencontainers.image.title="voiceasset-console" \
      org.opencontainers.image.version="${VERSION}"
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=65532:65532 /src/dist/ /srv/
USER 65532:65532
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--spider", "--quiet", "http://127.0.0.1:8080/"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
