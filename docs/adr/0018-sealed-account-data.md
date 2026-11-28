# An Account's text is Sealed in the database

How the engine keeps the free text of an Account out of a copy of the database. Terms: `apps/elise-engine-api/GLOSSARY.md` (Sealed, Data key, Account, Finding).

## The rule

**The engine seals an Account's free text with that Account's Data key before it writes it, and unseals it only for a signed-in member of that same Account.** The Data key is made on first use, one for each Account. A master key, held only in the Worker as a required secret, locks every Data key. Only the locked Data key is stored.

Sealed: the free text of a Finding (title, class, file, impact, evidence, fix, needs, and the readable `finding_id`), triage notes, Comments, the text of a Runner job (prompt, options, priors, files, error), a Scan's error, upload labels, the ledger note, Archives and the report files in R2. Not sealed: IDs, statuses, severity, Verdict, counts and dates, because the database sorts and filters on them.

**Fingerprints.** The fingerprint that matches a Finding to its earlier self becomes a keyed HMAC with a key of the Account, so it still matches and a thief cannot guess a title from it. The unique indexes move to the HMAC.

**Opening.** The engine unwraps the Data key once for each request. A field that does not open shows "cannot be read" and is logged. It never falls back to the sealed text. No path opens one Account's data for another, support included.

**Rollout.** One deploy for each step, and none breaks the one before: 1) schema, key table, and read code that takes sealed or plain values; 2) write sealed values; 3) backfill old rows, one Account at a time, marked per row so it can resume; 4) rebuild the unique indexes on the HMAC and stop reading plain text.

## Why

- **A hash cannot be read again.** The dashboard must show the text, so the text is locked, not hashed.
- **Server-side, not end-to-end.** With a key only the customer holds, the engine could not read a Finding. Dedupe, Signals, "Scans learn", the Verdict, the overview and emails all read Finding text. A lost key would lose the data, and every Team member would need the key. Server-side sealing keeps all of them and stops the leak we are afraid of: a database copy, a backup or an export.
- **One Data key for each Account.** A sealed value copied to another Account's row does not open, and a key can be changed for one Account alone.
- **A new master secret.** `KEY_ENCRYPTION_SECRET` is optional and guards the Anthropic key. Losing or changing it must not touch Findings.
- **The engine seals, the Runner does not.** The Runner sends text over TLS and the engine seals it on arrival, so no Runner release is needed.

## Consequences

- The Worker and its master key are trusted. Someone who holds both reads everything. Keep a copy of the master key in a second secret store: if it is lost, every Account's text is lost. Changing the master key re-wraps the Data keys and leaves the data alone.
- The database cannot search, sort or group by sealed text. A search by words must run in the Worker after unsealing.
- The duplicate and weak-reason Signals still send plain Finding text to the TypeSafe model. Sealing does not cover that call. It is a known exposure with its own ticket.
- Claude Code on a Runner still sends repo text to Anthropic. That is out of scope.
- While the backfill runs, a row may hold the old fingerprint. Read code treats it as the same Finding as the new one.
