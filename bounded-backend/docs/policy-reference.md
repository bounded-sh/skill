# Policy Reference — `policy.json`

**What's in here / when to read this:** the `policy.json` syntax reference —
path templates, field types, the rule expression language, tiers, and every
config key. (Invariants: [invariants.md](invariants.md).)

One JSON file defines the backend: collections, types, auth rules, side-effect
hooks, schedules, webhooks, search, and invariants. Everything is validated at
deploy. The runtime enforces authorization rules, while `bounded verify` proves
supported declared invariants and generated safety obligations. Only a named
`PROVED` item in the report carries proof weight. Invariants get their own doc:
[invariants.md](invariants.md). For the method of *generating* a policy, see
[policy-generation-guide.md](policy-generation-guide.md).

## Collections & path templates

Unreserved top-level keys are **path templates**.
Segments alternate between a collection name and a `$variable` (the document id), so paths always have an even number of segments:

```json
{
  "tenants/$tenantId/invoices/$invoiceId": {
    "fields":     { "...": "..." },
    "rules":      { "read": "...", "create": "...", "update": "...", "delete": "..." },
    "tier":       "durable",
    "invariants": []
  }
}
```

- Collection names: letters and digits, starting with a letter.
- Id segments: `$camelCase` (alphanumeric after `$`) — they become **path
  variables** usable in rules and invariants (`$tenantId == @user.address`).
- Nesting encodes ownership: a write to `tenants/t1/invoices/i9` binds
  `$tenantId = "t1"` for every rule on that template.
- Two templates may not collide modulo variable names — `users/$a` and `users/$b`
  together is a deploy error.

## Fields

`fields` maps names to types. Names start with a letter and contain only
alphanumerics and underscores; `id`, `pathId`, and the entire
**leading-underscore (`_*`) namespace** are reserved for system fields — `_id`,
the timestamps `_createdAt` / `_updatedAt` / `_createdBy`, and on-chain
transaction metadata stamped on confirmation (`_transaction_hash`,
`_block_number`, `_modified_date`, …). You can read these but never declare or
write them.

The accepted scalar type names are **exactly** `String`, `Int`, `UInt`, `Bool`,
`Float`, `Address` (plus the `?` / `!` suffixes below). Anything else is rejected
at deploy.

| Type | Meaning |
|---|---|
| `String` | UTF-8 string. Required for `tenantTag`/`tenantEdge` fields. |
| `Int` | Signed safe integer. |
| `UInt` | Unsigned safe integer. **Required for `rollingSum` fields.** |
| `Bool` | true / false. **`Boolean` is NOT a valid type name — use `Bool`.** |
| `Float` | Decimal. **Not allowed on onchain collections** — use Int/UInt. |
| `Address` | Wallet / account address. |

> **`Bool`, not `Boolean`.** `deploy` rejects `"Boolean"` with
> `unrecognized data type "Boolean"` (and `verify` is being aligned to reject it
> too — don't rely on `verify` passing it). There is no `Number`, `Timestamp`, or
> `Date` scalar — model timestamps as `UInt` (Unix seconds) and lists as
> sub-collections.

Suffixes compose with every base type:

- `?` — optional (`String?`)
- `!` — **readonly after create** (`String!`) — adds an immutability **proof
  obligation** the deploy gate checks. It is **opt-in per field** and does **not**
  auto-generate the enforcement: you must still write the preservation clause in
  the `update` rule yourself, or deploy fails (see below).
- `!?` — both (`String!?`)

There are **no array or object field types**. Model a list as a sub-collection.

### `!` requires a preservation clause in the update rule

Marking a field `!` adds the obligation *"no payload satisfying the update rule
can change this field"* — but the engine does **not** synthesize the check for
you. If your `update` rule admits any write that changes the field, deploy fails
with e.g. `field immutability` / `<field> is immutable on update`. You must add
`@newData.X == @data.X` for **each** `!` field to the update rule:

```json
"posts/$id": {
  "fields": { "author": "String!", "createdAt": "UInt!", "body": "String" },
  "rules": {
    "create": "@user.id != null && @newData.author == @user.id",
    "update": "@user.id == @data.author && @newData.author == @data.author && @newData.createdAt == @data.createdAt",
    "delete": "@user.id == @data.author"
  }
}
```

Fields that typically need this: identity/ownership (`owner`, `author`,
`creator`), creation timestamps (`createdAt`), and any set-once key. (An
`update: "false"` rule satisfies the obligation vacuously — nothing can change
the field because nothing can update at all — which is why server-authoritative
collections never hit this.) Note: a tenant-tag field bound by a `tenantTag`
invariant does **not** need `!` — the invariant rebinds it on every write.

Onchain update payloads are patches.
The onchain program starts with the stored document and applies operations only for keys present in the payload.
Omitted fields remain in the final document and in the merged `@newData` candidate evaluated by the update rule.
Include a `!` field on create, but omit it from every later onchain update payload.
Supplying the readonly key again creates a field operation and the onchain program rejects it with `FieldReadOnly`, even when the supplied value is unchanged.
The preservation clause above remains required because it proves the merged candidate cannot change the field.
See [onchain.md](../../bounded-onchain/docs/onchain.md#onchain-updates-are-patches) for the client payload shape.

## Conditional Transfer Authority

Ownership-like fields (`owner`, `ownerAddress`, `holder`, or a field detected
from rules) are protected by a deploy proof: the field may stay unchanged, or it
may be reassigned only by its current holder. Use `proofs.transferAuthority`
when a different atomic condition is intentionally safe, such as a listed good
moving to a buyer only when the paired payment lands in the same `setMany`.

```json
{
  "defs": {
    "settledSale": "@data.forSale == true && @newData.holder == @user.id && getAfter(/wallets/@data.holder).ink == get(/wallets/@data.holder).ink + @data.price && getAfter(/wallets/@user.id).ink == get(/wallets/@user.id).ink - @data.price"
  },
  "proofs": {
    "transferAuthority": [{
      "scope": "goods/$goodId",
      "field": "holder",
      "name": "settledSale",
      "allow": "@def.settledSale"
    }]
  },
  "goods/$goodId": {
    "fields": { "holder": "String", "forSale": "Bool", "price": "UInt" },
    "rules": {
      "read": "true",
      "create": "@user.id != null && @newData.holder == @user.id",
      "update": "@user.id != null && (@data.holder == @user.id || @def.settledSale)",
      "delete": "false"
    }
  }
}
```

`transferAuthority` is a proof declaration, not a runtime bypass. The collection
`update` rule still authorizes the write at runtime; deploy proves every update
that changes the field is either current-holder authorized or satisfies the
declared `allow` predicate, and separately proves that the declared predicate can
only assign the ownership field to the caller (`@newData.holder == @user.id` or
the equivalent recognized caller principal). Put money/points under `conserve`
and submit the good move plus wallet debit/credit in one atomic `setMany`.
The older collection-local `transferAuthority` array is still accepted for
backward compatibility, but `proofs.transferAuthority` is the preferred shape.

## Rules & the expression language

`rules` gates `read`, `create`, `update`, `delete` with boolean expressions. A
false rule rejects with `403` + a trace, and the prover analyzes the same
expressions at deploy. **An omitted rule defaults to deny.**

```json
"rules": {
  "read":   "@user.id != null && @data.ownerId == @user.id",
  "create": "@user.id != null && @newData.ownerId == @user.id",
  "update": "@data.ownerId == @user.id && @newData.ownerId == @data.ownerId",
  "delete": "@data.ownerId == @user.id"
}
```

### Variables

| Variable | Meaning | Restrictions |
|---|---|---|
| `@user.id` | **Universal principal** — always present for any authenticated user (JWT `custom:userId`, falling back to the wallet address). Use for ownership, membership, roles, identity-sets. `null` when unauthenticated. | offchain only |
| `@user.address` | A **real wallet**. Present for wallet logins and, **by default, for supported email/social logins too** - Bounded eagerly provisions an embedded Turnkey wallet on first login and stamps its address into the session token. `null` only for a phone/text-only session (no verified email claim), an `auth.wallets: false` app, the legacy lazy `authMode: "bounded"` path before a wallet exists, and when the wallet-config lookup fails. Use for onchain/wallet semantics. | — |
| `@user.email` | Verified, lowercased email; `null` for wallet/guest logins. | offchain only |
| `@user.isAnonymous` | Strict boolean; `true` only for guest tokens. Gate with `== false` (no unary `!` on special vars). | offchain only |
| `@origin.kind` | **Platform-set call provenance**, unforgeable and never supplied by the client. **Always set.** Common values include `'live'` for a live tick and `'user'` for a direct end-user/SDK call. | offchain only |
| `@origin.path` / `@origin.module` / `@origin.room` / `@origin.tick` | The live/dispatch source detail; **`null` when not applicable** (e.g. all null for `kind:'user'`). Gate `@origin.module` together with `@origin.kind == 'live'`. | offchain only |
| `@data.field` | Existing document | **not** in `create` rules |
| `@newData.field` | Incoming document | **not** in `delete` rules |
| `@time.now` | Server time (seconds) | — |
| `@contract.address` | The deployed Bounded Solana program-ID sentinel; supported built-in plugins may resolve it to the app escrow PDA | Solana/Poofnet |
| `$pathVariable` | Any variable from the path template | — |
| `get(/path)` | Read another doc, **pre-transaction** state | unquoted path, leading `/`; literal segments use letters, digits, or `_` |
| `getAfter(/path)` | Read another doc, **post-batch (staged)** state | not in `read` rules |

**`@time.now` is the RULE clock, and it can trail wall time by about a second.**
Never write a client-computed "now" (`Date.now()/1000`) into a field a rule
compares against `@time.now`: with `field <= @time.now` an ACCURATE client
clock stamps a value the rule clock has not reached yet and the write is
DENIED — intermittently, per second-boundary alignment, worst on a session's
first writes (measured live 2026-07-29; retries mask it and users see decline
noise). `field == @time.now` only ever passes when both clocks share a second.
The fix is always `serverTimestamp()` (exported from `@bounded-sh/client`,
`/server`, and `/core`): the platform stamps the field in seconds, so it agrees
with `@time.now` by construction and cannot be forged. Keep a rule bound like
`@newData.at <= @time.now && @newData.at + 60 >= @time.now` anyway — it
constrains a modified client that writes a literal instead of the sentinel.

`get(/users/$userId).role` — property access chains off the call. `@data` /
`@newData` must reference a specific field (`@data.foo`, never bare `@data`).
Literal `get()` and `getAfter()` path segments are expression tokens, not quoted document-key strings.
Use only ASCII letters, digits, and `_` for a literal segment.
A document ID containing `-` can be written through a normal string path, but it cannot be pasted into an unquoted expression path such as `get(/runs/run-001)`.
Use a grammar-safe fixture ID such as `run_001` when a policy test must address the same document from both forms.
There is no documented quoted-segment escape for these expression paths.

`@contract.address` does not directly expose the app escrow PDA.
A direct policy query returns the deployed Bounded program ID.
The `@AccountPlugin.getAccountAddress(@contract.address)` composition is unsupported on the current deployed Devnet runtime.
For the current Devnet program, bind `openTv7fbpYSseNHYmCZFZ1CZgj4r8D9fKNgEz1qo6F` as the string argument instead, and see [policy-primitives.md](../../bounded-onchain/docs/policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address) before using the result in a raw CPI account meta.

> **Identity: use `@user.id` for ownership, `@user.address` for wallets.**
> `@user.id` is the universal principal and is present for every authenticated
> user, on every protocol, which is why it is the right key for ownership and
> membership. `@user.address` is a wallet: an email/social login does get one by
> default (an eagerly provisioned embedded Turnkey wallet), so an ownership rule
> keyed on it is no longer an automatic lockout of email users - but it is still
> `null` for a phone-only session, an `auth.wallets: false` app, the legacy lazy
> `authMode: "bounded"` path, and on a wallet-config lookup failure. Guard
> auth-required offchain rules with `@user.id != null`; inside `onchain: true`
> collections `@user.address` is the only principal available, so use it there.

> **There is no plural `@constants` variable.** Use a top-level `constants`
> block and reference one value as `@const.NAME`; reusable rule fragments use
> `@def.name`. Top-level scoped `roles` and data-driven role collections are both
> supported. See [constants-and-defs.md](constants-and-defs.md) and
> [roles.md](roles.md).

> **`@origin.*` is offchain-only — forbidden in `onchain:true` rules**, same as
> `@user.id`. It's platform-set provenance for live ticks and dispatch, so a function
> can gate to *only its own game's tick*:
> `"auth": "@origin.kind == 'live' && @origin.module == 'arena'"`. See
> [principals-and-origins.md](principals-and-origins.md) and
> [functions.md](functions.md).

### Operators & literals

- Logic: `&&`, `||`; comparisons `==` `!=` `<` `<=` `>` `>=`.
- Arithmetic: `+` `-` `*` `//` (integer division) `**`. **Plain `/` is reserved
  for paths — using it for division is a validation error.**
- Literals: numbers (decimals only on offchain collections), quoted strings
  (`"..."`, `'...'`, or `` `...` ``), `true`, `false`, `null`.
- **No ternary, no switch, no string concatenation.** Branch with
  `(cond && A) || (!cond && B)` chained. Build paths by embedding variables
  directly: `get(/teams/@newData.teamId/members/@user.address)`.

### Plugin functions in rules

Rules may call read-only plugin functions, e.g. `@StringUtils.length(@newData.body)
<= 280`. Transactional plugin calls belong in hooks, not rules. Available plugins
depend on the deployment; the validator rejects unknown identifiers.

### Semantic constraints the validator enforces

- `@data` cannot appear in `create` rules (nothing exists yet); `@newData` cannot
  appear in `delete` rules (nothing is being written).
- Collections declared `"onchain": true` must use `"read": "true"` — onchain data
  is public and the validator rejects pretending otherwise.
- Onchain rules cannot `get()` an offchain collection.

## Tiers

| Tier | Semantics | Use for |
|---|---|---|
| `durable` | Committed before the caller sees success. **Required** for `rollingSum` and materialized/sharded conservation. | money, ledgers, anything an invariant protects |
| `checkpointed` | Interval-batched to storage; bounded loss window on hard failure. | high-write app state, presence, counters |
| `ephemeral` | In-memory only; gone on restart; fastest. | game ticks, cursors, transient rooms |

Declaring `rollingSum` (or `materialized`/`sharded` conservation) on a non-durable
collection is a **deploy error**, never a silent downgrade.

## Hooks

`hooks.offchain` / `hooks.onchain` attach side effects to `create`/`update`/`delete`.
Offchain hooks call **offchain** plugins — chiefly `@DocumentPlugin`:

```json
"hooks": {
  "offchain": {
    "create": "@DocumentPlugin.updateField(\"counters/global\", \"total\", \"1\")"
  }
}
```

| Offchain hook call | Effect |
|---|---|
| `@DocumentPlugin.putDocument(path, data)` | create/replace a document |
| `@DocumentPlugin.updateField(path, field, value)` | set one field |

Onchain hooks (on `"onchain": true` collections) call onchain plugins like
`@TokenPlugin.transfer(...)`. **An onchain plugin in an offchain hook is rejected.**

Hooks also include `tick` and `scheduled` groups, plus an `enforceRules` flag —
full treatment in [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md):

```json
"hooks": {
  "tick":      { "advance": "@DocumentPlugin.updateField(\"rooms/sys\", \"tick\", \"1\")" },
  "scheduled": { "resetQuota": "@DocumentPlugin.updateField(\"quotas/g\", \"used\", \"0\")" },
  "enforceRules": false
}
```

**Offchain hooks never gate.** There is no throw-from-an-offchain-hook.
Authorization lives in `rules`; cross-transaction correctness lives in
`invariants`. By default a hook bypasses the per-actor rules (it is privileged
server logic); set `enforceRules` to hold a hook to the same rules an external
caller faces. A hook can never break a proven invariant. On `"onchain": true`
collections the hook plane differs: a false or erroring `hooks.onchain`
expression aborts the whole Solana write atomically (see
[hooks and webhooks](hooks-scheduled-webhooks.md)).

## Every accepted config key

The validator accepts exactly these keys on a collection (anything else is
rejected):

| Key | Shape | Doc |
|---|---|---|
| `fields` | `{ name: Type }` | this doc |
| `rules` | `{ read, create, update, delete }` | this doc |
| `requiresInBatch` | `["other/doc"]` for every mutation, or `{ create?, update?, delete? }` arrays of required companion document paths. Enforced on client data-plane batches with `403 incomplete_batch`; path variables must be bound by this collection's template | [data-plane.md](data-plane.md#require-companion-writes-with-requiresinbatch) |
| `tier` | `"durable" \| "checkpointed" \| "ephemeral"` | this doc |
| `errorDisclosure` | `"full" \| "minimal"` — how much of a rejection reason reaches the client | [§ Error disclosure](#error-disclosure) |
| `invariants` | array of invariant objects | [invariants.md](invariants.md) |
| `onchain` | boolean | [proof-coverage.md](proof-coverage.md) |
| `hooks` | `{ offchain, onchain, tick, scheduled, enforceRules }` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `enforceRules` | boolean (collection-level) | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `schedule` | `{ every, run }` or an array of them. `every` (never `run`) can be retuned per environment | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md), [environments.md](../../bounded-deploy/docs/environments.md) |
| `dueRows` | `{ run, onComplete?, doneField? }` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `webhooks` | `[{ url, on: [...] }]` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `indexes` | `["field", ["f1","f2"], [["score",-1]]]` — pre-build ranked-query indexes at deploy (auto-indexing covers undeclared ones lazily) | [trending-feeds.md](trending-feeds.md) |
| `search` | `{ fields: [...] }` | [files-and-search.md](files-and-search.md) |
| `queries` | `{ name: { returnType, query } }` | [queries.md](queries.md) |
| `session` | `{ settleTo, settleFrom, settleRule, checkpointSeconds, tick }` | [realtime-and-games.md](realtime-and-games.md) |
| `relationships` | `{ name: { type, collection, ... } }` | [queries.md](queries.md) |
| `type` | `"llm" \| "api" \| "storage"` | [files-and-search.md](files-and-search.md) |
| `service` / `model` / `prompt` | strings (for `type:"api"`/`"llm"`) | [files-and-search.md](files-and-search.md) |
| `isPassthrough` / `isRevealPath` | booleans (onchain). **`isRevealPath` pins the collection's whole shape** — onchain, EMPTY fields, and a create rule that is exactly `@OraclePlugin.getRandomNumber($id, 0, 1) == 0`; `create: "false"` and a declared `randomness` field are both rejected at deploy | [../../bounded-onchain/docs/randomness.md](../../bounded-onchain/docs/randomness.md) |
| `description` / `operationDetails` / `functionDescription` | docstrings | — |

### Top-level blocks (alongside the collection keys)

These reserved keys live at the policy root, **not** under a collection, and are
never treated as path templates:

| Block | Shape | Doc |
|---|---|---|
| `links` | array of link definitions | [queries.md](queries.md) |
| `auth` | `{ anonymous: bool, wallets: bool \| { provisioning?: "lazy" \| "eager", authMode?: "bounded" \| "turnkey" } }` - app-wide auth options. `anonymous: true` opts the app into zero-friction guest sign-in (`signInAnonymously()`); **OFF by default**, so guest sign-in is otherwise refused with a `403 anonymous_auth_disabled`. `wallets` covers two distinct things and the default differs for each. **Embedded-wallet provisioning** for an already-authenticated email/social user: Turnkey is the sole implementation, eager provisioning is the default, so omit `wallets` for the normal path and set `wallets: false` only to opt out. **Wallet LOGIN** (SIWS/SIWE sign-in, and any keypair client - `BOUNDED_PRIVATE_KEY`, CI, an agent's QA session): **OFF by default**, so it is refused with a `403 wallet_login_disabled` until the app sets `wallets: true` (or an enabling object) EXPLICITLY. Minting a session from a bare signature is the security-sensitive lane, so an app must declare it. If anything signs into this app with a wallet or a keypair, set it. See [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md). | [auth.md](../../bounded-frontend/docs/auth.md), [anonymous-accounts.md](../../bounded-frontend/docs/anonymous-accounts.md) |
| `functions` | `{ name: { auth, entry, timeout, secrets, environments } }` — `environments` is **CLI-only**: an allowlist naming the only environments this function deploys to | [functions.md](functions.md), [environments.md](../../bounded-deploy/docs/environments.md) |
| `oapp` | Optional literal `true` only. Enables the v1 oApp static restrictions from the first verify/deploy; omit the key for a regular app. | [oapps-fun](../../oapps-fun/SKILL.md) |
| `boundaries` | App boundary metadata, including locked egress allow-list entries. | [§ oApp mode and closed egress](#oapp-mode-and-closed-egress) |
| `roles` | `{ name: { members, read?, write? } }` — provably-scoped cross-collection grants | [roles.md](roles.md) |
| `constants` | `{ NAME: string\|number\|bool }` — values for `@const.NAME` | [constants-and-defs.md](constants-and-defs.md) |
| `defs` | `{ name: "rule fragment" }` — reusable `@def.name` fragments | [constants-and-defs.md](constants-and-defs.md) |
| `proofs` | `{ transferAuthority?, publicReads?, attestations? }` - proof-only declarations for conditional transfer authority, exact conditional public-read posture, and global attestations | [invariants.md](invariants.md#proofspublicreads-exact-conditional-public-read-posture), [invariants.md](invariants.md#proofsattestations--global-policy-wide-claims) |
| `attestations` | legacy alias for `proofs.attestations` | [invariants.md](invariants.md#proofsattestations--global-policy-wide-claims) |
| `errorDisclosure` | `"full" \| "minimal"` — policy-global default for rejection-reason detail (per-collection wins) | [§ Error disclosure](#error-disclosure) |
| `environments` | `{ name: { appId, constants, schedules } }` — **CLI-only**, resolved client-side | [environments.md](../../bounded-deploy/docs/environments.md) |

`constants`/`defs` are resolved at compile time (deploy + verify) so rules carry
only literals; the top-level `environments` block and each function's own
`environments` allowlist are both stripped by the CLI before the policy is sent.

### oApp mode and closed egress

`oapp` accepts only the literal value `true`.
Use `"oapp": true` for an oApp and omit the key for a regular app; `false`, strings, objects, arrays, and other values are rejected.

The current v1 static checks require every `functions.<name>` definition to omit `secrets` and require at least one `boundaries.egress` entry.
Function `actAs` and live `runAs` signing identities are not secrets and remain allowed.
A missing egress declaration or an outer `boundaries.egress: []` means unrestricted legacy egress at runtime, so oApp mode rejects both shapes.
An empty inner `allow` array is valid.
External egress is fully closed when every declared entry has an empty `allow` array, as in this one-entry policy:

```json
{
  "oapp": true,
  "boundaries": {
    "egress": [
      {
        "id": "network",
        "allow": [],
        "mode": "locked"
      }
    ]
  }
}
```

Each egress entry accepts `id`, optional `title` and `description`, an `allow` array, and literal `"mode": "locked"`.
Nonempty `allow` values are exact hostnames, `*.suffix` wildcards, or `service:<name>` integration ids.

#### Per-function egress

A function may declare its own `egress`, in the same shape, to narrow what *it*
may reach:

```jsonc
"functions": {
  "settleInvoices": {
    "auth": "...",
    "entry": "functions/settleInvoices.ts",
    "egress": [{ "id": "billing", "allow": ["api.stripe.com"] }]
  }
}
```

`boundaries.egress` is a **ceiling**, not a default a function may exceed. A
function can only ever narrow it: the app-wide list is the app's published promise
about where it can reach — on an oApp it is rendered in the constitution — so a
function naming a host the app never declared would make that promise false. That
policy is **refused at deploy**, and the offending host is named in the error; the
dispatcher additionally drops it at runtime, fail-closed.

Declaring nothing on a function means the app-wide posture applies unchanged.

Why bother: an app's functions rarely deserve the same reach. A deterministic
bookkeeping function and an LLM agent function living in the same app should not
share one allow-list, and with a single app-wide list they necessarily do.

oApp mode is sticky.
Once an app's deployed policy carries `"oapp": true`, every later policy deploy inherits the flag automatically when the incoming policy omits the key, and the oApp checks run against the incoming policy (a deploy that declares function secrets or drops the egress boundary is rejected with an `oapp mode:` error).
There is deliberately no removal path in v1.
Apps provisioned through the create flow with `oapp: true` start in oApp mode, and commissioned build children (create and fork runs) inherit oApp mode from the commissioning source app's deployed policy.

**Attestation scope notes (nested vs flat):**

- `roleGatedRead` requires exactly one boundary: a flat `role`
  (`<collection>/$docId`, e.g. `members/$memberId`) or a non-empty typed
  `actors` array. Use typed actors for nested roles such as
  `tenants/$tenantId/members/$memberId`; each role actor declares its caller
  principal and Boolean membership field. Free-form `gatedBy` is not a nested
  escape hatch. Worked example:
  [invariants.md](invariants.md#nested-role-scopes--use-typed-actors).
- `authorityClosure` supports **only a flat `roleScope`** (`admins/$address`);
  nested role scopes are not yet supported. For multi-tenant admin sets use a flat
  `admins/$address` registry — see
  [invariants.md](invariants.md#nested-authority--authorityclosure-is-flat-only-known-limitation).

## Error disclosure

`errorDisclosure` controls **how much of a policy-rejection reason reaches the
client**. It never changes enforcement, and never hides anything from the owner.

- **`"full"`**: the client gets the stable fields plus the full reason: the
  failed rule trace and the violated invariant's **formula + limit** (e.g. `postcondition failed:
  invariant "spend_cap" requires rolling sum(agents/$agentId/spend/$spendId.amount) <= 100`).
- **`"minimal"`**: the client gets a generic message plus a stable `code`:
  "Access denied by policy." (`403`) or "This change was rejected because it
  would violate a data constraint." (`409`). An invariant rejection still
  includes its stable name at the top level and as `decline.invariant`, plus
  `decline.boundary.cause` when present. The formula, numeric limit, raw message,
  failed-rule trace, and rule expression are **not** sent.

**Resolution — most specific wins:** per-collection `errorDisclosure` > policy-global
`errorDisclosure` > **env default**. The env default is **`minimal` in production**
and **`full` everywhere else** (local/dev) — so you debug freely locally and prod
is locked down with zero config.

**The full reason always stays in the decision log**, regardless of disclosure
level. The owner reads it via `bounded decisions --denied-only`; only the
*client-facing* envelope is trimmed.

**The error envelope** is `{ error, code, status, requestId }`. `code` is a stable
category clients can branch on **even in minimal mode**:

| `code` | `status` | Meaning |
|---|---|---|
| `policy_denied` | `403` for writes/invokes; reads hide denial as `200` with empty data | a policy rule returned false |
| `invariant_violation` | `409` | a postcondition/invariant (`rollingSum`, `conserve`, …) was violated |

```json
"orders/$id": {
  "fields": { "amount": "UInt" },
  "rules": { "read": "true", "create": "@user.id != null" },
  "errorDisclosure": "full"   // verbose rejections for this collection only
}
```

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — turning a description into a policy
- [invariants.md](invariants.md) — declaring the boundaries
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — proving the policy
- [data-plane.md](data-plane.md) — writing against the deployed policy
