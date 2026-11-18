# Source providers on the Runner: `github`, `gitlab`, `gitlab-sh` and `upload`

Where the code of a Scan comes from, for Scans that run on a Runner (`apps/elise-runner-cli`). Builds on `0004-repo-branches.md`. Terms: `apps/elise-engine-api/GLOSSARY.md`. Draft: not yet agreed in a spec.

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
- Proposed limits, to revisit: 50 MB archive, 250 MB unpacked, 20,000 files, 20 path levels. Zips per app and storage per Account: not set.
- Retention is not set. At least: delete an unclaimed upload after a time, and delete an upload when its app is removed.
- A Runner that does not know `archive` jobs must refuse them with a clear message. A minimum Runner version may be needed.

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
