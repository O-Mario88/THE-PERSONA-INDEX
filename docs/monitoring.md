# Monitoring

What the API reports about itself, what to alert on, and what to do first
when an alert fires.

## Health

| Path | Answers | Use it for |
| --- | --- | --- |
| `GET /api/health` | 200 while the process runs | Liveness: restart the instance if this fails |
| `GET /api/ready` | 200 when this instance can reach the database; 503 `database_unavailable` if it cannot, 503 `shutting_down` while it stops | Readiness: send traffic only while this is 200 |

Both answer without the edge secret, so the host's own checks reach them.
`/app/api healthcheck` asks `/api/ready` from inside the container.

## Metrics

Prometheus text format, never cached:

- **On a private port:** set `METRICS_ADDR=:9090` (or `127.0.0.1:9090`) and
  scrape `http://<instance>:9090/metrics`. Use this when the host can scrape a
  port the public cannot reach.
- **On the public port:** set `METRICS_TOKEN` (32+ bytes) and scrape
  `/metrics` with `Authorization: Bearer <token>`; a wrong or missing token
  gets 401. With no `METRICS_TOKEN` set, `/metrics` on the public port is
  404, as if it did not exist.

Labels are only ever the route pattern (`POST /api/votes`,
`GET /api/questions/{questionId}/results`), the status code and the job name:
never a path, a date, an id, an address or anything a person sent.

| Metric | What it says |
| --- | --- |
| `persona_build_info{version,go}` | Which commit is running |
| `persona_start_time_seconds` | When this instance started |
| `persona_http_requests_total{route,code}` | Requests answered. `route="static"` is the site, `"unmatched"` an unknown path |
| `persona_http_request_duration_seconds{route}` | Time to answer, as a histogram |
| `persona_http_panics_total` | Requests whose handler crashed (answered 500; the log has the stack) |
| `persona_edge_refused_total` | Requests refused for not coming through Cloudflare |
| `persona_job_last_success_timestamp_seconds{job}` | When each background job last finished without error (0 if never) |
| `persona_job_last_duration_seconds{job}`, `persona_job_errors_total{job}`, `persona_job_rows_total{job}` | How long each job took, how often it failed, and the rows it counted, folded or deleted (weeks, for `mirror_fold`) |
| `persona_tally_backlog_votes` | Accepted votes not counted yet; -1 if the database did not answer |
| `persona_db_connections{state}` | The pool: `max`, `open`, `idle`, `in_use` |
| `persona_db_acquire_waits_total`, `persona_db_acquire_seconds_total` | How often requests waited for a free database connection, and the total time spent getting one |
| `persona_go_goroutines`, `persona_go_heap_bytes`, `persona_go_gc_pause_seconds_total` | The Go runtime |

The jobs are `tally` (every second) and, every hour in this order,
`vote_retention`, `mirror_fold`, `week_retention`, `mirror_retention`,
`backup_retention` and `social_retention` (friend answers, nods, Answer
Together, sign-in codes, rooms and invites past their time).

## Alerts

`deploy/alerts.yml` holds the rules, in the format Prometheus, Grafana and
most hosted monitoring services read. A test (`backend/alerts_test.go`)
fails if a rule names a metric the server does not write. *Page* means look
now; *ticket* means look today.

- **PersonaInstanceDown** (page): an instance stopped answering. Check the
  host's console for crashes or failed deploys; roll back if a deploy just
  went out.
- **PersonaDatabaseUnreachable** (page): votes are being refused with 503.
  Check the database's status page and connection limit; `/api/ready` turns
  503 on affected instances so traffic moves to healthy ones.
- **PersonaServerErrors** (page): over 1% of requests fail with 5xx. Find the
  route in `persona_http_requests_total` and the error in the logs by its
  request id.
- **PersonaVotesSlow** (page): the slowest 5% of votes take over 300 ms.
  Compare `persona_db_acquire_seconds_total` with the vote time: if most of
  it is waiting for connections, add instances or raise
  `DATABASE_MAX_CONNS` within the database's limit
  ([load-test.md](load-test.md)); if not, the database itself is slow.
- **PersonaTallyStopped** (page): no votes counted for 2 minutes, so results
  are going stale. Check the `job failed` log lines for `tally`. Accepted
  votes are safe in the database and are counted once the worker runs again.
- **PersonaTallyBehind** (ticket): over 20,000 votes waiting. The worker is
  running but slower than the votes coming in; more instances add workers.
- **PersonaHourlyJobsStopped** (ticket): a retention or folding job has not
  finished for 3 hours, so data is being kept past what
  [data-map.md](data-map.md) promises. Check its `job failed` log lines, fix,
  and confirm with `go run . check`.
- **PersonaPanics** (ticket): a handler crashed. The log line `panic` has the
  stack and the request id.
- **PersonaDatabasePoolFull** (ticket): an instance uses over 90% of its
  connections; see PersonaVotesSlow.
- **PersonaOriginProbed** (info): something is calling the origin directly.
  Harmless while `EDGE_SECRET` is set; check that the origin address has not
  been published somewhere.

## Logs

One line per event on standard error, JSON in production (`LOG_FORMAT`).

- `ACCESS_LOG=errors` (the default) logs requests that fail with 5xx or take
  1 second or more; `all` logs every request; `off` none. An access line has
  the request id, method, route pattern, status, duration and size. **Never**
  the path, the query string, the address, the user agent or the pass.
- Every response carries `X-Request-Id` (Cloudflare's `CF-Ray` when the
  request came through it), and the same id is in the log line, so a person's
  report of a failure can be found without knowing who they are.
- Background jobs log `job done` when they delete or fold rows, and
  `job failed` with the error.
- On a stop signal: `draining`, then `stopped`.

Keep logs for 30 days or less. They hold no personal data, but there is no
reason to keep them longer.

## Daily check

Once a day, from a scheduled job on the host or any machine that can reach
the database:

```sh
cd backend && DATABASE_URL='<the live database>' go run . check -json
```

It exits 1 and names the problem if the schema is behind, votes are stuck
uncounted, any kind of data is older than its retention allows, or the frozen
schedule runs out within 90 days. Pass `-vote-retention-days` if the servers
run with a `VOTE_RETENTION_DAYS` other than 7.
