# CLI access: the Elise CLI's own credential, an exception to "no person's power in a program"

How the Elise CLI finds, starts and reads Scans for a person (spec #486). Terms: `apps/elise-engine-api/GLOSSARY.md` (Elise CLI, CLI access, Runner, Scan). The rule it sits beside: `docs/adr/0007-runner-login-own-device-flow.md`. The CLI's output rules: `docs/adr/0017-cli-output-contract.md`.

## The rule

**CLI access is its own credential. It is not the service token, not a session and not the Runner token.** One CLI access is tied to one person and one Account, has one scope (`read`, `start` or `admin`), and is accepted on a short list of routes. It acts as that person, so the person's Role limits it, and it never goes beyond the scope it was given.

This is an exception to ADR 0007. That record says a Runner never holds a person's session, and it still holds: a CLI access is not a session, and a Runner token still works on the Runner routes alone. What changes is that a program may now act as a person on purpose, in a narrow way the person chose, which ADR 0007 left as "not built".

## The choice

The CLI had only a Runner token, which cannot list repos or start a Scan. Three other things could have given it that. We built a fourth.

- **The service token (`SCAN_API_TOKEN`).** It vouches for any Account through `x-account-id`. Giving it to a program on a person's computer would hand over every Account. It stays with the dashboard server.
- **A session.** It carries all of a person's powers in every Account: billing, team, settings, two-factor. A CLI on a build box or an agent machine needs Scans, not those. Its life also follows the person's sign-in rules, and it cannot be removed one machine at a time.
- **The Runner token.** It is tied to a Runner row and works on the Runner routes. Widening it would blur two things an admin removes separately, and a Runner can exist with no CLI access (and the reverse).
- **CLI access.** Narrow by route, scope and Account, and revocable by itself.

## What it keeps

- **Routes.** It is accepted only where `src/lib/caller.ts` lists them. `read`: `GET` on `/me`, `/repos` (and one repo, its findings, Verdict and Archives), `/projects`, `/scans` (and one Scan, its files, diff and trace), `/findings`, `/files` and `/usage`. `start`: everything `read` does, plus `POST /scans`, stopping and resuming a Scan, adding a repo, adding a Branch, uploading an Archive and deleting one. `admin` is reserved for spec C (budget, key, management): no route asks for it yet, and an approval cannot give it. Billing, team, groups, two-factor, sign-up, Runner management and every other route refuse it as if no credential came.
- **The Role limits the scope.** It resolves to the person at the one place a session is resolved to a user, so each route's Power check still decides. At approval the person must hold the Powers the scope needs in that Account (`read`: dashboard or summary read; `start`: dashboard read), or the approval is refused. A Watcher gets `read` at most. A Role that loses a Power loses it for the CLI access too, as the check runs on every call.
- **One Account.** A call whose `x-account-id` differs from the Account of the CLI access is refused.
- **Stored hashed.** The token (prefix `elc_`, so a leaked one is easy to find and never mistaken for a Runner token) is shown to the CLI once. Only its SHA-256 is kept, with the person, the Account, the scope, who approved it and when, and when it was last used.
- **Revocable.** An admin with `company:runners:delete` revokes it from the Runners area, and the next call fails. The list never holds a token or a hash.
- **Not behind the two-factor gate.** `requireTwoFactor` looks at a session. A CLI access is not one, and it does not need the gate because it is created from an approval by a signed-in member, who already passed it, on the `/device` page. It cannot be created any other way.

## What it costs

A credential that acts as a person is more than a Runner token reaches, so a leak is worse than a leaked Runner token. The route list, the scope, the Role check and the revoke are what hold it down, and the route list has to be kept short: a route added to it is a decision for review, not a convenience. Two checks to make before widening it: whether an Archive upload needs a Power beyond dashboard, and that a bearer-only call never meets the origin check a session faces.

## What would change it

An `admin` scope in use (spec C) needs its own routes and a second look at this record. Giving a CLI access to a route that changes billing, team, groups, two-factor or Runner management is a new decision with its own record.
