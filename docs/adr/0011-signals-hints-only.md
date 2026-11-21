# Signals are hints from an outside model, on by default with a switch

A Signal is a hint from TypeSafe's Jev model about a Finding or a decision (a possible duplicate, a weak accepted-risk reason). We decided that a Signal never changes a Finding, a decision, a fingerprint or the Verdict: a person acts on it or ignores it, so the Verdict stays explainable from fixed rules (ADR 0003). Signals send Finding text, evidence text and decision notes (never source code) to a third party. They are on for every Account, existing ones included; a privacy page that lists the sub-processors (Anthropic and TypeSafe) ships before Stripe live mode. The Account settings show a switch with text that names TypeSafe and lists what is sent, a `tenant_admin` may turn them off, and the change is in the Audit trail. Turning them off stops new requests and hides stored Signals without deleting them. The platform pays for the model calls; they never count against a Scan's Budget or credit.

## Considered Options

- Let a confident answer change state (auto-merge duplicates, auto-confirm Findings): rejected, a model answer would then decide what ships.
- Off until an admin turns them on: rejected; the switch, its text and the privacy page keep customers informed and able to say no.
- Always on with no switch, disclosed only in a privacy policy: rejected, a customer whose rules forbid an unapproved outside service would have no way to say no.
- A bring-your-own TypeSafe key, or charging the Scan's meter: rejected, the cost is a fraction of a cent per Scan.
