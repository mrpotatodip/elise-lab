# Source providers on the Runner: `github`, `gitlab`, `gitlab-sh` and `upload`

Where the code of a Scan comes from, for Scans that run on a Runner (`apps/elise-runner-cli`). Builds on `0004-repo-branches.md`. Terms: `apps/elise-engine-api/GLOSSARY.md`. Agreed in spec #223 (2026-11-19).

## Scope

**Runner Scans only, for now.** A Runner clones on the user's own computer, so EliseLAB never holds a token for a provider. The cloud design (stored tokens, Outbound signing, per-Scan host egress) is in "Deferred" below and is not built.

## The rule

**A provider is a whole flow, and no flow touches another.** The user picks a provider first. Each provider owns its folder, its URL or file rules, its contract schemas and its dashboard folder. Core knows only a `SourceProvider` port and one registry.

- Engine: `src/providers/<id>/`. Core stays under `src/modules/`. Only `src/providers/registry.ts` may import every provider.
- Lint (oxlint import restrictions) fails the build when core imports a provider, or one provider imports another. The rule lands before any new provider code.
- The Runner has the same split: one validator per provider, and no provider calls another's.
- The dashboard mirrors it: `src/providers/<id>/` for each provider's screens, a shared shell, the same lint rule.
- Adding a provider means adding one folder and one registry line.

## The providers

| id | Source | Identity `(provider, host, path)` |
|---|---|---|
| `github` | `https://github.com/owner/name` | `github`, `github.com`, `owner/name` |
| `gitlab` | `https://gitlab.com/group/subgroup/name` (nested paths) | `gitlab`, `gitlab.com`, the path |
| `gitlab-sh` | a host the user lists in their own Runner config | `gitlab-sh`, that host, the path |
| `upload` | a zip the user uploads | `upload`, no host, the app name |

- A Repo is identified by `(provider, host, path)`. The host is lowercased. Existing rows become `github` and `github.com`. The migration is additive.
- The port has capability flags (`canListRepos`, `hasBranches`, `isArchive`) so a provider that is not a git host does not pretend to be one.
- create-scan takes `provider`. A missing `provider` means `github`, so old clients keep working. The provider's own parser checks the input.

## The git providers

- The Runner validates the URL per provider before it runs `git`: scheme `https`, the provider's host, and a path of safe characters. It runs the clone with `GIT_ALLOW_PROTOCOL=https` and no terminal prompt, as it does today.
- **Hosts for `gitlab-sh` come from the user's local Runner config, never from the server's job.** A host named by the server could make the user's computer clone from somewhere else.
- A GitLab path may be nested. It is read up to `/-/` or a trailing `.git`.
- **Private repos are not proven.** The clone uses the user's own git credentials. Whether a private repo clones on a Runner has not been tested, and the Runner's own message calls its scope "public". A task ticket checks it, and nothing may claim private-repo support until it passes.

## `upload`

- The user creates an **upload app** with a name, unique per Account. In the database it is a Repo with `provider = upload`, the name as its path, no host, and **one hidden Branch**. The user never sees the Branch.
- The user may upload several zips under the app. Each is an **archive**: an ID, the app's Repo, a label, the R2 key under `accounts/{accountId}/…`, size, content hash and upload time. Every R2 object has a Neon row.
- Starting a Scan means picking one archive: `POST /scans` with `provider: upload`, the app name as `repo`, an `archive_id` and a `runner_id`, and no `ref`. An upload Scan runs only on a Runner. A link table (`scan_archive_links`: Scan, archive, tenant, with the composite foreign keys on the Account) records which archive the Scan read, and copies its label and hash. `scans` gets no upload columns. A zip may be scanned more than once, or never.
- **One History per app**: the zips are versions of the same code. The Scan sits on the hidden Branch `upload`, and the content hash (SHA-256, 64 hex digits) stands in for the commit; the server sets both from the link, whatever the Runner reports, and the Verdict takes the hash as its `commit`. Removing a zip deletes its row and its R2 object, sets the link's `archive_id` to null and leaves its Scans and findings: the Scan's `archive` shows the label with no ID ("file removed").
- The job carries an `archive` source. The Runner asks for that archive and the server serves it only to the Runner that claimed the job. The Runner unpacks it into its work folder, then runs the same clean-up it applies to a clone (`strip_untrusted`).
- Unpacking keeps paths inside the work folder, skips symlinks, and stops at a cap on archive size, unpacked size, file count and path depth. **One top-level folder is removed**, so a finding keeps the same path between `app-1.2/` and `app-1.3/` and the History matches it.

### Limits

The numbers live in `@repo/contracts/elise` (`UPLOAD_*` constants). Each refusal names its limit.

| Limit | Value | Where it is held |
|---|---|---|
| One zip | 50 MB | Upload route, before it reads the body (413) |
| Unpacked size | 250 MB | Upload route, from the zip's central directory (400); the Runner again while it unpacks |
| Files | 20,000 | Same as unpacked size |
| Path depth | 20 levels (`a/b.ts` is 2), counted before the top folder is removed | Same as unpacked size |
| Zips per app | 20 | Upload route (409) |
| Stored zips per Account | 500 MB, the sum of the zips' sizes | Upload route (409) |
| Repos per Account | 200, upload apps included; a removed Repo of any provider does not count | `POST /repos` (409) |

The central directory is the zip's own claim, so the upload route's check is an early answer, not the guard: the Runner stops at the same limits while it unpacks, whatever the directory said.

### Retention

- **A zip no Scan has read is deleted 30 days after upload**, row and file. "Read" means a `scan_archive_links` row points at it. A zip a Scan read stays until a person removes it.
- **Removing a zip** (`DELETE /repos/:repoId/archives/:archiveId`) deletes its row and its file.
- **Removing a Repo** (`DELETE /repos/:repoId`, any provider) sets `scan_repos.removed_at`; for an upload app it also deletes every zip's row and every object under the app's R2 prefix. It needs a login holding `company:repos:delete` (`tenant_admin` and `workspace_admin`; 403 for a member, and the service token alone is refused), is 409 while a Scan of the Repo is queued or running, 404 once removed, and writes `repo.removed` to the Audit trail. The Repo row stays, because deleting it would cascade to its Scans and findings: they stay in the History, each with its zip's label and no file. A removed Repo leaves the Repo list and takes no zip; adding it again (a git address, or an upload app's name) brings it back with its History.
- **The daily cron** (`scheduled` in the Worker, `triggers.crons` in `wrangler.jsonc`) runs the 30-day sweep on the owner role, up to 1000 zips a run, rows then files in one transaction. It also lists the objects under 50 random upload apps and deletes those a day old with no row: an upload writes its row and its file before it commits, so a failed commit can leave a file behind.
- **Older Runners are held back by the server.** An older Runner cannot refuse an `archive` job: its job type requires a `repo` string and would read one as a clone. So a Runner lists the job sources it reads in its claim (`{"sources":["git","archive"]}`), and the server keeps the list on the Runner row (`tenant_runners.job_sources`, `{git}` for a Runner that sent none). The claim never hands an `archive` job to a Runner without `archive`, and `POST /scans` for an upload app on such a Runner is refused with a message to update it.
- **The download** is `GET /runners/jobs/:scanId/archive`, for the Runner that claimed that job while it is claimed; anything else is 404. A zip removed since the Scan started is 404 with a message that says so, and a queued upload Scan whose zip was removed is failed with that message when it is claimed. The Runner unpacks under `core/src/providers/upload.rs`; a path with `..` or an absolute path refuses the whole zip, and the unpacked size is counted as it is written.

## Contracts and migrations

- `@repo/contracts/elise` gets a `provider` union, one file of schemas per provider, and the `archive` job source.
- Migrations are additive: the host and provider on Repos, the archive table and the link table. No live Scan row is rewritten.
- Deploy order follows `docs/standards/contracts.md` section 5: contracts with the `provider` default first, then the engine, then the dashboard and the Runner.

## Deferred: cloud Scans for GitLab

Not built. Kept so the findings are not lost.

- gitlab.com Free has **no group or project access tokens** (Premium only), and a **deploy token cannot use GitLab's API**. Checked on 2026-11-18 with a throwaway project: `/personal_access_tokens/self` answers 401, while clone, `ls-remote` and shallow clone work.
- So a cloud `gitlab` Connection would be a group or project deploy token with only `read_repository`, plus a scope path the user types. Branches would come from `git ls-remote`. There would be no repo list, no scope check and no expiry date from GitLab.
- A token would be sealed under a per-Account derived key bound to the Account, Connection and provider, loaded by the workflow's `prepare` step inside `withTenant`, and decrypted only by the Outbound handler, which has no database access.
- `gitlab-sh` in the cloud would need host rules (HTTPS on 443, hostnames only, a timeout, no redirects), per-Scan egress, a limit per Account, and an SSRF review.

## Not built

- Bitbucket and other hosts. OAuth sign-in with GitLab. Webhooks.
- A repo list for any provider.
- Cloud Scans for GitLab, and any stored provider token.
