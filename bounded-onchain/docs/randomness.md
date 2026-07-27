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

## 3. THE ROLL IS READABLE BEFORE IT IS USED

Read this before designing anything. `getRandomNumber` returns a value through
the query **the moment the oracle fulfils**, which is *before* anyone submits
the write that acts on it. So the attacker's move is not to guess the roll — it
is to see their own roll and then change whatever the outcome resolves against
until it points somewhere better.

Measured on a live pool: a buyer paid, waited for fulfilment, read their roll,
listed one cheap item to shift the aggregate the selection was computed
against, and turned a 0.1 SOL prize into a 0.5 SOL one. The nudge listing was
withdrawable afterwards, so it cost nothing.

**Therefore: whatever the selection resolves against MUST NOT move between the
request and the resolution.** Two rules and one kindness:

1. **Freeze removals** while a draw is outstanding.
2. **One draw at a time.** A weighted draw over a set that can change is not
   soundly checkable in O(1): a second roll was drawn over the *old* total and,
   once the first draw removes something, can land outside the new set
   entirely. Serialise (`get(/pool/main).pendingDraws == 0` to request) unless
   you are willing to build reservations. Draws resolve in seconds.
3. **STAGE additions, do not refuse them.** This is why FWA-style pools have a
   deposit delay, and the reason is soundness, not UX. Escrow the asset
   immediately in a `staged` status that is outside the selectable set, then
   flush it in once the queue is clear. Make flushing permissionless so anyone's
   crank clears everyone's backlog. Stamp any per-item accounting (a fee-share
   debt, a join timestamp) at FLUSH, or the item collects rewards from before it
   joined.

## 4. Making the DRAW provable, not just the number

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

### NEVER split one roll into two picks

An earlier version of this document recommended requesting a range of
`totalWeight * SLOT_SPAN` and splitting it — remainder for the band, quotient
for the slot. **That is biased and you must not do it.** The quotient has only
`SLOT_SPAN` distinct values, so `quotient % count` is uniform only when
`count` divides `SLOT_SPAN`. Measured at `SLOT_SPAN = 4096`:

| items in a band | result |
|---|---|
| 3,000 | slots 0–1095 are drawn **twice as often** as the rest |
| 4,095 | slot 0 is drawn twice as often as every other slot |
| 5,000 | **904 items are UNREACHABLE** — never drawn, ever |

An unreachable item is worse than unfair: in a pool that pays holders, it sits
collecting rewards while being impossible to win. Multiplying the range also
burns headroom against the 53-bit ceiling.

**Use one dimension.** Give every item a CONTIGUOUS RUN of roll values and ask
for a single uniform roll over exactly the total:

```
roll  uniform in [0, totalWeight)
tier  t   where   cum_t <= roll < cum_{t+1}
slot      =       (roll - cum_t) // weight_t
```

Each item owns exactly `weight_t` consecutive values, so this is exactly
weighted, needs no modulo, and has no bias to reason about. If your items are
uniformly weighted the whole thing collapses to `roll == slot`.

### Bind everything the caller could otherwise choose

Each of these was a real hole:

- **The VRF range must be derived, not supplied.** If the caller creates the
  request document with its own range, `span = 1` makes `getRandomNumber`
  return 0 every time — a pinned outcome. Bind it to the paid request:
  `@newData.span == getAfter(/orders/$drawId).span`.
- **The request must ride the SAME batch as the payment.** Split in two, the
  payment lands and the randomness request fails on read-after-write lag,
  stranding a paid draw with no roll — which, under one-at-a-time draws, holds
  the queue until it expires. Observed in practice.
- **Any timestamp that drives expiry must be bound to `@time.now`.** A
  caller-supplied one can be dated far ahead so the draw can never be retired,
  freezing the pool permanently. `@newData.requestedAt <= @time.now` is enough;
  past-dating only expires the caller's own draw sooner.
- **A swap-with-last mover must be proven to have been LAST.** Checking only
  that it lands in the vacated slot lets an allocation slide any same-band item
  into that slot and leave a hole behind it.

## 5. Liveness: a queue that cannot drain is worse than a slow one

Once draws are serialised, anything that fails to resolve freezes everybody. So
every exit has to be guaranteed, not likely.

- **Make advancing permissionless** and bind the outcome to the *request
  document* rather than to the caller, so any passer-by can crank a stranger's
  draw without being able to steer it. Surface it in the UI too: the person most
  motivated to clear the queue is whoever is holding it.
- **Distribute NOTHING at payment.** Hand out revenue shares on RESOLUTION, so
  an unresolved draw has paid nobody and can be refunded whole. Freeze
  reward claims while a draw is outstanding — that is what makes the refund
  provably reversible, because those funds demonstrably have not left.
- **A retired draw must refund.** Forfeiting a paid draw because randomness was
  slow is a bug, not a policy.
- **RECORD any aggregate delta you may need to reverse; never recompute it.**
  Recomputing from a live count means that if that count has moved, the reversal
  will not match and the write is refused **forever** — the draw becomes
  unexpirable and the queue wedges. This bricked a live pool: both advance and
  retire returned access-denied and nobody could act. Store the delta on the
  request when you apply it, and reverse exactly that number.
- **Leave a migration branch.** A row written under older accounting will lack
  whatever field you just added, so give the retire path a branch that can still
  drain it (no refund, nothing to reverse). Without one, a schema change bricks
  the queue.
- **An exclusive choice needs a deadline.** If a winner picks between outcomes
  that are rival claims on one escrow, their inaction freezes the *depositor's*
  asset and funds indefinitely. Give the winner an exclusive window, then let
  anyone finalise the DEFAULT — with all value still flowing to the rightful
  parties, so the finaliser is a janitor and not a beneficiary.

## 6. What is still trusted

Say these plainly in your own docs rather than implying they are proved:

- **A green `bounded verify` does not mean the draw is fair.** It proves the
  obligations you *declared* plus generated ownership and immutability ones. It
  cannot know that a selection should be unsteerable or that odds should be
  unbiased. Every bug on this page passed the prover.
- **Slot compaction** is checked, not assumed — the mover names its replacement
  and proves it was last.

## Related

- [onchain.md](onchain.md) — collections, hooks, escrow, the `@contract.address` PDA
- [policy-primitives.md](policy-primitives.md) — the plugin surface
- [../../bounded-backend/docs/invariants.md](../../bounded-backend/docs/invariants.md) — bounding what a draw can pay out
