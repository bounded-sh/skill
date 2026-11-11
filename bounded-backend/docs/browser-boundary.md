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

One exception to "the header is compiled from the declaration": on an **oApp's address once its token sale has started** the `script` list is not honored.
Every page there serves under `script-src 'self'; object-src 'none'; base-uri 'none'; worker-src 'self'` whatever the app declared, so scripts and workers must ship as files inside the release; the fetch lists (`connect`, `img`, `font`, `style`, `frame`, `form`, `media`) compile exactly as declared.

`embeddedBy` is the other exception, everywhere: it can only narrow who may frame your pages, never widen it (see "Who may frame your pages" below).

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

## Who may frame your pages

`embeddedBy` names which of the platform's own pages may show your app inside a frame: `openapps.xyz`, `*.openapps.xyz`, `bounded.page`, `*.bounded.page`, or a registered venue's apex.
Any other entry compiles to nothing, so writing an outside site there changes no header.
That is deliberate: any page in those zones can be anyone's app, so a free-form list would let one app frame another and clickjack its signed-in owner.
An outside site that should show your app inside its own pages, such as a messenger listing mini apps or a wallet's app tab, is the creator's decision on OpenApps, not the app's.
The app's agent files an `embedders` proposal with the exact https origins (at most five, no wildcards), the creator approves it, and the platform then serves exactly those origins beside the platform ones.
Ask the agent for it in plain words: "let cherry.fun show this app inside its pages".
Inside such a frame the OpenApps widget shows no creator controls.
Outside OpenApps there is no way to admit one today.

## Values are destinations, never policy

Every entry is one of:

- an exact hostname — `api.example.com`
- a `*.suffix` wildcard — `*.example.com`
- the literal `data:` or `blob:`, valid under any directive
- the literal `inline`, valid **only** under `style`

A hostname compiles to `https://<host>`.
Under `connect` it also compiles to `wss://<host>`: a browser treats a WebSocket to a host as a different scheme from HTTPS to it, and trusting a host for requests means trusting it for sockets too (the Bounded SDK itself confirms Solana writes over HTTPS, but other libraries subscribe over WebSockets).

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

See the [oApp launch gate](../../openapps/docs/launch-gate.md) for the server plane and the checks applied before an app opens.
