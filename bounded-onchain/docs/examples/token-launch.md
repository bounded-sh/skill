# Token launch on Pump.fun

Let any signed-in user launch a Pump.fun bonding-curve token, let any signed-in user buy on the curve, and choose who custodies the creator fees.

> Status: every `@PumpFunPlugin` function used here is present in the deployed runtime but **unverified** (marker `LIVE-PUMP-PROOF` in [solana-capability-status.md](../solana-capability-status.md)) - confirm each transaction lands and poll the expected postcondition rather than assuming it.

## Policy

```json
{
  "tokens/$tokenId": {
    "description": "One Pump.fun bonding-curve token per document. The signed-in launcher becomes the creator-fee recipient.",
    "onchain": true,
    "fields": {
      "name": "String!",
      "symbol": "String!",
      "uri": "String!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@PumpFunPlugin.createToken($tokenId, @newData.name, @newData.symbol, @newData.uri, @user.address, {seedMode: \"idOnly\"})"
      }
    },
    "queries": {
      "mintAddress": {
        "returnType": "Address",
        "query": "@TokenPlugin.getTokenMintAddress($tokenId)"
      },
      "curveProgress": {
        "returnType": "UInt",
        "query": "@PumpFunPlugin.getBondingCurveProgress(@TokenPlugin.getTokenMintAddress($tokenId))"
      },
      "creatorFee": {
        "returnType": "Int",
        "query": "@PumpFunPlugin.getCreatorFee(@TokenPlugin.getTokenMintAddress($tokenId))"
      }
    },
    "operationDetails": {
      "read": "Public read of the launch record; curveProgress returns a whole-number percentage 0-100 and is 100 once the curve completes. Both reads return 0 when the curve account is unavailable, so 0 never proves an empty result.",
      "create": "uri must be a permanent, public Metaplex metadata JSON URL (name, symbol, image fields) - never an image URL. The caller's wallet is passed as creator, so it receives Pump.fun creator fees. seedMode idOnly derives the mint from appId + $tokenId alone. This collection never updates or deletes."
    }
  },
  "tokens/$tokenId/buys/$buyId": {
    "description": "Buy on the bonding curve with an exact SOL amount from the buyer's own wallet.",
    "onchain": true,
    "fields": {
      "solLamports": "UInt!",
      "slippageBps": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.solLamports > 0 && @newData.slippageBps > 0 && @newData.slippageBps <= 1000",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@PumpFunPlugin.buyExactSolIn(@user.address, @TokenPlugin.getTokenMintAddress($tokenId), @newData.solLamports, @newData.slippageBps)"
      }
    },
    "operationDetails": {
      "create": "solLamports is in lamports (1 SOL = 1000000000); slippageBps is basis points, capped at 1000 (10%). The buyer signs: the wallet in source position is @user.address, so self-custody. There is no sell primitive on the curve; selling waits for graduation to PumpSwap."
    }
  },
  "tokens/$tokenId/sweeps/$sweepId": {
    "description": "Permissionless crank that sweeps accrued creator fees from the vault to the creator wallet.",
    "onchain": true,
    "fields": {
      "creator": "Address!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@PumpFunPlugin.collectCreatorFee(@newData.creator)"
      }
    },
    "operationDetails": {
      "create": "Anyone signed in may trigger the sweep. The destination is validated on chain against the bonding curve, so a wrong creator address makes the transaction fail rather than misdirecting funds."
    }
  }
}
```

## Operations

1. Launch: write `tokens/{tokenId}` with `name`, `symbol`, `uri`. The create hook launches the token with the caller's wallet as creator-fee recipient. All three fields are readonly-after-create and `update` is `"false"`, so the record is immutable - no patch payloads exist for this collection.
2. Buy: write `tokens/{tokenId}/buys/{buyId}` with `solLamports` and `slippageBps`. The buyer's wallet signs and spends its own SOL; tokens land in the buyer's ATA.
3. Sweep fees: write `tokens/{tokenId}/sweeps/{sweepId}` with the creator address. Permissionless crank; fees move from the Pump.fun vault to the creator wallet.

Creator-fee custody options (pick one before launch - the `creator` argument of `createToken` is the only place the recipient is chosen):

- Self-custody (this policy): pass `@user.address`. Fees belong to the launcher's wallet after a sweep.
- App custody: pass a non-pubkey account id string such as `"launch_fee_pot"` instead. That resolves to a program-signed named PDA (create it idempotently with `@AccountPlugin.createAccount("launch_fee_pot") && ...` in the same hook). Pay out later with `@TokenPlugin.transfer("launch_fee_pot", dest, mint, amt)` in a payout hook, gated in the rule by `@TokenPlugin.getBalance("launch_fee_pot", mint) >= @newData.amount`. Prefix the id per collection - the account-id namespace is app-global.
- Split custody: launch with any recipient, then `@PumpFunPlugin.createFeeSharingConfig(source, mint)` plus `@PumpFunPlugin.updateShareholders(source, mint, [{addr: ..., bps: ...}, ...])` (1-10 entries, bps totaling exactly 10000) and settle with the permissionless `@PumpFunPlugin.distributeCreatorFees(mint)`. Whoever you pass as `source` when creating the config pays rent and becomes its permanent admin, so gate that policy path deliberately.

## Why it holds

- Rules stay pure boolean gates and all value movement lives in `hooks.onchain.create`, so `bounded verify` proves who can write, and a hook that fails reverts the whole write atomically - no launch record without a launched token.
- The launch hook hardwires `@user.address` as creator: no field a caller could point at someone else's wallet, so fee-recipient spoofing is structurally impossible.
- `update` and `delete` are `"false"` on every collection, so nobody can rewrite `uri` or `name` after launch to re-skin a token, and no `!`-field preservation clauses are needed.
- Buys pass the buyer's own wallet as `source`, so the buyer signs and only the buyer's funds move; `solLamports > 0` and the 1000-bps slippage cap stop zero-value spam and unbounded slippage.
- The sweep is safe to expose permissionlessly because Pump.fun validates the destination against the bonding curve on chain; a wrong `creator` fails instead of redirecting fees.
- `curveProgress` and `creatorFee` are pure reads that return 0 when accounts are unavailable, so the page treats 0 as "nothing readable", never as proof of an empty vault.

## Related

- [Pump.fun plugin reference](../pump-fun.md) - argument contracts for every call used here
- [Custody and PDAs](../custody-and-pdas.md) - the wallet / escrow / named-account custody rule
- [Plugin catalog](../plugins.md) - one-screen signature index
- [Solana capability status](../solana-capability-status.md) - `LIVE-PUMP-PROOF` markers for this surface
- [Meteora token launch](../meteora-token-launch.md) - the metadata-hosting note for `uri`, and the alternative launch stack
