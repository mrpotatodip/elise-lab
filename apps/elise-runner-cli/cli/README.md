# elise-runner (the headless Runner)

`elise-runner` is a command-line program that runs Scans started in Elise on this computer, with no window. Pair it with a one-time code, start it, and leave it running on a server, a build machine or a terminal-only box. It claims the Scans that are started for it in the dashboard, runs them, and logs what it does to standard output.

It is a Runner like the desktop app (the folder above): both run Scans through one shared core, `core/` (`elise-runner-core`), so a Scan behaves the same whichever runs it. Its rules are in `docs/adr/0006-full-worker-and-phase-budget.md`, under "Runner Scans". To Elise the two are two Runners. On one computer each is paired with its own code and holds its own token, so neither reads or changes the other's. The desktop app runs one Scan at a time. The headless Runner runs one by default, and up to three with `--parallel`. The headless Runner shows in the Runners list in Elise like any other Runner, and removing it there stops it claiming Scans.

It supports macOS and Linux. Windows is not supported.

## What you need

- A Rust toolchain to build it: `cargo build -p elise-runner-cli --release` in `apps/elise-runner-cli` (the binary is `target/release/elise-runner`). The `full` Skill is built into the binary, so that one file is all you install.
- Claude Code (`claude`) installed and signed in, as the user the Runner runs as. The Runner uses that login.
- Node.js (`node`). The Skill's validators run on it.
- A way to connect: `elise-runner login` (approve in the browser), or a pairing code. Add a Runner in Elise to get a code. A code works once and expires after 10 minutes.

`claude` and `node` are found the way the desktop app finds them. A Scan fails with an error that names the one it could not find.

## Commands

```
elise-runner login [--no-browser]
elise-runner pair <code> [--yes] [--print-token]
elise-runner status
elise-runner run [--once] [--parallel N]
elise-runner unpair
elise-runner --help | --version
```

- `login` connects this Runner with no code. It starts a login with Elise (sending this computer's name, its OS and CPU, and the program's version, nothing else), prints a link and a code, and opens the link in the browser when the computer has a desktop session: `open` on macOS, `xdg-open` on Linux only when `DISPLAY` or `WAYLAND_DISPLAY` is set, never when `SSH_CONNECTION` is set or with `--no-browser`. A browser that fails to open is not an error. The link is the dashboard's `/device` page: a signed-in member sees this computer's name, OS, CPU, the program's version and the IP that asked, picks the Account, sets the Runner's name, and approves or denies. It then checks every 5 seconds, until the expiry Elise named for the code (10 minutes), until you approve the login in Elise, and saves the token. If Elise answers "slow down" it keeps the longer interval Elise names. A denied login ends with "The request was denied in Elise." and an expired one with "The code expired; run `elise-runner login` again.", each with exit 1. Approving in the browser is the confirmation, so it does not ask `y/N`. Ctrl-C cancels the wait and exits with 1. If this Runner already holds a token, it says that logging in replaces that Runner, and revokes the old token after the new one is saved, as `pair` does. With `ELISE_RUNNER_TOKEN` set it refuses, as `pair` does. Against an Elise without the login routes it says to use `pair <code>` and exits with 1.
- `pair <code>` is the way for CI, scripts and a box with no browser: you get the code first in Elise (Add a Runner), then give it here. It shows the Account name and the Runner name the code belongs to and asks `y/N`. On yes it saves the token. On no it revokes the token Elise issued, so none is left. `--yes` accepts without asking, for a script. If this Runner already holds a token, the new one is saved first and then the old one is revoked; if that revoke cannot reach Elise, the program says so and names the old Runner, so an admin can remove it in Elise.
- `pair <code> --print-token` enrolls and confirms as usual, then prints the token once on standard output and saves nothing. See "In a container".
- `doctor [host...]` checks that git is installed, `claude` is signed in, this Runner is paired and git can read from each host you name or list in settings, one `pass` or `FAIL` line each with the fix beside a failure. It exits 1 when any check fails.
- `status` says whether this Runner is unpaired, connected (with its name and Account), revoked or offline, and names the token store in use.
- `run` claims and runs Scans until you stop it. It runs one Scan at a time unless you give `--parallel N`.
- `run --parallel N` runs up to N Scans at once, N from 1 to 3 (1 is the default; anything else is a usage error, exit 2). Elise allows 3 live Runner Scans for an Account, shared by all its Runners, so a Scan that would be the fourth is refused when it is started in Elise, not here. Parallel Scans are on different Repos, because an Account has one active Scan per Repo. Each Scan has its own work folder and its own Pool, so one that fails or runs out of money leaves the others running. Every log line starts with `[repo scan_id]`, so interleaved lines can be told apart. One Ctrl-C (or a stop signal) stops every running Scan, each reports as it does for a single Scan, and the program exits after the last report is sent. Running N `claude` runs at once uses N times the CPU, memory and Claude usage.
- `run --once` claims the Scans that are queued, up to the number `--parallel` allows (one by default), runs them together, reports them and exits. It exits 0 only if every Scan succeeded, and with nothing to claim it exits at once with 6.
- `unpair` tells Elise to drop the token, then forgets it.

The program never prints the token in its log, in `status` or in an error. `pair --print-token` is the one exception, because you ask for it.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | success; `status`: connected |
| 1 | an error (including a Scan that failed under `run --once`) |
| 2 | bad command-line usage |
| 3 | unpaired |
| 4 | revoked (Elise rejected the token) |
| 5 | offline (Elise could not be reached) |
| 6 | `run --once`: nothing to claim |
| 7 | `run --once`: the Scan was stopped from Elise |

When Elise rejects the token during `run` (an admin removed the Runner), the program forgets the token, says so and exits with 4. Pair again with a new code. The same goes for a rejection while a Scan runs: the agent is stopped first, nothing is sent and the work folder is kept.

## Where the token is kept

In this order:

1. `ELISE_RUNNER_TOKEN`, if set. It is read only: `pair`, `login` and `unpair` refuse to manage a token that came from it, and say so.
2. The system keychain (macOS Keychain, or a Secret Service on Linux), under the service name `com.eliselab.runner.headless`. The desktop app uses `com.eliselab.runner`, which is why the two are separate Runners.
3. When the computer has no keychain service, as on many Linux servers, a file in your config folder (`~/.config/elise-runner/token` on Linux), created readable by you only.

`status` names the store in use.

## What a run does

`run` runs a Scan as the desktop app does: clone, the four Phases on one Pool, the validators, one repair run if they fail, and upload. It logs one plain line per step on standard output, each starting `[owner/name scanId]`: claimed, each Phase started and ended with what it spent and what is left of the Pool, repair started, result sent or not, and how the Scan ended. The lines are plain so that systemd, Docker or a CI log can capture them.

## Where a Scan may clone from

The Runner clones only `https://` addresses, with your own git login and no terminal prompt. It checks the address before git runs, with the rules of the address's provider (`docs/adr/0008-git-providers.md`):

- `github.com`: `https://github.com/owner/name`.
- `gitlab.com`: `https://gitlab.com/group/name`, with groups inside groups. A pasted branch view (`…/-/tree/main`) or a trailing `.git` still names the repository.
- A GitLab server your company runs: only a host you list in `settings.json`, in the same config folder as the token file (`~/.config/elise-runner/settings.json` on Linux): `{"gitlabHosts": ["git.example.com"]}`. A host that only Elise's job names is refused, so a forged job cannot send this computer to clone from somewhere else. The file is read again for every Scan. The desktop app reads a `settings.json` in its own config folder.

A private `gitlab.com` repository clones with your own git login (checked 2026-11-19, #227). The Runner never asks for a password, so store the login once with a normal `git clone` in a terminal. A gitlab.com fine-grained token needs the project permission "Code: Download", and GitLab refuses an account password when two-factor sign-in is on. A private GitHub repository and a private repository on a company GitLab server are not tested yet.

A headless Runner with no keychain (CI, a container) can take one git token in `ELISE_GIT_TOKEN`. It is opt-in and is for those places: on a computer with a git login, leave it unset. For each clone the Runner writes a temporary credential helper that answers only for the host that Scan clones from (the host of the checked address, never one the job text alone names), and deletes it when the clone ends, success or failure. The token goes into no file: the helper reads it from the clone's own environment. The agent never gets `ELISE_GIT_TOKEN`. Make it a read-only token (GitHub: fine-grained "Contents: read"; GitLab: `read_repository`).

An upload Scan reads a zip instead of a clone. Each claim tells Elise this Runner reads zips (`{"sources":["git","archive"]}`); an older Runner says nothing, and Elise refuses to start an upload Scan on it, asking to update it. The Runner downloads the zip of the job it claimed (Elise serves it to no other Runner) and unpacks it in the work folder: a path with `..` or an absolute path refuses the whole zip, links are skipped, and the limits are 50 MB of zip, 250 MB unpacked, 20,000 files and 20 path levels. When everything sits in one top folder, that folder is removed, so `app-1.2/src/a.rs` and `app-1.3/src/a.rs` are both `src/a.rs`. The same clean-up as after a clone follows. A zip removed while its Scan waited fails the Scan with that reason.

A Scan uses your Claude login but not your Claude Code settings. It runs under its own settings and tool allowlist and never reads or changes your `~/.claude` folder. The agent does not get `ELISE_RUNNER_TOKEN`, and on Linux its settings deny reading `/proc`, so a hostile repository cannot make it copy the token into a report.

A succeeded Scan's work folder is removed once its result is sent. A failed Scan's is kept and its path is printed on the last line, with the agent's log and the files of the Phases that finished.

Ctrl-C (`SIGINT`) or `SIGTERM` with no Scan running exits at once with 0. During a Scan it stops the running `claude`, reports the Scan to Elise as failed with a reason that says the Runner was stopped, keeps the work folder and exits with 1. A stop that comes after the Scan already succeeded changes nothing: the result is sent and the program exits with 0. Signals after the first are ignored until the result is sent.

A Scan stopped from Elise (the Stop button in the dashboard) is found within about 5 seconds: while a Scan runs, the program asks Elise for the job's state every 5 seconds, and a `cancelled` job stops the running `claude` through the same path as Ctrl-C. It sends no result (Elise already ended the Scan), keeps the work folder and prints `Scan stopped from Elise.` with the folder's path. `run` then goes back to waiting for Scans; `run --once` exits with 7. A network error or a server error on that check never stops a Scan.

## Under a service manager

Run `elise-runner run` as the user that is signed in to Claude Code, as a long-running service. A stop signal (`SIGTERM`, what systemd sends) ends a running Scan as described above, so give the service enough stop time to send that result. Pair once by hand first (`elise-runner pair <code>`); with no keychain service the token is then in the config file of that user. For a build job or a timer, use `elise-runner run --once` and read the exit code: 0 a Scan ran and succeeded, 1 it failed, 6 there was nothing to claim, 7 the Scan was stopped from Elise.

## In a container

Pair once outside the container, then give the token to the container as a secret:

```bash
elise-runner pair <code> --print-token    # the token on standard output, a warning on standard error
docker run -e ELISE_RUNNER_TOKEN ... your-image elise-runner run
```

The token is a credential that lasts until the Runner is removed in Elise. Copies stay wherever it is pasted (shell history, CI variables, container settings), so keep it as you would a password. The image needs the `elise-runner` binary, `claude` signed in, and `node`. This repo ships no Docker image or unit file.

## Developing

A debug build reads `ELISE_RUNNER_HOME` (the token file goes in that folder, the keychain is never touched, and `claude` and `node` are looked for on PATH only), `ELISE_ENGINE_URL` and `ELISE_LOGIN_CHECK_MS` (how often `login` checks, in milliseconds, so tests need not wait 5 seconds). A release build ignores all three and talks only to the production API.

| Path | What it is |
| --- | --- |
| `src/args.rs` | The command line and the help text. |
| `src/browser.rs` | Opens the login link when the computer has a desktop session. |
| `src/store.rs` | Which token store a run uses. |
| `src/commands.rs` | One function per command, and the log of `run`. |
| `src/tools.rs` | The built-in Skill, `claude` and `node`. |
| `tests/` | Process tests: the debug `elise-runner` run against a stub engine. |

`elise-runner --help` is the source for the commands and exit codes above. Change them together.
