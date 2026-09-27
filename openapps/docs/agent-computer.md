# Brokered agent computers

**What's in here:** how an app's own agent works on a brokered OpenApps app computer, which stores no credentials, and how the agent saves its own API keys with `bounded computer secret`.
Part of the **openapps** skill; the router is in [../SKILL.md](../SKILL.md).

## Is this computer brokered?

A computer is brokered when `BOUNDED_SECRETS` is set in its environment (`test -n "$BOUNDED_SECRETS"`).
If it is unset, this page does not apply; keep following the installed runtime instructions.

## What is different

- No credential for Bounded, the app, its source repository, or a saved secret is stored on the computer: not on disk, in the environment, or in process arguments.
- Credential files keep their usual shape but hold placeholders: the CLI session in `~/.bounded/web-session.json`, the run token, app tokens the CLI obtains, and the source-repository token.
- The network adds the real credential on the way out, only for the destination it belongs to, and only while the agent has a live run.
  Bounded, app, and source-repository requests through the CLI, the SDKs, and `git` therefore work as usual.
- A placeholder sent to a destination it is not bound to is refused with HTTP 403 and `computer_egress_refused`, and nothing is forwarded.
- Traffic without a placeholder, such as package installs and public web pages, passes through unchanged with no credential added.
- Redirects are returned to the caller, not followed, and injected values are removed from responses.

Do not run `bounded login` there.
The CLI session is platform-held, a sign-in cannot replace it, and no one can relay a code.
Do not try to decode or copy a placeholder as if it were a real credential.
If a Bounded request is rejected for authentication, report it as a platform problem instead of retrying or signing in.

## Save your own API keys

To call a third-party API with a key the agent holds, save the key once and send a placeholder instead of the value.

```bash
printf '%s' "$WEATHER_KEY" | bounded computer secret set WEATHER_KEY --domain api.weather.example
bounded computer secret list          # names, domains, and timestamps; never values
bounded computer secret rm WEATHER_KEY
```

`set` reads the value from stdin or from the environment variable named by `--value-env`, and `--domain` repeats for each hostname the secret may reach.
The commands call the `$BOUNDED_SECRETS` API, which also answers `GET $BOUNDED_SECRETS`, `PUT $BOUNDED_SECRETS/<NAME>` with `{"value":"...","domains":["api.weather.example"]}`, and `DELETE $BOUNDED_SECRETS/<NAME>` directly.
It works only on a brokered computer during a live run.

Then write `{{secret:NAME}}` wherever the value belongs: a request header, the URL, or a JSON, form, or text body sent over HTTPS to a bound hostname.

```bash
curl -H 'Authorization: Bearer {{secret:WEATHER_KEY}}' https://api.weather.example/v1/now
```

The network swaps the value in on the way out and turns it back into `{{secret:WEATHER_KEY}}` in the response.

- A name matches `[A-Za-z_][A-Za-z0-9_]{0,63}`.
- A value is at most 8192 bytes and contains no line breaks.
- A secret binds 1 to 8 exact lowercase hostnames: no wildcards, no IP addresses, and no Bounded or OpenApps platform hosts.
- A computer holds at most 100 secrets.
- `set` on an existing name replaces its value and domains together.
- Values are write-only: no command or route returns them.
- A placeholder sent to a hostname the secret is not bound to is refused, never forwarded.

A computer secret serves only the agent's own requests from that computer.
The deployed app cannot read or use it, so it does not provide an app capability, and oApp functions still take no secrets (see the [capability ladder](capability-ladder.md)).
