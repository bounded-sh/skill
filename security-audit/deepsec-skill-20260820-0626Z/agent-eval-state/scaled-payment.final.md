Below is a complete single-seller, multi-offer policy. Replace the three address placeholders before verification.

```json
{
  "auth": {
    "wallets": true
  },
  "constants": {
    "SELLER_WALLET": "<SELLER_WALLET_ADDRESS>",
    "SALE_TOKEN_MINT": "<SALE_TOKEN_MINT_ADDRESS>",
    "PAYMENT_TOKEN_MINT": "<PAYMENT_TOKEN_MINT_ADDRESS>"
  },
  "offers/$offerId": {
    "description": "Immutable seller-authored price quote. unitPrice is payment base units per quantityScale sale-token base units.",
    "onchain": true,
    "fields": {
      "seller": "Address!",
      "unitPrice": "UInt!",
      "quantityScale": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @user.address == @const.SELLER_WALLET && @newData.seller == @const.SELLER_WALLET && @newData.unitPrice > 0 && @newData.quantityScale > 0",
      "update": "false",
      "delete": "false"
    },
    "operationDetails": {
      "create": "Only the configured seller creates an offer. For a token with six decimals priced per whole token, quantityScale is 1000000.",
      "update": "Offers are immutable. Publish a new offer id to change price.",
      "delete": "Offers remain as permanent price provenance."
    }
  },
  "inventoryDeposits/$depositId": {
    "description": "Seller deposits sale-token inventory into the app's single-seller escrow.",
    "onchain": true,
    "fields": {
      "seller": "Address!",
      "tokenQuantity": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @user.address == @const.SELLER_WALLET && @newData.seller == @const.SELLER_WALLET && @newData.tokenQuantity > 0",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@user.address, @contract.address, @const.SALE_TOKEN_MINT, @newData.tokenQuantity)"
      }
    }
  },
  "offers/$offerId/purchases/$purchaseId": {
    "description": "Atomic token purchase whose buyer, seller, current offer price, payment, and delivery are bound together.",
    "onchain": true,
    "fields": {
      "buyer": "Address!",
      "seller": "Address!",
      "tokenQuantity": "UInt!",
      "unitPrice": "UInt!",
      "spentBaseUnits": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && get(/offers/$offerId) != null && @newData.buyer == @user.address && @newData.seller == @const.SELLER_WALLET && @newData.seller == get(/offers/$offerId).seller && @newData.tokenQuantity > 0 && @newData.unitPrice > 0 && @newData.unitPrice == get(/offers/$offerId).unitPrice && @newData.spentBaseUnits > 0 && @newData.spentBaseUnits >= @MathPlugin.mulDivCeil(@newData.tokenQuantity, @newData.unitPrice, get(/offers/$offerId).quantityScale) && @TokenPlugin.getBalance(@contract.address, @const.SALE_TOKEN_MINT) >= @newData.tokenQuantity",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@user.address, @const.SELLER_WALLET, @const.PAYMENT_TOKEN_MINT, @newData.spentBaseUnits) && @TokenPlugin.transfer(@contract.address, @user.address, @const.SALE_TOKEN_MINT, @newData.tokenQuantity)"
      }
    },
    "operationDetails": {
      "create": "Buyer supplies buyer, seller, tokenQuantity, unitPrice, and spentBaseUnits. buyer must equal the signing wallet; seller and unitPrice must match the immutable offer. Payment and delivery execute atomically.",
      "update": "Purchases are append-only.",
      "delete": "Purchase provenance cannot be removed."
    }
  },
  "inventoryWithdrawals/$withdrawalId": {
    "description": "Configured seller reclaims unsold sale-token inventory.",
    "onchain": true,
    "fields": {
      "seller": "Address!",
      "tokenQuantity": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @user.address == @const.SELLER_WALLET && @newData.seller == @const.SELLER_WALLET && @newData.tokenQuantity > 0 && @TokenPlugin.getBalance(@contract.address, @const.SALE_TOKEN_MINT) >= @newData.tokenQuantity",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@contract.address, @const.SELLER_WALLET, @const.SALE_TOKEN_MINT, @newData.tokenQuantity)"
      }
    }
  }
}
```

Security rationale:

- The intended inequality is:

  `spentBaseUnits × quantityScale ≥ tokenQuantity × unitPrice`

  For positive integers, the policy’s form is exactly equivalent:

  `spentBaseUnits ≥ ceil(tokenQuantity × unitPrice / quantityScale)`

  `@MathPlugin.mulDivCeil` computes the intermediate product at full precision, avoiding fixed-width onchain overflow and avoiding lossy division-first approximations.

- The buyer cannot forge identity: `buyer == @user.address`, and the same signing wallet funds the payment and receives the purchased tokens.
- The seller cannot be redirected: the record, immutable offer, payment destination, inventory authority, deposits, and withdrawals all bind to `SELLER_WALLET`.
- The buyer cannot submit a cheaper unit price because it must equal the immutable offer price.
- Both token transfers are in one onchain hook. If payment, inventory, signing, or delivery fails, the entire transaction-including the purchase record-reverts.
- Purchases are immutable and create-once, so reusing a purchase ID cannot repeat payment.
- Shared `@contract.address` custody is appropriate only because this policy fixes one seller and one sale-token mint. Future collections must not gain unrelated withdrawal authority over that escrow.

Deployment caveat: the pinned catalog marks `@MathPlugin.mulDivCeil`, `@TokenPlugin.transfer`, and `getBalance` as `LIVE-PENDING`/unverified. Before production deployment, replace the placeholders, run `bounded verify --protocol <TARGET_PROTOCOL> --json`, confirm transaction-size acceptance, and require retained live-network evidence for those functions. No such external verification was performed in this read-only evaluation.