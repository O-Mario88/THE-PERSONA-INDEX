# Deploying

The whole app is one container image: the Go API, serving the built site
beside it. It runs on any host that runs containers, behind Cloudflare. This
page is the checklist for a first deploy and for every deploy after it.
Settings are described in [operations.md](operations.md#configuration),
monitoring in [monitoring.md](monitoring.md) and backups in
[backups.md](backups.md).

## The image

```sh
docker build --build-arg VERSION=$(git rev-parse --short=12 HEAD) -t persona-index .
```

- Built from the root `Dockerfile`: the frontend (`npm ci && npm run build`),
  then the API as one static binary, copied into a distroless image with no
  shell and no package manager, running as an unprivileged user. About 26 MB.
- `STATIC_DIR=/app/web` is set inside the image, so the site is served from
  the same address as the API, with the headers in `frontend/public/_headers`.
- The image has a `HEALTHCHECK` (`/app/api healthcheck`, which asks
  `/api/ready`). Hosts with their own health checks should use the paths
  below instead.
- CI builds the image on every pull request and smoke-checks it against
  Postgres (the `image` job in `.github/workflows/ci.yml`).

To try it on a laptop with a database: `docker compose up --build`, then open
<http://localhost:8080>. The secrets in `docker-compose.yml` are for that
laptop only.

The site can instead go on Cloudflare Pages (build `frontend/`, output `dist`)
with the image serving only `/api/`. Pages reads the same `_headers` file, so
the safety headers are identical either way. One image is simpler, and is what
the rest of this page assumes.

## Before the first deploy

1. **A managed Postgres 16** in the same region as the app, with
   point-in-time backups kept **7 days or less** ([backups.md](backups.md)
   says why and what to check).
2. **Connect straight to Postgres, not through a pooler in transaction
   mode.** The API keeps its own pool and sets a statement timeout when it
   connects; a pooler in transaction mode (PgBouncer and most managed
   poolers) can refuse one or both. Size the pool so that every instance's
   `DATABASE_MAX_CONNS` added up stays about 10 under the database's
   connection limit.
3. **Four secrets**, each made with `openssl rand -base64 48` and kept in the
   host's secret store, never in the repository:
   - `DEVICE_TOKEN_SECRET` and `DATA_KEY_SECRET` (both required).
     **Keep a copy of `DATA_KEY_SECRET` somewhere safe outside the host**
     (a password manager). It is never rotated; losing it orphans every
     phone's mirror ([operations.md](operations.md#keys)).
   - `EDGE_SECRET`: the value Cloudflare adds to every request (below).
   - `METRICS_TOKEN`, only if metrics are read on the public port
     ([monitoring.md](monitoring.md)).
4. **The settings for production:**

   | Setting | Value |
   | --- | --- |
   | `DATABASE_URL` | The direct connection URL, with `sslmode=require` (or the host's private network address) |
   | `DEVICE_TOKEN_SECRET`, `DATA_KEY_SECRET`, `EDGE_SECRET` | From the secret store |
   | `TRUST_CF_CONNECTING_IP` | `1` |
   | `DATABASE_MAX_CONNS` | See step 2; 20 is the default |
   | `METRICS_ADDR` | `:9090` if the host can scrape a private port; otherwise leave it out and set `METRICS_TOKEN` |

   `LOG_FORMAT` (JSON in production) and `ACCESS_LOG` (`errors`) can stay at
   their defaults. The server checks every setting when it starts, names
   every problem at once and refuses to start until they are fixed.
5. **Health checks:** readiness on `GET /api/ready` (200 when this instance
   can reach the database; 503 while it shuts down) and liveness on
   `GET /api/health`. Both work without the edge secret.
6. **Stop timeout of at least 20 seconds.** On a stop signal the instance
   answers 503 on `/api/ready` for 3 seconds so the load balancer moves
   away, lets requests in flight finish for up to 10 seconds, then counts the
   last votes and exits.
7. **At least two instances** once real people use it, so a deploy or a
   crash never takes the app down. Every instance can run the tally worker
   and the hourly jobs; they are safe to run side by side.

## Cloudflare

The app's address points at Cloudflare; Cloudflare forwards to the host.

1. **DNS:** the app's name as a proxied (orange cloud) record pointing at the
   host. If the host has no IPv6 address, leave out the AAAA record.
2. **SSL/TLS: Full (strict)**, once the host has its certificate for the
   name. HTTPS everywhere: "Always Use HTTPS" on. HSTS comes from the app's
   own headers, so leave Cloudflare's HSTS setting off.
3. **Edge secret:** Rules → Transform Rules → Modify Request Header, for all
   requests to the app's name: *Set static* `X-Edge-Secret` to the value of
   `EDGE_SECRET`. The origin then answers `403 edge_only` to anything that
   did not come through Cloudflare, so nobody can skip the edge's limits or
   forge `CF-Connecting-IP`. Set this rule **before** setting `EDGE_SECRET` on
   the host, or the site goes down until it is added.
4. **Rate limits and caching:** as in
   [operations.md](operations.md#edge-rules-cloudflare).

To change the edge secret without downtime: there is one value at a time, so
change the Transform Rule and the host setting within a minute of each other,
host second, during a quiet hour. Requests that land in between get 403.

## Every deploy

1. CI green on the pull request, including the `image` job.
2. Merge; the host builds or pulls the image for that commit.
3. Watch the new instances turn ready, then run, from anywhere:

   ```sh
   deploy/smoke.sh https://personaindex.com
   ```

   It reads the site, its safety headers and today's questions. **Never set
   `SMOKE_VOTE=1` against the live site**: that casts a real vote, and live
   results must only count real people.
4. Check the error rate and vote latency for ten minutes
   ([monitoring.md](monitoring.md)).

**Rolling back:** deploy the previous image. Migrations only ever add (a
file that has shipped is never edited), and so far each one adds only what
the build before it does not read, so the previous build runs on the newer
schema. Check the migration list in the pull request before rolling back
past one.

## Before real traffic

- Run the load gate against the real stack (Actions → load-gate, or
  `cmd/loadgen` from a machine near it) at the rate the next traffic step
  needs ([load-test.md](load-test.md)). The numbers on that page are from one
  test machine, not from the host.
- Do one restore drill ([backups.md](backups.md#restore-drill)).
- Point an alerting service at the metrics with `deploy/alerts.yml`.
