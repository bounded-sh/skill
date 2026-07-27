# `boundaries.browser` — what the app's own pages may reach

A second, separate boundary plane from `boundaries.egress`.
Declare it and the platform compiles a Content-Security-Policy header and serves it on the app's hosted pages.

**These two planes are not derived from each other and must not be copied between each other.**

| | `boundaries.egress` | `boundaries.browser` |
|---|---|---|
| binds | the server isolate, where your functions run | the visitor's browser, on your hosted pages |
| enforced by | the outbound gateway, **fail-closed** | a CSP header the router emits, **best-effort** |
| refuses with | `egress_denied` at the call site | the browser blocking the request |

A host your functions call server-side has no business in the browser list, and a CDN your page loads fonts from has no business in the egress list.

## Shape

```json
{
  "boundaries": {
    "browser": {
      "id": "site",
      "title": "Where this app's pages may talk",
      "mode": "locked",

      "connect": ["api.example.com", "*.tiles.example.com"],
      "img":     ["cdn.example.com", "data:", "blob:"],
      "style":   ["inline", "fonts.googleapis.com"],
      "font":    ["fonts.gstatic.com", "data:"],
      "frame":   ["www.youtube-nocookie.com"],
      "embeddedBy": ["oapps.fun", "*.oapps.fun"],
      "form":    [],
      "media":   [],
      "script":  []
    }
  }
}
```

`id` and `mode: "locked"` are required; `title` and `description` are optional.
The nine directive keys are exactly `connect`, `font`, `form`, `embeddedBy`, `frame`, `img`, `media`, `script`, `style` — an unknown key is rejected by name, not ignored.
Each list is capped at 32 entries.

## Values are destinations, never policy

Every entry is one of:

- an exact hostname — `api.example.com`
- a `*.suffix` wildcard — `*.example.com`
- the literal `data:` or `blob:`, valid under any directive
- the literal `inline`, valid **only** under `style`

A hostname compiles to `https://<host>` and nothing else.

**There is no field anywhere in which an app can write CSP syntax.**
This is deliberate: generated app code must have no path to authoring its own security policy.
Anything resembling policy text is refused before the hostname grammar even runs — semicolons, whitespace, quoted tokens (`'self'`, `'nonce-…'`, `'sha256-…'`), directive names (`script-src`, `frame-ancestors`), `//`, or a bare `*`.
There is no spelling of `'unsafe-inline'` for scripts and none of `'unsafe-eval'` anywhere.

## Not declaring it is not the same as declaring nothing

An app with no `boundaries.browser` is served the **platform default** header set.
An app that declares one is served its compiled policy.
Neither means "unrestricted", and an empty directive list (`"script": []`) means something quite different from omitting the key.

If the declaration cannot be compiled, or the compiled header would exceed the platform's header-size ceiling, the app is served the default rather than a partial or broken policy — a browser boundary is best-effort, and a half-applied CSP is worse than the default one.
The deploy-time validator catches this first: a declaration whose compiled length would blow the ceiling is a deploy error, not a surprise at serve time.

## For oApps specifically

An oApp's promise is that it can only do what it publicly declared, so both planes should be declared, not just the server one.
`boundaries.egress` is where that promise is load-bearing and fail-closed; `boundaries.browser` is what stops a page from quietly beaconing somewhere the declaration never mentioned.

See the [oApp launch-gate table](../../oapps-fun/SKILL.md) for the server plane and the static checks applied before graduation.
