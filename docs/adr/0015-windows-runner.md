# The Windows Runner needs Git for Windows, is x64 only and ships unsigned

Terms: `apps/elise-engine-api/GLOSSARY.md` (Runner). Agreed in spec #393.

## The rule

**The headless Runner (`elise-runner`) runs natively on Windows x64, and needs Git for Windows installed.** Claude Code already needs Git for Windows (its Git Bash runs the agent's shell steps and the audit skill's), so the Runner asks for nothing the person does not already have. `elise-runner doctor` checks it and says how to install it.

- **x64 only.** Windows on ARM runs the x64 build under emulation, and the installer says so. There is no ARM build.
- **Unsigned.** The `.exe` is not code signed, so Windows may show a SmartScreen warning on a download from a browser. The PowerShell installer avoids most of it, and the docs explain the prompt. Signing is revisited after real use.
- **CLI only.** The desktop app is not built for Windows (as in spec #248).
- **No unix shell in the Runner.** The clone runs as direct `git` calls, and the git token reaches git through an inline credential helper that git runs with its own bundled shell. No helper script or permission bit is needed, and the token is never on a command line.
- **Install.** `install.ps1` (`irm … | iex`) puts `elise-runner.exe` in `%LOCALAPPDATA%\elise-runner\bin` and the user PATH, with no administrator rights.

## Alternatives not taken

- **WSL as the Windows story.** The Linux build should run inside WSL, but that is a workaround and not a product. It stays a note, not a promise.
- **A Runner with no Git for Windows requirement.** It would need the Runner to find and run `claude` and its tools without Git Bash, and Claude Code itself does not run without it.
- **Signing before the first release.** It costs money and setup time, and it would delay finding out whether Windows works for real users.

## Why it is hard to undo

People install the Windows Runner from the site and the dashboard's Getting started card and depend on `doctor`'s Git for Windows check and the install folder. Dropping Windows, or changing the install folder, later breaks those Runners.

## Not decided here

The audit skill and the agent run through Git Bash on Windows, but a full Scan on a real Windows machine has not been run yet (#400). Long path names and Windows Defender behaviour are unchecked. If that Scan shows the skill needs Windows fixes, they get their own spec.
