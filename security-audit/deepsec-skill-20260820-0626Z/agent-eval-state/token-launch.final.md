Replace the single wallet placeholder before verification. The numeric limits are conservative defaults: 0.001–0.1 SOL per buy, 0.5 SOL per wallet per rolling 24 hours, and 3% maximum slippage.

```json
{
  "auth": {
    "wallets": true
  },
  "errorDisclosure": "minimal",
  "constants": {
    "CREATOR_WALLET": "<CREATOR_SOLANA_WALLET_ADDRESS>"
  },
  "tokens/$tokenId": {
    "description": "Immutable Pump.fun launch record. The authorized creator wallet launches, pays creation costs, and receives creator fees.",
    "onchain": true,
    "tier": "durable",
    "fields": {
      "name": "String!",
      "symbol": "String!",
      "uri": "String!",
      "creator": "Address!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @user.address == @const.CREATOR_WALLET && @newData.creator == @const.CREATOR_WALLET",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@PumpFunPlugin.createToken($tokenId, @newData.name, @newData.symbol, @newData.uri, @const.CREATOR_WALLET, {seedMode: \"idOnly\"})"
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
      "create": "Only CREATOR_WALLET may launch. The creator argument is a policy constant rather than caller-controlled input. The creator wallet must fund Pump.fun creation costs. uri must identify permanent, public Metaplex metadata JSON-not an image URL.",
      "read": "curveProgress and creatorFee may return 0 when the relevant chain account is unavailable; 0 must not be treated as proof of no progress or no fees."
    }
  },
  "tokens/$tokenId/buyers/$buyer/buys/$buyId": {
    "description": "Immutable self-custodied Pump.fun buy receipt with per-transaction and rolling per-wallet spend bounds.",
    "onchain": true,
    "tier": "durable",
    "fields": {
      "sourceWallet": "Address!",
      "solLamports": "UInt!",
      "slippageBps": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && $buyer == @user.address && @newData.sourceWallet == @user.address && @newData.solLamports >= 1000000 && @newData.solLamports <= 100000000 && @newData.slippageBps > 0 && @newData.slippageBps <= 300",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "rollingSum",
        "name": "per_wallet_24h_buy_cap",
        "field": "solLamports",
        "windowSeconds": 86400,
        "limit": 500000000,
        "scopeVariable": "$buyer",
        "onchain": "onchainSupported"
      }
    ],
    "hooks": {
      "onchain": {
        "create": "@PumpFunPlugin.buyExactSolIn(@user.address, @TokenPlugin.getTokenMintAddress($tokenId), @newData.solLamports, @newData.slippageBps)"
      }
    },
    "operationDetails": {
      "create": "The authenticated buyer wallet is both the path owner and recorded source. The hook independently hardwires source to @user.address. solLamports is bounded to 0.001–0.1 SOL per transaction, rolling 24-hour spend is capped at 0.5 SOL per wallet, and slippage is capped at 300 basis points."
    }
  }
}
```

Security rationale:

- The launcher, fee recipient, and fee-paying creator are the same fixed wallet; callers cannot substitute another creator.
- Buy source is bound to the authenticated wallet in the path, record, rule, and hook.
- Per-buy limits prevent oversized orders; `rollingSum` prevents bypass by splitting orders.
- Launch and buy records cannot be updated or deleted. Failed hooks abort their corresponding record atomically.
- Mint selection is derived from `$tokenId`; buyers cannot inject an arbitrary mint address.
- Production error disclosure is minimal.

Pump.fun support is present in the pinned manifest but marked unverified with no retained live acceptance receipt. The older local CLI also lacks `bounded plugins`, so this policy was not locally verified. Before production, replace the wallet placeholder, review the chosen limits, verify against the intended protocol/runtime, and retain a successful live launch-and-buy receipt.