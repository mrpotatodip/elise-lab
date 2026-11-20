# Runners clone with the person's Git login, and the dashboard has no Connections

Terms: `apps/elise-engine-api/GLOSSARY.md` (Git login). Agreed in spec #271.

## The rule

**A Runner reads private code with the person's own Git login, and Elise never holds a provider token.** Before it clones, the Runner asks the remote for its branch list. When that fails on login, the Scan fails at once and its error names the host and the fix for that Provider. The Runner prints the fix and never runs it. `elise-runner doctor` runs the same check ahead of time.

A headless Runner with no keychain may take one opt-in token in `ELISE_GIT_TOKEN`. It is handed to git through a temporary credential helper that answers only for the host being cloned and is deleted afterwards.

## The dashboard has no Connections

The Connections page, its callback route, the connect card and the repo picker are gone. A Repo is added by pasting its address, with one hint pointing at `doctor`.

## ADR 0005 stays for the cloud path

`0005-private-repos-github-app.md` still describes how the cloud path reads a private GitHub repo. No dashboard flow uses it. The engine routes and the Install tables stay until a person decides on their retirement (#277).

## Not decided here

A private GitLab repo and a fresh computer with no saved login are not yet checked end to end.
