# Verifiable randomness — ORAO VRF, and how to make a DRAW provable

**What's in here / when to read this:** you need an on-chain random outcome — a
gacha pull, a raffle, a shuffle, a loot roll — and you want the result to be
something the policy *enforces* rather than something your client asserts.

Two separate things, and the difference is the whole point:

- a **verifiable random number** — cheap, three declarations, covered in §1
- a **verifiable draw** (the number actually selected *that* winner) — needs the
  data modelled for it, covered in §3. Skipping this is how a gacha ships with a
  hole big enough to drain the pool.

---

## 1. The request/reveal pair

Randomness is asynchronous: you *request* it, the oracle *fulfils* it, then you
read it. That needs two collections.

```jsonc
"draws/$drawId": {
  "onchain": true,
  "fields": { "span": "UInt" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && @newData.span > 0",
    "update": "false", "delete": "false"
  },
  "hooks": {
    "onchain": { "create": "@OraclePlugin.requestRandomness($drawId, /drawreveals/$drawId)" }
  },
  "queries": {
    "roll": { "returnType": "UInt", "query": "@OraclePlugin.getRandomNumber($drawId, 0, @data.span)" }
  }
},

// The reveal target. Its shape is DICTATED, not chosen — see below.
"drawreveals/$drawId": {
  "isRevealPath": true,
  "onchain": true,
  "fields": {},
  "rules": {
    "read": "true",
    "create": "@OraclePlugin.getRandomNumber($drawId, 0, 1) == 0"
  }
}
```

`requestRandomness` belongs in `hooks.onchain`, **never in a rule** — a rule is a
predicate, and a request is an effect. Make the draw id the same as the id of
whatever the draw is *for* (an order, a pull, a ticket); it removes an
indirection everywhere downstream.

### The reveal collection's shape is mandatory

This is enforced at deploy and it is easy to get wrong, because the obvious
guesses are all rejected. **A reveal collection must be:**

| requirement | why |
|---|---|
| `onchain: true` | it is a Solana document |
| `fields: {}` — **empty** | no attacker-controllable content |
| `create` rule **exactly** `@OraclePlugin.getRandomNumber($id, 0, 1) == 0` | the only legitimate way a doc appears there |
| `update`/`delete` literal `false` **or absent** | write-once |
| exactly one path variable | injective id binding |

Anything else fails with `a reveal collection must ...`. In particular
`create: "false"` looks right — the driver writes it, not a user — and is
rejected. So is declaring a `randomness` field to read the value back; you read
it through the `roll` **query** on the request collection, not off the reveal doc.

The reveal create rule deliberately carries **no `@user` term**, so it is exempt
from the "create requires authentication" proof obligation. Authorisation comes
from the shape above, which is strictly stronger than "someone was signed in".

## 2. Reading the roll

```js
const roll = await client.runQuery(`draws/${id}`, 'roll', {});
```

`getRandomNumber(id, min, max)` returns a uniform value in `[min, max)`. The
range is yours to choose at request time — see §3 for why you may want it large.

Fulfilment is not instant. Read it a beat after the request, and treat "not ready
yet" as a retry rather than an error.

## 3. Making the DRAW provable, not just the number

Here is the trap. You have a verifiable roll, you walk your weighted list in
client code, you write the winner, and the policy checks the bookkeeping around
it — status transitions, balances, the aggregate delta. It all passes. **And the
selection is completely unconstrained**: whoever submits the write picks the
winner, because no rule ever checked that the roll implies that row.

Measured on a real build before this was closed: a modified client paid the
pool's own price of **0.2405 SOL** and took the **40 SOL** item. A 166x drain
with every other rule intact.

### Why the obvious fix is impossible

Weighted selection is O(n): to verify "row P is what this roll selects" you sum
the weights of everything before it. **A rule cannot loop.** There is no
`sum(collection where ...)`, and every rule is O(1) in document count.

### The fix: keep the answer ready, don't search for it

Maintain the running totals as rows arrive and leave, so the answer already
exists when the roll lands.

1. **Fixed weight tiers.** Let a row's weight come from a small ladder of
   allowed values rather than a free number, so every row in a tier shares one
   weight. Uniform-within-a-tier is then *exactly* weighted, not approximately.
2. **`cum[t]` boundaries** — running weight totals per tier, moved by
   `increment()` on every insert and delete. Never recomputed.
3. **Dense `slot` per tier**, kept packed by swap-with-last: when a row leaves,
   the last row in its tier moves into the gap. **The mover must name the row it
   replaces**, or a caller can shuffle a row into the winning slot *after* seeing
   the roll.

The check is then two comparisons and a remainder:

```
(@data.tier == 3
  && inBand >= cum3 && inBand < cum4
  && within % count3 == @data.slot)
```

### Four facts you need, all worth knowing before you design around them

| | |
|---|---|
| a **rule** may call `@OraclePlugin.getRandomNumber` | **yes**, and it rejects a wrong value |
| it may name the draw **indirectly** through a field | **yes** — `getRandomNumber(@newData.drawRef, 0, get(/draws/@newData.drawRef).span)` |
| there is a modulo operator | **NO** — spell `a % b` as `a - (a // b) * b` |
| a rule can bind an intermediate value | **NO** — see below |

That last one has a real cost: an expression mentioning the roll a dozen times
calls the oracle a dozen times. **Materialise it once** into a field on the
request document, verified against the oracle at that moment, and read the field
everywhere downstream:

```
"create": "... && @newData.roll == @OraclePlugin.getRandomNumber($drawId, 0, get(/draws/$drawId).span)"
```

That also pins the outcome: one paid request, one roll, no re-rolling by retrying.

### One roll, two picks

Selecting a tier *and* a slot needs two independent values. Request a range of
`totalWeight * SLOT_SPAN` and split it — the remainder against `totalWeight`
chooses the band, the quotient chooses the slot within it.

## 4. What is still trusted

The mapping is now enforced, but keep two things honest in your own docs:

- **Slot compaction** is checked, not assumed — the mover names its replacement.
  Without that requirement it is trivially exploitable.
- **A draw that nobody advances** holds a queue slot. Make advancing
  permissionless and bind the outcome to the *request document* rather than to
  the caller, so anyone can crank without being able to steer. Add an expiry so
  one abandoned draw cannot wedge everyone.

## Related

- [onchain.md](onchain.md) — collections, hooks, escrow, the `@contract.address` PDA
- [policy-primitives.md](policy-primitives.md) — the plugin surface
- [../../bounded-backend/docs/invariants.md](../../bounded-backend/docs/invariants.md) — bounding what a draw can pay out
