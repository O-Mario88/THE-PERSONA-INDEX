# syntax=docker/dockerfile:1
#
# One image for the whole app: the Go API serving the built frontend beside
# it (STATIC_DIR). It runs on any host that runs containers; docs/deploy.md
# says how. Build it with the commit it comes from:
#
#   docker build --build-arg VERSION=$(git rev-parse --short=12 HEAD) -t persona-index .

# The frontend: the app, the public read pages and the service worker.
FROM node:22-bookworm-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# The read pages are checked against the evidence library at build time.
COPY backend/content/sources.json /src/backend/content/sources.json
RUN npm run build

# The API: one static binary, no C libraries.
FROM golang:1.24-bookworm AS api
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/api .

# The image itself: the binary, the site and nothing else. No shell, no
# package manager, and it runs as an unprivileged user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /out/api /app/api
COPY --from=web /src/frontend/dist /app/web
ENV PORT=8080 STATIC_DIR=/app/web
EXPOSE 8080
USER nonroot:nonroot
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 CMD ["/app/api", "healthcheck"]
ENTRYPOINT ["/app/api"]
