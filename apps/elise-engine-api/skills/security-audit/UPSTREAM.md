# Upstream source

This folder is a modified copy of `skills/security-audit` from the public repo [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill), MIT license. The license text is in `LICENSE` next to this file.

- Compared with: upstream commit `c1c8a8c` (2026-09-14, "Clarify guidance and full audit modes").
- The exact commit our copy started from is unknown. Nobody recorded it. `c1c8a8c` is the commit we compared against, not a proven base.
- `skills-lock.json` is not the record for this folder. Its `security-audit` entry covers the copy in `.agents/skills`, and its format has no field for a modified copy.

## Files that are ours

These four differ from upstream `c1c8a8c`. Take upstream changes to them by hand, never by overwriting:

- `SKILL.md`
- `HUNTING.md`
- `RECONNAISSANCE.md`
- `VALIDATION-AND-REPORTING.md`

## Files that are not upstream's

`build-coverage-ledger.cjs` is ours. The Runner app runs it beside `validate-coverage-ledger.cjs` and requires that file's exports, so a change to the ledger schema updates both together (ADR 0006).

## Files kept as upstream wrote them

The other 14 files are byte-identical to `c1c8a8c`: 11 reference files (`AI-AND-LLM.md`, `ATTACK-CLASSES.md`, `CLIENT-SIDE.md`, `CLOUD-AND-DEPLOYMENT.md`, `DATA-ISOLATION-AND-LIFECYCLE.md`, `DESKTOP-MOBILE-AND-LOCAL-IPC.md`, `MEMORY-SAFETY-AND-BINARY.md`, `PROTOCOLS-RPC-AND-MESSAGING.md`, `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`, `SUPPLY-CHAIN-AND-RELEASE.md`, `WEB-PROTOCOL-AND-AUTH.md`), `report-schema.json`, `validate-coverage-ledger.cjs` and `validate-findings.cjs`. Overwrite them with upstream's version to take a fix. Do not edit them here.

Upstream's two test files (`validate-coverage-ledger.test.cjs`, `validate-findings.test.cjs`) are not in this folder.
