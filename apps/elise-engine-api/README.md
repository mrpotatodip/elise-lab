# elise-engine-api

The scan Worker. It clones a GitHub repo into a Cloudflare sandbox, runs a Claude Code security audit there, and keeps the report. Hono for routes, Effect for services, better-auth for sessions.

Terms are in `GLOSSARY.md`. Routes are mounted in `src/index.ts`.

## Scan path

A scan runs as the `FullScanWorkflow`, then a `FullScanSandbox` Durable Object, then a container built from `Dockerfile.full`, which holds the full Skill. The container reaches the network only through `Outbound`, which signs model calls with the Anthropic key. The key stays in the Worker.

Neon records every scan in `scans`, `scan_files` and `scan_findings` (`packages/db-elise`). R2 holds the file bytes under `accounts/{accountId}/` and the scan ID. Each object has a `scan_files` row, so nothing in the bucket goes untracked. Only the names in `SCAN_SERVABLE_FILES` are served.

## Auth

`/scans/*` has two ways in, both checked in `src/lib/require-scan-access.ts`:

- the shared `SCAN_API_TOKEN` plus an `x-account-id` header the caller vouches for (the dashboard server uses this)
- a signed-in session whose user holds a Role in that account

`/auth`, `/sign-up`, `/me`, `/team` and `/groups` check for themselves.

## Secrets

| Name                    | Use                                                                |
| ----------------------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`     | The platform key for scans.                                        |
| `SCAN_API_TOKEN`        | Shared token for server-to-server calls.                           |
| `DATABASE_URL`          | Neon connection string.                                            |
| `AUTH_SECRET`           | better-auth signing secret.                                        |
| `KEY_ENCRYPTION_SECRET` | Optional. Without it an account cannot save its own Anthropic key. |

A scan's budget cap comes from its profile: Focused $12, Balanced $24, Exhaustive $50 (provisional until #142). A request may lower it, never raise it. `MAX_BUDGET_FULL_USD` (50) guards the table of caps.

## Run it

```bash
pnpm dev        # wrangler dev, needs Docker for the container
pnpm dev:log    # same, output teed to .dev.log
pnpm check      # tsc, tsc on tests, oxlint, vitest
```

Copy `.dev.vars.example` to `.dev.vars` first. Scans fail in local `wrangler dev` on Apple Silicon, so test them on the deployed Worker. `docs/ops.md` (repo root) covers that and the `meta.db: input/output error` deploy failure.

To read one route against the live database without a token, run `pnpm -s --filter elise-engine-api live:get /repos <accountId>` from the repo root.

## Seal old data (the backfill, ADR 0018 step 3)

A person runs this against the live database, after migration 0116 is applied and the write step (#505) is deployed. It seals the old plain rows and the old R2 objects and Archives, one Account at a time, and writes `fingerprint_hmac` beside the old fingerprint (no fingerprint or index is changed).

```bash
export DATA_MASTER_KEY=...  R2_ACCOUNT_ID=...  R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...   # the Worker's master key; an R2 API token for the bucket
pnpm --filter elise-engine-api seal:backfill --dry                 # counts what is left, writes nothing
pnpm --filter elise-engine-api seal:backfill --max-batches 20      # a first, small run (a batch is up to --batch rows, 50 by default)
pnpm --filter elise-engine-api seal:backfill                       # run it again, and again, until it prints "rows":0,"objects":0
```

The `DATABASE_URL` is the owner's, from the environment or `packages/db-elise/.env`. Every batch is one transaction as one Account. A value that starts with `sealed:v1:` (an object with `sealed=v1`) is skipped, so a stop, a crash or a second run never redoes finished work. `--account <id>` limits a run to one Account. The last line is a summary: `failed` (a value that would not open, nothing written for it), `unmapped` (a Repo-level row whose Finding is gone, so no HMAC), `missing` (a row whose R2 object is not there). Old audit rows keep their plain triage note: the audit log is append-only.

## Layout

- `src/modules/`: one folder per feature, such as `scan-workflow`, `scan-sandbox`, `scan-ledger`, `files`, `verdict`, `billing`.
- `src/lib/`: access checks, `app-deps.ts`.
- `skills/`: the scan agent's prompts. Every line costs tokens on every scan. The dashboard parses the `findings.json` they define, so change both together.
- `docs/usage-cost.md`: how to check the cost numbers. They come from the agent's own report and are an estimate.

## Tests

Side effects enter through `AppDeps` (`src/types/variables.ts`). Route tests pass in-memory fakes, and query tests run on pglite with every migration. Module mocking is banned by lint.

Vitest does not type-check, which is why `pnpm check` runs `tsc` on the tests too. From the repo root, read failures through `pnpm check:apps`, which trims the output.

## Before you change

Each of these has an ADR in `docs/adr/` at the repo root:

- Repo history and team management: `0002`
- The ship verdict and accepted risks: `0003`
- Branches: `0004`
- Private repos on a Runner: `0010` (the GitHub App, `0005`, is retired)

Lint is strict. The `anti-slop` rules reject a `try`/`catch` in a route, a bare `async` around Promise work, and a cast without a `// SAFETY:` line. The engine has no Node types, so use WebCrypto and `atob`, not `node:crypto` or `Buffer`. Run lint right after your first edit.
