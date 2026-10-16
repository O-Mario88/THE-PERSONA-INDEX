# Load gate

`backend/cmd/loadgen` simulates phones: it mints one signed device token per
phone, has each phone vote on three questions, then checks that every vote the
API acknowledged with 202 is in the tallies. The gate passes with 0 failed
requests, 0 acknowledged-but-uncounted votes and p95 latency at or under 300 ms.

```sh
# against a server you run, started with TRUST_CF_CONNECTING_IP=1
cd backend && go run ./cmd/loadgen -url http://localhost:8080 -rate 1000 -duration 60s
```

The `load-gate` GitHub workflow (Actions tab, run manually) does the same on a
CI runner against Postgres 16.

## What the gates mean

From the proposal's assumptions (1–2 sessions a day, 3 questions, 15% of a
day's votes in the busiest hour, a 10× viral burst on top):

| Daily players | Busiest hour | 10× burst |
| --- | --- | --- |
| 50k | ~10 votes/s | ~100 votes/s |
| 250k | ~50 votes/s | ~500 votes/s |
| 1M | ~200 votes/s | ~2,000 votes/s |

## Results

**2026-10-14, one 4-core cloud container** running the API, Postgres 16 (default
settings, local socket) and the load generator together, pool of 20 connections:

| Run | Votes | Achieved | Failed | p50 | p95 | p99 | Lost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000/s for 30 s | 30,000 | 865/s (old pacer) | 0 | 0.9 ms | 1.3 ms | 2.4 ms | 0 |
| 2,000/s for 60 s | 120,000 | 1,999/s | 0 | 0.9 ms | 2.2 ms | 29 ms | 0 |
| 500/s, API killed with `kill -9` at 14 s, restarted 2 s later | 15,000 | 500/s | 1,023 (while down) | 0.9 ms | 1.3 ms | 2.8 ms | 0 |

The crash run is the durability check: every vote acknowledged before the
kill was counted after the restart. One vote was counted that the client never
saw acknowledged (it committed as the process died); a retry with the same
idempotency key returns that same vote, so it still counts once.

What this does and does not prove: one instance and one Postgres comfortably
carry the 1M-player burst estimate on a small machine, with the tally worker
keeping up (0 untallied rows after the run). It does not cover network latency
to a managed database, the edge, or read traffic; repeat it against the real
staging stack before each traffic gate (50k, 250k, 1M).

**2026-10-15, after the privacy changes** (a vote and its mirror answer now go
in one transaction under the phone's lock, with the forgotten-phone check). The
same kind of container, but shared with other work, so the absolute numbers are
noisier than the day before. Each pair ran back to back on fresh databases,
2,000 votes/s for 30 s:

| Build | Votes | Failed | p50 | p95 | p99 | Lost |
| --- | --- | --- | --- | --- | --- | --- |
| This change, run 1 | 60,000 | 0 | 2.8 ms | 12 ms | 28 ms | 0 |
| `main` before it, run 1 | 60,000 | 0 | 4.3 ms | 107 ms | 166 ms | 0 |
| This change, run 2 | 60,000 | 0 | 3.9 ms | 29 ms | 96 ms | 0 |
| `main` before it, run 2 | 60,000 | 0 | 5.2 ms | 58 ms | 131 ms | 0 |

The vote path got no slower; one round trip in place of several is the likely
reason it is quicker. The load generator now leaves out intimate questions,
whose results the API no longer serves, so their votes cannot be checked
against a tally.
