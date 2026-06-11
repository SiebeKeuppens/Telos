# ---- Stage 1: build the PWA (Vite) ----
# Debian (glibc), not Alpine: the server is arm64 (Ampere A1), and the native
# arm64 binaries for rolldown/tailwind-oxide/lightningcss are reliably
# published for gnu — the musl-arm64 variants are not guaranteed.
FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web

# Firebase web config, inlined into the client bundle at build time
# (auth-only project config — public by design, like the other suite apps).
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

COPY web/package*.json ./
# npm install (not ci): Windows-written lockfile vs Linux-resolved wasm
# optionals — see the deploy workflow note.
RUN npm install
COPY web/ ./
# The repo's web/.env is for local dev (VITE_AUTH_MODE=dev) — it must never
# reach a production build.
RUN rm -f .env .env.local && npm run build

# ---- Stage 2: build the Go API ----
FROM golang:1.25-alpine AS server-build
WORKDIR /app/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -o /telos-api ./cmd/api

# ---- Stage 3: runtime — one container serves /api/v1 + the SPA ----
# (alpine + golang:alpine are multi-arch; the Go binary builds natively on
# arm64, so the rest of the pipeline needs no architecture awareness.)
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=server-build /telos-api ./telos-api
COPY --from=web-build /app/web/dist ./web

ENV PORT=8080 \
    WEB_DIST=/app/web \
    TELOS_ENV=production
EXPOSE 8080

CMD ["./telos-api"]
