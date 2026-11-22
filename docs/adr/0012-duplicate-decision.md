# A duplicate is a decision, not a fingerprint merge

Two Scans can describe one problem with different fingerprints, so a Branch shows it twice. We decided a person marks one Finding `duplicate` of the other, a new decision status, instead of merging fingerprints. A `duplicate` never counts in the Verdict by itself: the Finding it points to carries the problem, open, fixed, accepted or false positive, so the problem blocks once. It may be set by anyone who may mark `false_positive`, because it hides no risk. A link points to a Finding of the same Branch that is not itself a `duplicate`, and the engine refuses a chain instead of re-pointing other people's decisions. Like every decision it stands when a later Scan sees the Finding again (ADR 0004), even after the Finding it points to is `fixed`. A "possible duplicate" Signal (ADR 0011) only suggests the pair.

## Considered Options

- Merge the two fingerprints: rejected, fingerprints come from the Scan and a merge cannot be undone or attributed to a person.
- Reuse `false_positive` with a note: rejected, the problem is real, only counted twice.
- Re-point links when their target becomes a duplicate: rejected, it changes decisions other people made.
