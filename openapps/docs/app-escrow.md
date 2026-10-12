# App escrow

An OpenApps app holds a deal's USDC in its own policy: an onchain `escrows` collection with one account per escrow.
The funder's wallet funds it when it creates the escrow.
The app's agent releases it to the payee or refunds the funder, and it does that only through a data script its owner reviews (the holders, once the app is Open).
After the escrow expires, anyone can refund the funder.
There is no separate spending cap: the review is the control.

## The policy

Copy these two collections and keep `AGENT_ADDRESS` and `AGENT_ADDRESS_BOUND` exactly as the agent's run context gives them.

```json
{
  "auth": { "wallets": true },
  "constants": {
    "AGENT_ADDRESS": "<the agent's address>",
    "AGENT_ADDRESS_BOUND": true,
    "MAX_ESCROW_USDC": 1000000000,
    "MAX_ESCROW_SECONDS": 7776000
  },
  "escrows/$escrowId": {
    "description": "One deal's USDC, held in this escrow's own account. The funder's wallet creates it and funds it in the same transaction; the hook stamps the funder. Only a settlement moves the USDC out. Ids look like esc_<32 hex>, which never parses as a wallet address.",
    "onchain": true,
    "fields": {
      "payee": "Address!",
      "amount": "UInt!",
      "expiresAt": "UInt!",
      "ref": "String!",
      "funder": "Address?",
      "settled": "String?"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.funder == null && @newData.settled == null && @newData.payee != @user.address && @newData.payee != @const.AGENT_ADDRESS && @newData.amount > 0 && @newData.amount <= @const.MAX_ESCROW_USDC && @newData.expiresAt > @time.now && @newData.expiresAt <= @time.now + @const.MAX_ESCROW_SECONDS && @StringUtils.length(@newData.ref) >= 1 && @StringUtils.length(@newData.ref) <= 128",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount($escrowId) && @TokenPlugin.transfer(@user.address, $escrowId, @TokenPlugin.USDC, @newData.amount) && @DocumentPlugin.updateField(/escrows/$escrowId, 'funder', @user.address)"
      }
    },
    "queries": {
      "getEscrowBalance": {
        "description": "USDC this escrow holds, in 6-decimal base units.",
        "returnType": "Int",
        "query": "@TokenPlugin.getBalance($escrowId, @TokenPlugin.USDC)"
      },
      "getPayeeBalance": {
        "description": "USDC the payee's wallet holds, in 6-decimal base units.",
        "returnType": "Int",
        "query": "@TokenPlugin.getBalance(@data.payee, @TokenPlugin.USDC)"
      }
    }
  },
  "escrows/$escrowId/settlements/$settlementId": {
    "description": "Moves one escrow's USDC out, once. A release pays the payee and a refund pays the funder. Only the app's agent may sign either, through a data script its owner or holders reviewed; once the escrow has expired anyone may refund the funder. The hook marks the escrow settled in the same transaction as the transfer, so a failed transfer leaves it open to settle again with a new settlement id.",
    "onchain": true,
    "fields": {
      "kind": "String!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/escrows/$escrowId) != null && get(/escrows/$escrowId).funder != null && get(/escrows/$escrowId).settled == null && @TokenPlugin.getBalance($escrowId, @TokenPlugin.USDC) >= get(/escrows/$escrowId).amount && ((@newData.kind == 'release' && @user.address == @const.AGENT_ADDRESS) || (@newData.kind == 'refund' && (@user.address == @const.AGENT_ADDRESS || @time.now >= get(/escrows/$escrowId).expiresAt)))",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "((@newData.kind == 'release' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).payee, @TokenPlugin.USDC, get(/escrows/$escrowId).amount)) || (@newData.kind == 'refund' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).funder, @TokenPlugin.USDC, get(/escrows/$escrowId).amount))) && @DocumentPlugin.updateField(/escrows/$escrowId, 'settled', @newData.kind)"
      }
    }
  }
}
```

Keep the deal itself, with its terms and status, in an off-chain collection of the app, and put the deal's id in `ref`.
An onchain rule cannot read off-chain records, so the escrow carries only what its own rules need.

## Funding, from the app

The person paying funds the escrow from a click in the app, signed by the wallet they are signed in with:

```ts
import { set } from "@bounded-sh/client";

const escrowId = `esc_${crypto.randomUUID().replaceAll("-", "")}`;
await set(`escrows/${escrowId}`, {
  payee,            // the Solana address to pay
  amount,           // 6-decimal base units: 25000000 is 25 USDC
  expiresAt,        // unix seconds; after it, anyone can refund
  ref: deal.id,     // the app's own id for this deal
});
```

Send only those four fields: the hook stamps `funder`, and `settled` stays empty until a settlement.
The USDC must already be in that wallet; offer `onramp({ asset: "USDC" })` first ([bounded-onchain](../../bounded-onchain/SKILL.md)).
Write the escrow id onto the deal record once the funding lands.

## Releasing and refunding

The agent does not sign a settlement itself.
It proposes a data script that writes one settlement, and the script runs only after review:

- the owner of an Owned app, or the holders of an Open app, see its title, its reason, each effect it names, the settlement record it writes, and the script;
- they can veto it; when the review window lapses without a veto, it runs;
- the platform then re-reads the records, refuses if any changed since review, and writes the settlement as the agent's address.

A release script reads the escrow and writes one settlement:

```js
const escrow = get("escrows/esc_4b1d...");
assert(escrow && escrow.funder != null && escrow.settled == null, "escrow_not_open");
set("escrows/esc_4b1d.../settlements/release-1", { kind: "release" });
```

Its `readPaths` name both records: `escrows/esc_4b1d...` and `escrows/esc_4b1d.../settlements/release-1`.
A refund is the same with `kind: "refund"`.
After expiry, the app can offer anyone a refund button that writes the same settlement.
If a settlement's transfer fails, the escrow stays open: settle it again under a new settlement id.

## Tests

`policy-tests/escrow-settlement.json` checks who can fund, release and refund, with the token plugins mocked:

```json
{
  "version": "1",
  "name": "The funder funds an escrow; only the agent releases or refunds it, and anyone refunds it after expiry",
  "actors": {
    "Agent": { "id": "22WVBCrFKNmpBrMZN2kssj16Y2FwWawXZ3BkZCzGM9JJ", "address": "22WVBCrFKNmpBrMZN2kssj16Y2FwWawXZ3BkZCzGM9JJ" },
    "Funder": { "id": "7WhXGDU8wU7WXTSn1rMrWU47Ae5Rea3nxqCVRek3rNSs", "address": "7WhXGDU8wU7WXTSn1rMrWU47Ae5Rea3nxqCVRek3rNSs" },
    "Payee": { "id": "734cRLT48boeaB2dafVVhBasRXkXzXQ7LUBQzmms76vX", "address": "734cRLT48boeaB2dafVVhBasRXkXzXQ7LUBQzmms76vX" },
    "Stranger": { "id": "8YHRDX4cGNifr48zt2k8QfB2HMaC3SzX56jJqQSXvrRW", "address": "8YHRDX4cGNifr48zt2k8QfB2HMaC3SzX56jJqQSXvrRW" }
  },
  "steps": [
    { "op": "setTime", "epoch": 1800000000 },
    { "op": "mock", "function": "@AccountPlugin.createAccount", "returns": true },
    { "op": "mock", "function": "@TokenPlugin.transfer", "returns": true },
    { "op": "mock", "function": "@TokenPlugin.getBalance", "returns": 25000000 },
    { "op": "as", "who": "Funder" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001", "data": { "payee": "$Payee", "amount": 25000000, "expiresAt": 1800086400, "ref": "deal-1", "funder": "$Funder" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001", "data": { "payee": "$Funder", "amount": 25000000, "expiresAt": 1800086400, "ref": "deal-1" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001", "data": { "payee": "$Agent", "amount": 25000000, "expiresAt": 1800086400, "ref": "deal-1" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001", "data": { "payee": "$Payee", "amount": 25000000, "expiresAt": 1800086400, "ref": "deal-1" } },
    { "op": "expect", "expr": "get(/escrows/esc_00000000000000000000000000000001).funder == '$Funder'" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001", "data": { "settled": "release" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001/settlements/r1", "data": { "kind": "release" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001/settlements/r1", "data": { "kind": "refund" }, "shouldFail": true },
    { "op": "as", "who": "Stranger" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001/settlements/r1", "data": { "kind": "release" }, "shouldFail": true },
    { "op": "as", "who": "Agent" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001/settlements/r1", "data": { "kind": "release" } },
    { "op": "expect", "expr": "get(/escrows/esc_00000000000000000000000000000001).settled == 'release'" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000001/settlements/r2", "data": { "kind": "refund" }, "shouldFail": true },
    { "op": "as", "who": "Funder" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000002", "data": { "payee": "$Payee", "amount": 25000000, "expiresAt": 1800003600, "ref": "deal-2" } },
    { "op": "as", "who": "Agent" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000002/settlements/f1", "data": { "kind": "refund" } },
    { "op": "expect", "expr": "get(/escrows/esc_00000000000000000000000000000002).settled == 'refund'" },
    { "op": "as", "who": "Funder" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000003", "data": { "payee": "$Payee", "amount": 25000000, "expiresAt": 1800003600, "ref": "deal-3" } },
    { "op": "as", "who": "Stranger" },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000003/settlements/x1", "data": { "kind": "refund" }, "shouldFail": true },
    { "op": "advanceTime", "seconds": 3601 },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000003/settlements/x1", "data": { "kind": "release" }, "shouldFail": true },
    { "op": "set", "path": "escrows/esc_00000000000000000000000000000003/settlements/x1", "data": { "kind": "refund" } },
    { "op": "expect", "expr": "get(/escrows/esc_00000000000000000000000000000003).settled == 'refund'" }
  ]
}
```

The test's `AGENT_ADDRESS` must match its `Agent` actor: run it against a copy of the policy with that address, or with the app's own constant and actor.
Run it with `bounded tests run` ([policy tests](../../bounded-backend/docs/policy-tests.md)).

## Where it works

The agent's settlement goes out from its data script as its own address.
On a Poofnet main app that works today.
On a mainnet main app it needs the agent wallet's own signature on a Solana transaction, which the data-script lane does not give yet: the script is refused (`brain_data_script_onchain_unavailable`).
Until it does, hold a mainnet deal's USDC in the venue escrow ([SDK reference](../../bounded-frontend/docs/sdk-reference.md#venue-escrows---fundvenueescrow--disputevenueescrow--getvenueescrow)).

## Why it holds

- Each escrow's USDC sits in its own account, keyed by its id, so a settlement can only move that escrow's money.
- The funder is stamped by the hook from the signing wallet; it cannot be forged at create.
- A settlement pays only the payee or the funder fixed at create, and only the escrow's whole amount.
- The hook marks the escrow settled in the same transaction as the transfer, so it settles once.
- Only `AGENT_ADDRESS` releases, and the agent signs only through a reviewed data script; anyone else can only refund, and only after expiry.
