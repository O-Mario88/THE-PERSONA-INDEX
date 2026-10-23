# Backups

The database is the only thing that needs backing up: the image is rebuilt
from the repository, and the secrets live in the host's secret store (with a
copy of `DATA_KEY_SECRET` kept safe outside it; see [deploy.md](deploy.md)).

## The rule: 7 days or less

Use the host's managed point-in-time backups, kept **7 days or less**.

The reason is the privacy promise. "Delete everywhere" removes a phone's rows
from the live database at once ([data-map.md](data-map.md)), but every backup
taken before that moment still holds them. With backups kept 7 days at most,
deleted data is gone from everything within 7 days. Longer retention would
quietly break that promise, so check it on the host's settings page:

- **The window itself** is 7 days or less.
- **Manual or on-demand backups** are deleted within 7 days. Some hosts keep
  them until someone deletes them.
- **A final backup on deleting the database** is turned off, or deleted
  within 7 days. Some hosts keep one for 30 days by default.
- **Exports and dumps** (`pg_dump` files, copies for a migration) are deleted
  within 7 days, and never stored outside the host's region.

The host comparison (Edwin's decision, Phase 4) lists each option's backup
settings.

## Restoring

Restore into a **new** database and point the app at it once it checks out.
Never restore over the live database.

1. In the host's console, restore to the latest moment before the incident.
2. Check the copy (only `DATABASE_URL` is needed, no secrets):

   ```sh
   cd backend && DATABASE_URL='<the restored copy>' go run . check
   ```

   It reports the schema, the tally backlog, whether each kind of data is
   within its retention, the frozen schedule, and the rows kept. Exit 0 means
   nothing is wrong, 1 names each problem, 2 means it could not run (for
   example, the database cannot be reached). A copy restored from before a
   migration names the missing migration; the app adds it when it starts.
3. Point `DATABASE_URL` at the copy and deploy. Run `deploy/smoke.sh` against
   the site (never with `SMOKE_VOTE`).
4. Delete the old database once the incident is understood, and in any case
   within 7 days.

**What a restore loses.** Everything written after the restore point: votes,
answers, steps and backups made in that window. Phones keep their own copies
of their answers and notebooks, so people lose little of their own, but
results lose those votes.

**What a restore brings back.** "Delete everywhere" pressed after the restore
point is undone in the database too. Those phones have already dropped their
pass, so nobody can read the restored rows, and they leave with normal
retention: answers and steps within 35 days, weekly notes and backups within
400. This is the one way deleted data can outlive the 7-day rule, so restore
to as late a moment as the incident allows. Re-running those deletions
exactly would need a record of them kept outside the database; that is not
built.

## Restore drill

Once before real traffic, then every three months:

1. Restore the live database's latest point into a new database.
2. Run `go run . check` against it (above) and note the exit code and row
   counts next to the live database's.
3. Start one instance of the current image against the copy, on a private
   address, and run `deploy/smoke.sh` against it.
4. Delete the copy.
5. Write the date, how long the restore took and anything that surprised you
   at the end of this page.

### Drills so far

- **2026-10-23, local only, not on a host:** a 16 MB `pg_dump` of the
  load-test database (240,000 votes and taps, 120,000 answers) took 1.8 s to
  dump and 2.3 s to restore into a new database on the same machine;
  `go run . check` passed on the copy with all 6 migrations and every row
  count matching. The first run found that `check` asked for the production
  secrets and reported zero rows for a database it could not reach; both are
  fixed. The first drill on the chosen host is still to do.
