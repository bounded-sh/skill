# Developer accounts and web login

This page covers the developer account used by the CLI. Authentication for
people using the deployed app is separate and documented in the frontend auth
reference.

## Normal setup

Run:

```bash
bounded init
```

The CLI reuses or refreshes the stored web session. Sessions are kept per
(environment, platform app, account) under `~/.bounded/web-sessions/`, with
`~/.bounded/web-session.json` holding the most recent login - so switching
between environments (staging vs production) or accounts does not evict the
other scope's session or force a fresh login. If no usable session exists for
the scope, the CLI opens `https://auth.bounded.sh` in the browser with a
loopback PKCE callback, saves the session locally, and resumes initialization.
No reusable CLI credential is bundled into the browser page or project.

`bounded login` remains useful when the user explicitly wants to sign in again,
switch web accounts, or authenticate before entering a project. It is not a
required step before `bounded init`.

## Headless terminal

When a browser callback is unavailable:

```bash
bounded login --email you@example.com
```

The CLI sends an email OTP and reads it interactively. JSON mode does not prompt.
The saved session refreshes automatically when possible.

## Project selection

`bounded.json` records `account.keySource: "web"` and may include a public email
login hint. It never stores access tokens or refresh tokens. Commit
`bounded.json`; never commit `~/.bounded/web-session.json`.

Before a sensitive release, confirm both identity and authorization:

```bash
bounded whoami --json
bounded access --app-id <id> --json
```

For intentionally local signing keys, profiles, CI key authentication, or a
legacy key-owned app, use the advanced
[key and account safety](key-and-account-safety.md) reference.

## Process account selection for automation

An automation can set `BOUNDED_ACCOUNT_FILE` to an absolute path to a JSON account selector outside the source repository:

```json
{"keySource":"web","loginHint":"agent@example.com"}
```

The file uses the same fields as `bounded.json.account` and selects the account for this process without rewriting the project's committed defaults.
It contains selectors, never passwords, private keys, or session tokens; the selected account must already have a valid login or credentials in the normal store.
`BOUNDED_PROJECT_ROOT` still points to the actual source project, so `bounded deploy` and `bounded tests run` find its policy and test files.
Child processes must inherit both selectors and the same `HOME` to use the same account and files.
`bounded account --json` reports the effective account, `accountFile`, and source `projectRoot`; `bounded whoami --json` confirms the authenticated identity.
An unreadable or invalid account file fails instead of silently falling back to the project's account.
Unset `BOUNDED_ACCOUNT_FILE` before using `bounded account use` to change project defaults.
The override does not grant authorization, change app IDs, or bypass connection restrictions.

A platform-managed agent session uses the same app-token exchange as a human CLI session, preserving the agent's wallet identity in the target app.
The target app's data rules still apply; developer access to deploy code does not grant unrestricted data access.
If the CLI reports `agent credential rejected` with `invalid_token`, authentication failed before app data access.
The platform must check session issuance or renewal; do not replace the agent's identity with `bounded login` or repeatedly retry the same rejected credential.
