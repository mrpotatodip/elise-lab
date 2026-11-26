# Two-factor is TOTP only, required for admins, enforced in the engine

A stolen password should not be enough to reach an Account's keys, Runners and Plan. We decided the second factor is a TOTP Authenticator with ten Backup codes, required of every Login that holds `tenant_admin` or `workspace_admin` and optional for the rest unless the Account sets a Two-factor requirement. The engine enforces it: a session of an admin with no Two-factor gets `403 TWO_FACTOR_SETUP_REQUIRED` on every route but setup, `/me` and sign-out, so the dashboard screen only reacts and calling the API directly gains nothing. It is asked at every sign-in, a password reset leaves it on, and a lost Authenticator with lost Backup codes is fixed by a 2FA reset from another admin, or by the operator for a sole `tenant_admin`. Runner tokens never pass through it.

## Considered Options

- Emailed codes: rejected, the mailbox is also the password reset path, so one stolen mailbox would beat both factors.
- Passkeys (WebAuthn): stronger, but a bigger build and its own recovery story. A later spec.
- Required for everyone: rejected for now, existing members have no Authenticator and no emailed fallback exists. Admins hold the keys, billing and Runners, so they go first.
- A dashboard-only gate: rejected, it is bypassed by calling the API.
- Trusted devices and step-up prompts before sensitive actions: left out to keep the first version small.

## Consequences

- A sole `tenant_admin` who loses both factors needs the operator and a documented `db:exec` procedure; this is accepted.
- Every existing admin is held at the setup screen on the first request after deploy, so they are warned before it ships.
