# Formal verification (experimental, opt-in)

`bounded verify --experimental` runs an SMT solver (Z3) over `policy.json` and reports which generated proof obligations it could discharge.
It is not part of any Bounded workflow.
`bounded deploy` validates and compiles the policy and never runs the prover; previews, releases, and Open all accept a policy that was never proved.
Every rule and invariant is enforced by the runtime before commit whether or not it was proved, so a proof adds design-time evidence, never runtime behavior.
Run it only when a person explicitly asks for a proof report.
Without `--experimental` the command refuses and points back to `bounded tests run` and deploy.

## What it checks

- **Rule properties** per collection: each write rule is satisfiable, requires an authenticated caller (no `null == null` ownership match), is not trivially true, preserves `!` fields, and read rules use no `getAfter()`.
- **Invariant algebra**: `conserve`, `rollingSum` (including per-partition and onchain epoch-bucket forms), `tenantTag`, `tenantEdge`, and scalar `bound`.
  `flowBound`, `windowSum`, and `.values`-map `bound` declarations are reported as runtime-enforced advisories with proof status `UNKNOWN`; they are never counted as proved.
- **Function auth**: a function that declares `actAs` must have an `auth` rule that implies an admin gate (`get(/__admins__/@user.id) != null`, `get(/__owners__/@user.id) != null`, or an app-data `admins/$userId` membership).
- **Onchain transaction size** for the protocol named by `--protocol`, the same estimate deploy validation applies.
- **Attestations and public-read declarations** under the `proofs` key (below).

## Reading a report

Verdicts per obligation:

- `PROVED`: holds over every input the model admits.
- `DISPROVED`: a concrete counterexample exists and the report prints the assignment.
- `UNKNOWN`: structurally valid, runtime-enforced, no SMT obligation discharged.
- `UNSUPPORTED`: the engine cannot prove that obligation.

In `--json` (schema version 4) each check carries `blocking`, independent of `proofStatus`.
`passed` and `safeToDeploy` report the verify run's result (deploy does not read them); `status` (`PROVEN`, `DISPROVED`, `INVALID`, `UNPROVEN`) reports completeness.
A `DISPROVED` with `blocking: false` is an advisory, not a correction.
Advisories never fail the run: literal `false` rules (the intentional deny idiom), public `read: "true"` rules, the strict-ownership check on a rule that admits another participant, runtime-only invariants, and bare-string attestations.
Rerunning unchanged policy cannot resolve an advisory.

The two counterexamples you will meet most:

1. **The `null` counterexample.** `amount <= 100 || amount > 100` is disproved by `amount = null`. Make the field required or guard it (`@newData.amount != null && ...`).
2. **The `null == null` bypass.** `@newData.ownerId == @user.id` is satisfied by an unauthenticated caller writing `ownerId: null`. Prepend `@user.id != null &&`.

Strengthen the expression, never weaken the property: the counterexample is a write production would accept.

A rule can also be too large to decide.
"Update rule exact decomposition exceeds aggregate branch budget" is a complexity limit, not a logic error; move a per-case check to a sibling document's rule that must accompany the write anyway.

Operational limits: the endpoint is rate-limited to about twenty requests per minute per app owner (`429`).
A `503` with `proof_substrate_unavailable` (`retryable: true`) means the prover lane is warming up or busy: wait 30 seconds and rerun the same command, at most three attempts in total, then report the proving service as degraded with the `correlationId`.
Never apply that retry to `bounded deploy`, and never retry `bounded deploy --create`, which can create another app.

## Proof-only declarations (`proofs`)

These blocks add obligations to a verify run and change nothing at runtime.
Omit them unless you are producing a proof report.

### `proofs.transferAuthority`

The verifier treats ownership-like fields (`owner`, `holder`, or a field detected from the rules) as reassignable only by the current holder.
Declare a different atomic condition when that is the design, such as a listed good moving to the buyer only when the paired payment lands in the same `setMany`:

```json
{
  "defs": {
    "settledSale": "@data.forSale == true && @newData.holder == @user.id && getAfter(/wallets/@data.holder).ink == get(/wallets/@data.holder).ink + @data.price && getAfter(/wallets/@user.id).ink == get(/wallets/@user.id).ink - @data.price"
  },
  "proofs": {
    "transferAuthority": [{ "scope": "goods/$goodId", "field": "holder", "name": "settledSale", "allow": "@def.settledSale" }]
  }
}
```

The collection's `update` rule still authorizes the write at runtime; the declaration only tells the prover which reassignment path is intended.

### `proofs.publicReads`

The verifier expects a non-literal read rule to imply an authenticated caller.
Name a collection here when a conditional read is intentionally public for a subset of documents (a published launch beside its private draft):

```json
{
  "proofs": { "publicReads": ["launches/$slug"] },
  "launches/$slug": {
    "fields": { "visibility": "String", "owner": "String" },
    "rules": { "read": "@doc.visibility == 'public' || @doc.owner == @user.id" }
  }
}
```

Use exact declared collection paths, each once; do not list a literal `true` or `false` read.
The runtime read rule still decides what is visible.
The oApps Open step also reads this list as declared intent when it classifies a conditional read surface it cannot classify from the rule alone.

### `proofs.attestations`

Global, policy-wide claims with a human `claim` and a machine `kind`:

| `kind` | Claim | Params |
|---|---|---|
| `roleGatedRead` | only the declared role or typed actors can read `scope` or `field` | exactly one of flat `role` or typed `actors`, plus `scope` or `field` |
| `authorityClosure` | membership of `roleScope` only grows through gated additions | `roleScope` (flat `<collection>/$docId` only), optional `initialMember` |
| `rollingSum` | a windowed cap holds globally | `scope`, `field`, `windowSeconds`, `limit`, optional `scopeVariable` |

```json
{
  "proofs": {
    "attestations": [
      { "claim": "the admin set only grows through existing admins", "kind": "authorityClosure", "roleScope": "admins/$userId", "initialMember": "@const.FOUNDER" },
      { "claim": "only members of an org can read that org's tasks", "kind": "roleGatedRead", "scope": "tenants/$tenantId/tasks/$taskId",
        "actors": [{ "kind": "role", "scope": "tenants/$tenantId/members/$memberId", "principal": "id", "field": "active" }] }
    ]
  }
}
```

A bare string (`"attestations": ["no agent can exceed its daily spend cap"]`) is a visible TODO reported as `UNSUPPORTED`; it proves nothing.
`authorityClosure` accepts only a flat role scope; a nested `tenants/$tenantId/members/$memberId` is rejected, so keep a flat `admins/$userId` registry when you want that claim.
Hook, function, tick, and scheduled outputs stay outside a `roleGatedRead` proof, and an `onchain: true` scope is public-chain storage that no read rule can make private.

## `--operation`

The default `verifyForDeploy` proves the whole policy (the name is historical; deploy does not run it). The others probe one expression:

| `--operation` | Needs | Proves |
|---|---|---|
| `checkTautology` | `--expression` | the expression is always true |
| `checkContradiction` | `--expression` | the expression is always false |
| `checkSatisfiability` | `--expression` | the expression can be true |
| `checkImplication` | `--rule` + `--property` | the rule implies the property |

```bash
bounded verify --experimental ./policy.json --app-id <id> \
  --operation checkImplication \
  --rule '@user.id != null && @newData.amount <= 100' \
  --property '@newData.amount <= 100'
```

`--verbose` prints every obligation; `--constants` and `--environment` resolve the policy exactly as deploy does.

## Related

- [policy-tests.md](policy-tests.md): the concrete allow/deny loop that replaces verify on the normal path
- [invariants.md](invariants.md): the declarations the obligations are generated from
- [data-plane.md](data-plane.md): how a rejected write surfaces at runtime
