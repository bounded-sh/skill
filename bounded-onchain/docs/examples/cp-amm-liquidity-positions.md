# cp-AMM liquidity positions

Give every Meteora cp-AMM liquidity position its own named-PDA owner, so one document path maps to one position NFT and one physically isolated pot of funds, with the full lifecycle (create, deposit, withdraw, claim fees, close) driven by document writes.

Status note: every `@DeFiPlugin` cp-AMM function used here is currently **unverified** (source parity only, LIVE-METEORA-PROOF marker), and document `get()`, `@AccountPlugin.createAccount`, and `@TokenPlugin.transfer` are **unverified** (LIVE-PENDING) - check [solana-capability-status.md](../solana-capability-status.md) before shipping.

## Policy

Replace `POOL` with your real cp-AMM pool address (derivable via `@DeFiPlugin.getCpAmmPoolAddress`) and the two mints with your pair. Position ids are the PDA account ids, so prefix them (`pos_...`) client-side: the account-id namespace is app-global and ids must never parse as a pubkey.

```json
{
  "constants": {
    "POOL": "REPLACE_WITH_CP_AMM_POOL_ADDRESS",
    "TOKEN_A_MINT": "So11111111111111111111111111111111111111112",
    "TOKEN_B_MINT": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  },
  "positions/$positionId": {
    "onchain": true,
    "description": "One cp-AMM position per document. The raw id $positionId is also the named PDA that owns the position NFT and its token balances, so two positions structurally cannot share funds.",
    "fields": { "creator": "Address!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.creator == @user.address",
      "update": "false",
      "delete": "@user.address == @data.creator"
    },
    "hooks": {
      "onchain": {
        "create": "@AccountPlugin.createAccount($positionId) && @DeFiPlugin.createCpAmmPosition($positionId, @const.POOL, $positionId)",
        "delete": "@DeFiPlugin.closeCpAmmPosition($positionId, @const.POOL, @DeFiPlugin.getCpAmmPositionNftMintAddress($positionId, @const.POOL, $positionId))"
      }
    },
    "operationDetails": {
      "create": "createAccount is idempotent, so the atomic prefix is safe on retries; the position NFT is minted to the $positionId PDA.",
      "delete": "closeCpAmmPosition requires an EMPTY position - withdraw all liquidity first. Rent refunds to the position PDA."
    }
  },
  "positions/$positionId/deposits/$depositId": {
    "onchain": true,
    "description": "A deposit moves both tokens from the caller's wallet into the position PDA, then adds them to the pool position, atomically.",
    "fields": { "amountA": "UInt!", "amountB": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/positions/$positionId) != null && get(/positions/$positionId).creator == @user.address && @newData.amountA > 0 && @newData.amountB > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@user.address, $positionId, @const.TOKEN_A_MINT, @newData.amountA) && @TokenPlugin.transfer(@user.address, $positionId, @const.TOKEN_B_MINT, @newData.amountB) && @DeFiPlugin.addCpAmmLiquidity($positionId, @const.POOL, @DeFiPlugin.getCpAmmPositionNftMintAddress($positionId, @const.POOL, $positionId), @newData.amountA, @newData.amountB)"
      }
    },
    "operationDetails": {
      "create": "The wallet transfers require the caller's signature; the addCpAmmLiquidity leg is program-signed by the $positionId PDA. Amounts are smallest units; slippageBps is omitted (0)."
    }
  },
  "positions/$positionId/withdrawals/$withdrawId": {
    "onchain": true,
    "description": "A withdrawal removes liquidity into the position PDA and pays it out to the creator's wallet, atomically.",
    "fields": { "amountA": "UInt!", "amountB": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/positions/$positionId) != null && get(/positions/$positionId).creator == @user.address && @newData.amountA > 0 && @newData.amountB > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@DeFiPlugin.removeCpAmmLiquidity($positionId, @const.POOL, @DeFiPlugin.getCpAmmPositionNftMintAddress($positionId, @const.POOL, $positionId), @newData.amountA, @newData.amountB) && @TokenPlugin.transfer($positionId, @user.address, @const.TOKEN_A_MINT, @newData.amountA) && @TokenPlugin.transfer($positionId, @user.address, @const.TOKEN_B_MINT, @newData.amountB)"
      }
    }
  },
  "positions/$positionId/feeClaims/$claimId": {
    "onchain": true,
    "description": "Claims accrued pool fees into the position PDA and pays the requested amounts out to the creator, gated by the live claimable balance.",
    "fields": { "amountA": "UInt!", "amountB": "UInt!" },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/positions/$positionId) != null && get(/positions/$positionId).creator == @user.address && @newData.amountA + @newData.amountB > 0 && @DeFiPlugin.getClaimableCpAmmPositionFee($positionId, @const.POOL, @const.TOKEN_A_MINT) >= @newData.amountA && @DeFiPlugin.getClaimableCpAmmPositionFee($positionId, @const.POOL, @const.TOKEN_B_MINT) >= @newData.amountB",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@DeFiPlugin.claimDammV2PoolFees($positionId, @const.POOL) && @TokenPlugin.transfer($positionId, @user.address, @const.TOKEN_A_MINT, @newData.amountA) && @TokenPlugin.transfer($positionId, @user.address, @const.TOKEN_B_MINT, @newData.amountB)"
      }
    },
    "operationDetails": {
      "create": "positionMintAddress is omitted from the claim: each $positionId PDA owns exactly one position in the pool, so the aggregate form claims only that position's fees."
    }
  }
}
```

## Operations

Client writes, in lifecycle order, all as the signed-in user:

1. `set positions/pos_abc { creator: <my wallet> }` - creates the named PDA `pos_abc` and mints the position NFT to it in one transaction.
2. `set positions/pos_abc/deposits/d1 { amountA, amountB }` - pulls both tokens from the caller's wallet into the PDA and adds them as liquidity. The whole write reverts if any leg fails.
3. `set positions/pos_abc/withdrawals/w1 { amountA, amountB }` - removes exactly the requested liquidity (slippage 0) and pays it to the caller.
4. `set positions/pos_abc/feeClaims/c1 { amountA, amountB }` - claims accrued fees to the PDA and forwards the requested amounts; denied unless the live claimable balance covers them.
5. `delete positions/pos_abc` - closes the (now empty) position and recovers rent to the PDA.

All documents are `"onchain": true` with `"read": "true"` (validator-enforced). Update payloads never appear: every mutable operation is a create or a delete, and all `!` fields live on collections whose update rule is `"false"`.

## Why it holds

- **Per-position custody is structural, not accounting.** The position NFT and all interim token balances live in the `$positionId` named PDA; a hook under `positions/A/...` cannot name position B's funds. Ids are client-prefixed (`pos_`) because the account-id namespace is app-global.
- **The id string is the signing capability.** Every signer-position argument passes the raw `$positionId`, never `getAccountAddress(...)`; the validator statically rejects `getAccountAddress(...)` in signer positions, and a pubkey-shaped string would silently become an unsigned wallet reference instead of a program-signed PDA - so always pass the raw id.
- **Only the creator can move value.** Deposits, withdrawals, and fee claims all require `get(/positions/$positionId).creator == @user.address`, and `creator` is `Address!` on a collection whose update rule is `"false"`, so ownership cannot be rewritten after create.
- **Rules stay pure; hooks move funds.** Authorization is entirely in `rules` (the plane `bounded verify` proves); all mutating plugin calls sit in `hooks.onchain.create/delete` and revert atomically with the document write.
- **Fee payouts are gated by chain truth.** `getClaimableCpAmmPositionFee(...) >= @newData.amount` checks the live position, not app bookkeeping, so a claim document cannot extract more than the position actually earned.
- **Zero-amount and orphan writes are dead on arrival.** `amount > 0` guards and the parent-existence `get()` stop spam documents that would otherwise fire hooks against nothing.

## Related

- [DeFiPlugin reference](../plugins/DeFiPlugin.md) - argument contracts for every cp-AMM call used here
- [Custody and PDAs](../custody-and-pdas.md) - the named-PDA idiom and account-id hygiene
- [Plugin catalog](../plugins.md)
- [Capability status](../solana-capability-status.md)
