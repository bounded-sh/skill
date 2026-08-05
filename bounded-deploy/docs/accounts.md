# Developer accounts and web login

This page covers the developer account used by the CLI. Authentication for
people using the deployed app is separate and documented in the frontend auth
reference.

## Normal setup

Run:

```bash
bounded init
```

The CLI reuses or refreshes `~/.bounded/web-session.json`. If no usable session
exists, it opens `https://auth.bounded.sh` in the browser with a loopback PKCE
callback, saves the session locally, and resumes initialization. No reusable CLI
credential is bundled into the browser page or project.

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
