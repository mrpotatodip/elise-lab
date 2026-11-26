# Running, deploying and reading live data

Failures that cost hours once. Read the section that matches the symptom.

## Scans fail on this Mac with `RangeError: Out of memory`

Claude Code in the sandbox image is `linux/amd64`. On Apple Silicon, Docker (Colima) runs it under emulation, and `claude` crashes at start with a Bun crash report. The Scan then fails with `claude exited 1: RangeError: Out of memory`. The container size (`standard-1`, 4 GiB, set in `scan-sandbox/constants`) is not the cause.

- Check: `docker run --rm --network none <sandbox image> claude -p hi` prints the crash, with the old image as well as the new one.
- Run Scans on the deployed Worker. Cloudflare runs x86, and the same image works there.
- Local `wrangler dev` is fine for everything that does not start a container.
- Not tried: Colima with Rosetta turned on.

## Deploy fails with `meta.db: input/output error`

`wrangler deploy` builds the image with Docker, which needs Docker running (Colima) and about 3 GB free on the Mac. If the Mac's disk fills while Docker writes, Docker's image store is damaged. Signs: the build error above, and `docker system prune` failing on a blob with `input/output error`.

1. Free space: `df -h /System/Volumes/Data` (the disk filling was the trigger).
2. `colima delete --force && colima start --cpu 2 --memory 4 --disk 100`. Pass the settings: a plain `colima start` after a delete uses 2 GiB of memory. The delete removes every local image and container (there are no volumes), so it needs a person's approval.
3. Deploy again. The image is rebuilt from nothing.
4. Check: `curl -s -o /dev/null -w "%{http_code}" https://api.eliselab.com/me` prints 401.

## A migration and a deploy that depend on each other

A migration that changes a key or adds a NOT NULL column that the new code writes (for example `0062`, the History key by Branch) breaks the old Worker, and the new Worker breaks without it. Check that no Scan is running (`status in ('queued','running')`), apply the migration, then deploy at once.

## A sole `tenant_admin` is locked out of Two-factor

Another admin does a 2FA reset from the Team list: ask for that first. Only when the Account has no other admin who can reset the Login, the operator does the same by hand, after confirming by another channel that the person asking is the owner.

1. Find the Login: `pnpm -s --filter @repo/db-elise db:query "select id, email, two_factor_enabled from auth_user where email = '<email>'" --table`.
2. Clear it in one transaction (live database: ask first; try `--dry` before): `pnpm --filter @repo/db-elise db:exec "delete from auth_two_factor where user_id = '<id>'; update auth_user set two_factor_enabled = false where id = '<id>'; delete from auth_session where user_id = '<id>'"`.
3. Tell the person to sign in with the password: the dashboard sends them straight to setup, with no skip. A lock after wrong codes needs no step of its own, as the `auth_two_factor` row holding it is gone.
4. Note it in the Audit trail by hand if the Account needs it; the manual route writes no entry and sends no Security notice.

## Reading live data without a token

- SQL: `pnpm -s --filter @repo/db-elise db:query "select ..."`.
- A route: `pnpm -s --filter elise-engine-api live:get /repos <accountId>` runs the app in-process against the live database and refuses any method but GET.

The production `SCAN_API_TOKEN` is not on this machine. The dashboard signs in as a person, and the local `.dev.vars` token is only a development value.
