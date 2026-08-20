# Coin flip with verifiable randomness

A provably fair double-or-nothing coin flip: the bet requests an ORAO roll, the reveal shape guarantees only the oracle produced it, and a permissionless settle write is forced by the rules to pay exactly what the roll implies.

> Status: ORAO functions (`requestRandomness`, `getRandomNumber`, `getVRFAddress`) are present in compiler and runtime but remain `unverified` on devnet per [solana-capability-status.md](../solana-capability-status.md).

## Policy

```json
{
  "constants": {
    "HOUSE_ID": "coinflip-house-v1",
    "MIN_BET": 10000000
  },
  "houseDeposits/$depositId": {
    "description": "Funding writes for the house pot that pays winners.",
    "onchain": true,
    "fields": { "amount": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.amount > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount(@const.HOUSE_ID) && @TokenPlugin.transfer(@user.address, @const.HOUSE_ID, @TokenPlugin.SOL, @newData.amount)"
      }
    },
    "queries": {
      "houseBalance": { "returnType": "UInt", "query": "@TokenPlugin.getBalance(@const.HOUSE_ID, @TokenPlugin.SOL)" }
    },
    "operationDetails": {
      "read": "Anyone can audit funding history and the pot balance.",
      "create": "Deposit SOL into the named house PDA. createAccount is idempotent, so the first deposit creates the pot atomically with the funding transfer. This MUST happen in a normal user write: the reveal path below is written server-driven with no user context, so its writes cannot fund account creation."
    }
  },
  "flips/$flipId": {
    "description": "One coin-flip bet: create requests the roll, update settles against it.",
    "onchain": true,
    "fields": {
      "player": "Address!",
      "choice": "UInt!",
      "stake": "UInt!",
      "settled": "Bool",
      "roll": "UInt?",
      "payout": "UInt?"
    },
    "rules": {
      "read": "true",
      "create": "@newData.player == @user.address && (@newData.choice == 0 || @newData.choice == 1) && @newData.stake >= @const.MIN_BET && @newData.settled == false && @newData.roll == null && @newData.payout == null && @TokenPlugin.getBalance(@const.HOUSE_ID, @TokenPlugin.SOL) >= @newData.stake * 2",
      "update": "@user.address != null && @data.settled == false && @newData.settled == true && @newData.player == @data.player && @newData.choice == @data.choice && @newData.stake == @data.stake && @newData.roll == @OraclePlugin.getRandomNumber($flipId, 0, 2) && ((@newData.roll == @data.choice && @newData.payout == @data.stake * 2 && @TokenPlugin.getBalance(@const.HOUSE_ID, @TokenPlugin.SOL) >= @newData.payout) || (@newData.roll != @data.choice && @newData.payout == 0))",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@user.address, @const.HOUSE_ID, @TokenPlugin.SOL, @newData.stake) && @OraclePlugin.requestRandomness($flipId, /flipreveals/$flipId)",
        "update": "(@newData.payout > 0 && @TokenPlugin.transfer(@const.HOUSE_ID, @data.player, @TokenPlugin.SOL, @newData.payout)) || (@newData.payout == 0)"
      }
    },
    "queries": {
      "roll": { "returnType": "UInt", "query": "@OraclePlugin.getRandomNumber($flipId, 0, 2)" },
      "vrf": { "returnType": "Address", "query": "@OraclePlugin.getVRFAddress($flipId)" }
    },
    "operationDetails": {
      "read": "Anyone can view flips. settled == false means the roll is pending or unsettled.",
      "create": "Player bets on heads (0) or tails (1). The hook moves the stake to the house and requests randomness in the SAME atomic write, so a paid bet can never be stranded without a roll.",
      "update": "The settle write. Onchain updates are patches: send only { settled: true, roll, payout } and OMIT the readonly player/choice/stake fields; the preservation clauses then hold over the merged document. Any authenticated caller can crank it, but the rule pins roll to the oracle and payout to the roll."
    }
  },
  "flipreveals/$flipId": {
    "description": "ORAO reveal target. Its shape is dictated by the deploy gate, not chosen.",
    "isRevealPath": true,
    "onchain": true,
    "fields": {},
    "rules": {
      "read": "true",
      "create": "@OraclePlugin.getRandomNumber($flipId, 0, 1) == 0"
    },
    "operationDetails": {
      "read": "The reveal document is the settlement and audit record that follows fulfillment; the fulfillment signal itself is the roll query on /flips returning an in-range value (it reads ORAO's randomness account directly, with no indexing dependency).",
      "create": "Server-driven oracle write with no user context. Note the create rule is NOT \"false\": the mandated shape (onchain, empty fields, exactly this getRandomNumber rule, one path variable, no update/delete) is the only accepted form. Because there is no user and no transaction payer here, this path carries no hooks and could not call createAccount - the house PDA is created in the houseDeposits user write instead."
    }
  }
}
```

## Operations

1. **Fund the house** (one or more times): `set('houseDeposits/<id>', { amount })`. The first deposit creates the `coinflip-house-v1` PDA idempotently and funds it in one atomic hook.
2. **Bet**: `set('flips/<flipId>', { player: <your wallet>, choice: 0 | 1, stake, settled: false })`. Denied unless the house holds at least `2 * stake`. The hook transfers the stake and requests randomness together.
3. **Wait for fulfillment**: confirm the request transaction, then poll `runQuery('flips/<flipId>', 'roll', {})` with bounded backoff until it returns an in-range value (0 or 1). That query reads ORAO's randomness account directly and involves no platform indexing, so an in-range roll IS fulfillment: enable the settle step on it. The `flipreveals/<flipId>` document is the settlement/audit record that normally lands shortly after - observe it, but never block the UI on it; a queryable roll with a long-absent reveal doc means a platform indexing delay, not an unfulfilled request. Stop at an explicit deadline; an absent result is not success. `vrf` returns the on-chain VRF account for independent verification.
4. **Settle** (permissionless crank): patch `set('flips/<flipId>', { settled: true, roll: <observed roll>, payout: <stake*2 or 0> })`, omitting the readonly fields. A wrong `roll` or a `payout` inconsistent with it is denied; on a win the hook pays `2 * stake` from the house PDA to the recorded player.

## Why it holds

- **Only the oracle writes reveals.** The reveal collection is `onchain: true`, fieldless, `isRevealPath: true`, with the exact mandated create rule and one path variable - no attacker-controllable content, write-once, and exempt from the create-authentication obligation by shape, which is stronger than "someone was signed in".
- **Reveal writes are server-driven with no user context**, so they cannot make payer-funded calls like `createAccount` (this reveal collection declares no hooks at all); the house PDA is created in a normal user write (the funding hook) before any reveal can land.
- **Seeing the roll early steers nothing.** The roll is readable the moment ORAO fulfils, before settlement - but the settle rule resolves only against the flip document itself: `player`, `choice`, `stake` are readonly with preservation clauses, and the rule reads no other collection via `get()`, so there is no mutable resolution basis to nudge (and no VRF-resolution-basis advisory).
- **The roll is materialised once.** `@newData.roll == @OraclePlugin.getRandomNumber($flipId, 0, 2)` pins one paid request to one roll - no re-rolling by retrying - and downstream terms read the field, not the oracle again.
- **The payout is forced, not asserted.** The same rule binds `payout` to `stake * 2` exactly when `roll == choice` and to `0` otherwise, so a modified client cannot pick its own prize; the hook only executes what the rule already proved.
- **Solvency is checked against the real pot.** Bets require `getBalance(HOUSE_ID) >= stake * 2` and winning settlements re-check the balance covers the payout; the stake itself rides the same atomic write as the randomness request, so no paid bet is stranded rollless.
- **Double-settlement is impossible**: `@data.settled == false && @newData.settled == true` makes settle a one-way transition, and settling is permissionless so a stuck player is not needed to clear their own flip.
- **Custody is physical.** `coinflip-house-v1` is a non-pubkey account id that is globally unique by construction (a fixed app-scoped constant, so it cannot alias a path-variable id): stake deposits are user-signed, payouts are program-signed from the named PDA, and wherever the pot appears as a source or destination, the raw id string is used, never a resolved getAccountAddress(...) address.

## Related

- [../randomness.md](../randomness.md) - the request/reveal pair, the mandated reveal shape, and anti-cheat sequencing
- [../custody-and-pdas.md](../custody-and-pdas.md) - named PDAs, idempotent createAccount, and why server-driven reveal writes cannot create accounts
- [../plugins.md](../plugins.md) - `@OraclePlugin`, `@TokenPlugin`, `@AccountPlugin` signatures
- [../solana-capability-status.md](../solana-capability-status.md) - live support state of the ORAO functions
