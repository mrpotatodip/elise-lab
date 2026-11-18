# Runner login: our own device flow, not better-auth's device plugin

How a headless Runner connects from the terminal with no code to copy (`elise-runner login`, #184). Terms: `apps/elise-engine-api/GLOSSARY.md` (Runner, Runner login). Rules for the Scan a Runner then runs: `docs/adr/0006-full-worker-and-phase-budget.md`.

## The rule

**A Runner never holds a person's session.** A login ends with the Runner holding a Runner token: the same kind of token `pair <code>` hands out, tied to one Runner row in one Account, which an admin can remove. Nothing in the flow gives the program a session, a cookie or a token that acts as a person.

## The choice

We built the flow ourselves (`/runners/login/*`, the `platform_runner_device_logins` table, the dashboard's `/device` page) on the shape of RFC 8628: a user code the person sees, a device code only the Runner sees, a check on an interval, `slow_down`.

better-auth ships a device plugin for the same shape. We did not use it for Runners, because on approval it hands the device **a session of the person who approved**. For a Runner that is the wrong thing to hold:

- A Runner is meant to run unattended on a server, a build box or inside a container, for as long as nobody removes it. A person's session on that machine reaches everything the person can reach (every Account, billing, the team page), not one Account's Scans.
- Its life would follow the person's session rules, not the Runner's, so a Runner could stop or outlive the person's access for reasons that have nothing to do with the Runner.
- An admin could not remove one Runner to stop it. The session would have to be revoked, and that is the person's login.
- The Runners list, the Audit trail and the Runner limits all work on a Runner row. A session has none.

So the approval does what `pair <code>` does: it enrolls a Runner in the Account the member picked, with the name the member chose, and the Runner collects that Runner's token.

## What it keeps

- **Codes are stored as hashes** (`user_code_hash`, `device_code_hash`, unique), both work once and both expire after 10 minutes. The device code is 32 random bytes and never reaches the browser; the user code is the one the person reads.
- **The token is collected once.** After the Runner collects it the row is `collected` and a second check gets nothing.
- **Approving and denying are Account powers.** The approver needs `company:runners:create` in the Account they pick. Reading a pending login by its user code needs only a signed-in member, and shows the computer's name, OS, CPU, version and the IP that started it, so a person can see whether it is theirs.
- **Starting is limited** per IP and in total, and the suggested fields are capped, so nobody can fill the table. A check sooner than the interval is answered `slow_down` and lengthens the interval.
- **The page names who and what.** Approval writes an Audit trail entry and the Runners list shows who added each Runner.
- **`pair <code>` and `ELISE_RUNNER_TOKEN` stay.** A box with no browser, a script and a container need a way that has no approval page.

## What it leaves

better-auth's device plugin stays an option for a later login of a **person** from the terminal (a CLI that acts as its user). That is a different thing: the program would hold a session on purpose. It is not built, and it would not replace this flow, because a Runner is not a person.
