```json
{
  "constants": {
    "DAILY_SPEND_CAP_MINOR_UNITS": 0
  },
  "sellers/$sellerId/listings/$listingId": {
    "description": "Seller-owned listings. Publicly readable and writable only by the seller identified by the path.",
    "fields": {
      "seller": "String!",
      "title": "String!",
      "priceMinor": "UInt!",
      "active": "Bool!"
    },
    "tier": "durable",
    "search": {
      "fields": ["title"]
    },
    "rules": {
      "read": "true",
      "create": "@user.id != null && $sellerId == @user.id && @newData.seller == @user.id",
      "update": "@user.id != null && $sellerId == @user.id && @newData.seller == @data.seller",
      "delete": "@user.id != null && $sellerId == @user.id"
    },
    "operationDetails": {
      "read": "Listings are publicly browseable and searchable.",
      "create": "An authenticated seller may create a listing only below their own identity.",
      "update": "Only the owning seller may edit the listing; ownership cannot change.",
      "delete": "Only the owning seller may remove the listing."
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "listing_seller",
        "field": "seller",
        "pathVariable": "$sellerId"
      }
    ]
  },
  "buyers/$buyerId/orders/$orderId": {
    "description": "Buyer-owned, append-only order records whose amount is taken from the referenced active listing.",
    "fields": {
      "buyer": "String!",
      "listingRef": "String!",
      "seller": "String!",
      "amountMinor": "UInt!"
    },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null && $buyerId == @user.id",
      "create": "@user.id != null && $buyerId == @user.id && @newData.buyer == @user.id && get(/sellers/@newData.seller/listings/@newData.listingRef).active == true && @newData.amountMinor == get(/sellers/@newData.seller/listings/@newData.listingRef).priceMinor",
      "update": "false",
      "delete": "false"
    },
    "operationDetails": {
      "read": "A buyer may read only their own order history.",
      "create": "The buyer must write below their own identity. The referenced listing must exist and be active, and the order amount must equal its current stored price.",
      "update": "Orders are immutable.",
      "delete": "Orders cannot be deleted because they form the spend-cap history."
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "order_buyer",
        "field": "buyer",
        "pathVariable": "$buyerId"
      },
      {
        "type": "rollingSum",
        "name": "daily_spend_cap",
        "field": "amountMinor",
        "windowSeconds": 86400,
        "limit": "@const.DAILY_SPEND_CAP_MINOR_UNITS",
        "scopeVariable": "$buyerId"
      }
    ]
  }
}
```

Security rationale:

- Path ownership rules and `tenantTag` invariants prevent cross-seller listings and cross-buyer orders.
- The order rule reads the referenced active listing and requires exact price equality, preventing buyer-selected prices or fabricated seller/listing combinations.
- Orders are immutable and durable, so buyers cannot reduce historical spend by editing or deleting records.
- `rollingSum`, partitioned by `$buyerId`, enforces a rolling 24-hour cap using trusted platform creation time.
- `DAILY_SPEND_CAP_MINOR_UNITS` is a missing-value placeholder set to `0`, which fails closed by blocking positive-value orders. Replace it with the required cap expressed in the same fixed currency’s smallest unit as `priceMinor` and `amountMinor` before verification or deployment.