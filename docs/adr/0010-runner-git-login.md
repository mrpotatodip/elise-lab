# Runners clone with the person's Git login, and the dashboard has no Connections

Terms: `apps/elise-engine-api/GLOSSARY.md` (Git login). Agreed in spec #271.

## The rule

**A Runner reads private code with the person's own Git login, and Elise never holds a provider token.** Before it clones, the Runner asks the remote for its branch list. When that fails on login, the Scan fails at once and its error names the host and the fix for that Provider. The Runner prints the fix and never runs it. `elise-runner doctor` runs the same check ahead of time.

A headless Runner with no keychain may take one opt-in token in `ELISE_GIT_TOKEN`. It is handed to git through an inline credential helper in git's configuration that answers only for the host being cloned. No script file is written, and the token travels only in an environment variable (changed for Windows, ADR 0015).

## The dashboard has no Connections

The Connections page, its callback route, the connect card and the repo picker are gone. A Repo is added by pasting its address, with one hint pointing at `doctor`.

## ADR 0005 is retired

`0005-private-repos-github-app.md` is superseded by this record (#277). The engine no longer has the `/github/*` routes, the Install lookup in create-scan, the `GITHUB_APP_*` secrets or the Outbound credential. The `tenant_github_installations` table and the `scans.installation_id` and `scans.github_repo_id` columns are dropped (migration 0096). The cloud container clones public repos only, with no credential; a private repo runs on a Runner. `scans.is_private` and `scan_repos.is_private` stay, because the dashboard still reads them for old rows; nothing writes them now.

## Not decided here

A private GitLab repo and a fresh computer with no saved login are not yet checked end to end.
