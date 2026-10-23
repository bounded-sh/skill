# Server apps: Next.js on Bounded hosting

A Next.js app built with [vinext](https://github.com/cloudflare/vinext) can run its server on Bounded hosting.
Bounded serves exact static files itself and runs the server for every other request, every non-GET request and every client navigation (`RSC` header or `_rsc` query).
Each server request is billed to the app's credits like a function call, for at most 30 seconds; static files cost nothing per request.
An OpenApps app that runs a server can go through an APO, and its Open app keeps running the server its release froze.

## Build and deploy

1. `npx vinext check` lists what vinext cannot run.
2. A pnpm repo builds only with `node-linker=hoisted` in `.npmrc` and `node_modules` reinstalled after setting it; the build stalls on pnpm's linked `node_modules`.
3. `npx vinext init --platform=cloudflare --legacy-wrangler-cloudflare-init --skip-check --cdn-cache=none --data-cache=none --image-optimization=none`, then `vinext({ prerender: true })` in `vite.config.ts`.
4. `vite build` writes the server to `dist/server` (with a `wrangler.json` naming its entry, compatibility date and flags) and the browser files to `dist/client`.
5. A pack step puts the server into the deployed folder (the layout is below), and `bounded site deploy ./dist/client --with-source` publishes both.

Pages vinext prerenders with no `revalidate` (`○` in its build report) are written to `dist/server/prerendered-routes/` and listed in `dist/server/vinext-prerender.json`.
Copying each one into `dist/client` (`/` as `index.html`, `/about` as `about.html`) makes it a static file: Bounded serves it without running the server, and client navigations to it still reach the server.

`bounded site deploy` accepts a folder with `_bounded_server/server.json` in place of `index.html`.
Nothing under `_bounded_server/` is served to a browser.
A `"build"` object in `bounded.json` (`{ "command": "npm run build", "output": "dist/client" }`) declares how the deployed folder is produced, and an OpenApps app's agent builds its releases with it.

## The `_bounded_server/` layout

- Every server module is a `.js` or `.mjs` file under `_bounded_server/`, at the same relative path it had in `dist/server`: at most 2,000 modules and 16 MiB together.
- `_bounded_server/server.json` is `{ "version": 1, "main": "<entry module, relative to _bounded_server/>", "compatibilityDate": "YYYY-MM-DD", "compatibilityFlags": [...], "secrets": [...] }`.
- `main`, `compatibilityDate` and `compatibilityFlags` come from `dist/server/wrangler.json` (`main`, `compatibility_date`, `compatibility_flags`).
- The accepted flags are `nodejs_compat`, `nodejs_compat_v2`, `no_nodejs_compat_v2`, `nodejs_als` and `global_fetch_strictly_public`; any other flag refuses the deploy.
- `secrets` lists at most 100 secret names the server reads; keep it equal to `server.secrets` in `bounded.json` (see [Secrets](#secrets)).

A deploy with an invalid bundle is refused with `invalid_app_server` and a reason.

## What runs

- App Router and Pages Router, server components, server actions, route handlers, middleware, redirects and cookies.
- ISR pages, rendered on every request rather than cached.
- Static pages, served as files when the pack step copies them out.
- `fetch` from server code, within the app's declared egress.
- `ctx.waitUntil` work, which finishes before the response ends and is billed with it.

The server runs as a Cloudflare Worker, so code at a module's top level may not do async I/O, set timers or generate random values ("Disallowed operation called within global scope").
Create SDK clients (Stripe, Supabase and the like) inside a handler or a function it calls, not at import time.
A server that fails to start or throws answers 502.

Limits: 30 seconds to the response headers (then 504), a server-rendered page of 10 MiB, 5 minutes of streaming per response, and 600 server requests a minute per visitor (then 429).
Server responses are sent with `Cache-Control: private, no-cache` (`private, no-store` when the server asks for `no-store`).
Bounded compresses responses; a response in an encoding other than gzip or deflate is refused.

Not supported: `next/image` optimization (`images: { unoptimized: true }` works), `"use cache"` and partial prerendering, database drivers that open TCP sockets (HTTP clients such as Supabase JS, Neon serverless HTTP, PlanetScale and Turso work), native Node addons, child processes, writing files, and `export const runtime = "edge"`.
A build runs without the app's secrets, so a page that fetches with one while prerendering fails; a page with `export const dynamic = "force-dynamic"` renders on each request instead.

## Secrets

Server code reads the names `server.json` lists as `process.env.NAME`; a name it does not list is not in `process.env`.
`bounded.json` declares the same list as `"server": { "secrets": ["STRIPE_SECRET_KEY"] }`; an OpenApps agent's release refuses a built server that reads a name the commit's `bounded.json` does not list.
Names are upper case: `^[A-Z][A-Z0-9_]{0,63}$`.
Names starting `NEXT_PUBLIC_`, `NUXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `EXPO_PUBLIC_` or `REACT_APP_` are refused, because frameworks put those in browser bundles.
Public values are not secrets: put them in `bounded.json` `build.env` (`bounded site env set NAME VALUE`), because source sync leaves out every `.env` file; `bounded site build` and an OpenApps agent's release build add them to the build.
The owner sets each value with `bounded secret put NAME` ([secrets](../../bounded-backend/docs/secrets.md)); a new value reaches the server within 30 seconds, with no deploy.
In an APO every listed name must be a key the app's OpenApps agent donated: the server reads a stand-in, and the real key is added only to requests to the hosts it was donated for.
Deploying a server that lists secrets needs the same permission as deploying functions.
A listed secret that is not set makes every server request answer 503 with `This app's server needs secrets that are not set: NAME.`
No build sees a secret.
A secret of 8 or more characters is replaced with `[redacted]` wherever a response carries it as is, JSON-escaped or URL-encoded, and a header holding one is replaced whole; shorter secrets, other encodings and partial copies pass through.
A site variant's server runs with no secrets, no cookies and none of the app's connected-account credentials.
Server code reads the app id from `process.env.BOUNDED_APP_ID`; every page also carries `<meta name="bounded-app-id">`.
`process.env.BOUNDED_AI_BASE_URL` is an OpenAI-compatible AI endpoint billed to the app, streaming included, for any AI SDK that takes a base URL ([the endpoint](../../bounded-backend/docs/functions-ctx-ai.md#any-ai-sdk-and-streaming-the-openai-compatible-endpoint)).
