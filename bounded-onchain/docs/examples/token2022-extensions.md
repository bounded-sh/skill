# Token-2022 extensions

Create Token-2022 mints with extensions via `@TokenPlugin.createToken2022`: transfer fees (with per-holder fee withdrawal), non-transferable soulbound badges, and interest-bearing tokens.

Status: every `@TokenPlugin` function used here is currently **unverified** (source parity only, LIVE-PENDING) in [solana-capability-status.md](../solana-capability-status.md).

## Policy

```json
{
  "constants": {
    "MAX_FEE_BPS": 10000,
    "MAX_INTEREST_BPS": 10000,
    "TOKEN_DECIMALS": 6
  },
  "feeTokens/$tokenId": {
    "description": "Token-2022 mint with the transfer-fee extension; the creating wallet is the fee and withdraw authority",
    "onchain": true,
    "fields": {
      "name": "String!",
      "symbol": "String!",
      "uri": "String!",
      "supply": "UInt!",
      "feeBps": "UInt!",
      "maxFee": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.supply > 0 && @newData.feeBps > 0 && @newData.feeBps <= @const.MAX_FEE_BPS && @newData.maxFee > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.createToken2022($tokenId, @newData.name, @newData.symbol, @newData.uri, @const.TOKEN_DECIMALS, { feeBasisPoints: @newData.feeBps, maxFee: @newData.maxFee, transferFeeAuthority: @user.address, withdrawWithheldAuthority: @user.address }) && @TokenPlugin.mint($tokenId, @newData.name, @newData.symbol, @user.address, @newData.supply)"
      }
    },
    "operationDetails": {
      "create": "Creates the mint with transfer fees and mints the full supply to the creating wallet. feeBps=100 is 1%; maxFee and supply are integer base units (1000000 = 1 token at 6 decimals). All fields are create-only; updates and deletes are denied."
    }
  },
  "feeWithdrawals/$withdrawalId": {
    "description": "Withdraw the transfer fees withheld in one holder's token account",
    "onchain": true,
    "fields": {
      "tokenId": "String!",
      "receiver": "Address!",
      "source": "Address!"
    },
    "rules": {
      "read": "true",
      "create": "get(/feeTokens/@newData.tokenId) != null && @TokenPlugin.getWithdrawWithheldAuthority(@TokenPlugin.getTokenMintAddress(@newData.tokenId, get(/feeTokens/@newData.tokenId).name, get(/feeTokens/@newData.tokenId).symbol)) == @user.address",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.withdrawWithheldTokens(@TokenPlugin.getTokenMintAddress(@newData.tokenId, get(/feeTokens/@newData.tokenId).name, get(/feeTokens/@newData.tokenId).symbol), @user.address, @newData.receiver, @newData.source)"
      }
    },
    "operationDetails": {
      "create": "The on-chain withdraw authority harvests fees withheld in source's token account to receiver's ATA. Fees accumulate per holder, so call once per holder."
    }
  },
  "badges/$badgeId": {
    "description": "Soulbound (non-transferable) achievement badges, one indivisible unit each",
    "onchain": true,
    "fields": {
      "recipient": "Address!",
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
        "create": "@TokenPlugin.createToken2022($badgeId, @newData.name, @newData.symbol, @newData.uri, 0, { nonTransferable: true }) && @TokenPlugin.mint($badgeId, @newData.name, @newData.symbol, @newData.recipient, 1)"
      }
    },
    "operationDetails": {
      "create": "Issues one soulbound badge to recipient. decimals=0 makes it indivisible; nonTransferable blocks ALL transfers after mint, including to self."
    }
  },
  "savingsTokens/$tokenId": {
    "description": "Interest-bearing Token-2022 mint; displayed balance grows (or shrinks) at the configured annual rate",
    "onchain": true,
    "fields": {
      "name": "String!",
      "symbol": "String!",
      "uri": "String!",
      "supply": "UInt!",
      "interestBps": "Int!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.supply > 0 && @newData.interestBps + @const.MAX_INTEREST_BPS >= 0 && @newData.interestBps <= @const.MAX_INTEREST_BPS",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.createToken2022($tokenId, @newData.name, @newData.symbol, @newData.uri, @const.TOKEN_DECIMALS, { interestRate: @newData.interestBps, interestRateAuthority: @user.address }) && @TokenPlugin.mint($tokenId, @newData.name, @newData.symbol, @user.address, @newData.supply)"
      }
    },
    "operationDetails": {
      "create": "Creates the interest-bearing mint and mints supply to the creator. interestBps=500 is 5% annual; negative values are deflationary."
    }
  }
}
```

## Operations

1. Create a fee token: write `/feeTokens/<tokenId>` with `name`, `symbol`, `uri`, `supply`, `feeBps`, `maxFee`. The hook creates the mint with the transfer-fee extension and mints the supply to the caller's wallet.
2. Withdraw fees: after transfers have accrued withheld fees, the creator writes `/feeWithdrawals/<id>` naming the `tokenId`, the `receiver` owner, and the `source` holder to harvest from. Repeat per holder.
3. Issue a badge: write `/badges/<badgeId>` with `recipient` and metadata; one indivisible non-transferable unit is minted to the recipient.
4. Create a savings token: write `/savingsTokens/<tokenId>` with metadata, `supply`, and `interestBps`.

Token ids share one app-scoped namespace across collections, so pick prefixed ids (`fee_x`, `badge_x`, `sav_x`) to avoid collisions.

## Extensions constraints

Verbatim from the generated [`@TokenPlugin`](../plugins/TokenPlugin.md) page, the `extensions` argument of `createToken2022`:

> Optional extensions object. Fields: nonTransferable (true|false), feeBasisPoints (0-65535), maxFee (required if feeBasisPoints > 0), transferFeeAuthority (REQUIRED if feeBasisPoints > 0), withdrawWithheldAuthority (optional, defaults to transferFeeAuthority), interestRate (i16), interestRateAuthority (REQUIRED if interestRate is set), permanentDelegate (address). Address fields can be wallet, @contract.address (escrow), or account ID.

The extensions object accepts only the fields listed on the generated TokenPlugin page; there are no fields for the Token-2022 metadata extension, confidential transfers, transfer hooks, CPI guard, or default account state, so `createToken2022` cannot enable them. 

## Why it holds

- Fee withdrawal is gated by the mint's real on-chain state: the rule requires `@TokenPlugin.getWithdrawWithheldAuthority(mint) == @user.address`, so only the wallet the mint itself names as withdraw authority can trigger a harvest - a spoofed document cannot redirect fees.
- `get(/feeTokens/@newData.tokenId) != null` blocks withdrawals against token ids this app never created, so the hook never derives a mint for a foreign id.
- `feeBps > 0 && maxFee > 0` keeps every fee token's parameters meaningful, and the hook always supplies the `maxFee` and `transferFeeAuthority` that the plugin contract requires whenever `feeBasisPoints > 0`.
- Every field is `!` and `update`/`delete` are `"false"`, so mint parameters recorded at create time can never be rewritten to misrepresent a live mint.
- Interest rate is bounded to +-`MAX_INTEREST_BPS`, keeping it inside the extension's i16 range and stopping absurd inflation/deflation settings.
- Rules stay pure boolean gates; every mutating call (`createToken2022`, `mint`, `withdrawWithheldTokens`) lives in `hooks.onchain.create`, and a failed call reverts the whole write atomically.

## Related

- [`@TokenPlugin` reference](../plugins/TokenPlugin.md)
- [Custody and PDAs](../custody-and-pdas.md)
- [Plugin catalog](../plugins.md)
- [Capability status](../solana-capability-status.md)
