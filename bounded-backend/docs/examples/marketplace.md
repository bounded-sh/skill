# Marketplace: listings, orders, spend cap

"Sellers post listings only they can edit; buyers place immutable orders at the referenced listing's real price; each buyer can spend at most $5,000 per day."

## Policy

```json
{
  "sellers/$sellerId/listings/$listingId": {
    "description": "Items for sale. Publicly readable; only the seller writes under their own seller id.",
    "fields": { "seller": "String!", "title": "String", "priceUsd": "UInt", "active": "Bool" },
    "tier": "durable",
    "search": { "fields": ["title"] },
    "rules": {
      "read": "true",
      "create": "@user.id != null && $sellerId == @user.id && @newData.seller == @user.id",
      "update": "@user.id != null && $sellerId == @user.id && @newData.seller == @data.seller",
      "delete": "@user.id != null && $sellerId == @user.id"
    },
    "operationDetails": {
      "read": "Anyone, signed in or not, can browse and search listings.",
      "create": "A seller lists an item under their own seller id; the seller field must be their own identity.",
      "update": "Only the seller edits a listing (price, title, active flag). The seller field is readonly after create and must be preserved.",
      "delete": "Only the seller removes their listing."
    },
    "invariants": [
      { "type": "tenantTag", "name": "listing_seller", "field": "seller", "pathVariable": "$sellerId" }
    ]
  },
  "buyers/$buyerId/orders/$orderId": {
    "description": "Append-only order log. An order is immutable once placed; the daily spend cap is computed over this log.",
    "fields": { "buyer": "String!", "listingRef": "String!", "seller": "String!", "amountUsd": "UInt!" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null && $buyerId == @user.id",
      "create": "@user.id != null && $buyerId == @user.id && @newData.buyer == @user.id && get(/sellers/@newData.seller/listings/@newData.listingRef).active == true && @newData.amountUsd == get(/sellers/@newData.seller/listings/@newData.listingRef).priceUsd",
      "update": "false",
      "delete": "false"
    },
    "operationDetails": {
      "read": "A buyer reads only their own orders.",
      "create": "A buyer places an order under their own buyer id. The referenced listing must exist and be active, and amountUsd must equal that listing's priceUsd - the buyer cannot name their own price.",
      "update": "Never. Orders are immutable; verify surfaces this as an intentional-deny advisory, and deploy accepts it.",
      "delete": "Never. The spend history a cap sums over cannot be rewritten."
    },
    "invariants": [
      { "type": "tenantTag", "name": "order_buyer", "field": "buyer", "pathVariable": "$buyerId" },
      { "type": "rollingSum", "name": "daily_spend_cap",
        "field": "amountUsd", "windowSeconds": 86400, "limit": 5000,
        "scopeVariable": "$buyerId" }
    ]
  }
}
```

## Operations

1. **Seller creates a listing** at `sellers/<their id>/listings/<listingId>` with `seller` set to their own identity, a `priceUsd`, and `active: true`.
2. **Seller edits or deactivates** the listing (title, price, `active`). The write must preserve `seller` (readonly after create).
3. **Buyer places an order** at `buyers/<their id>/orders/<fresh id>` with `buyer` set to themselves, `seller` and `listingRef` naming a real listing, and `amountUsd` equal to that listing's current `priceUsd`. Each order is a new document with a fresh id.
4. **Nobody mutates orders.** There is no update or delete path; corrections are new orders (e.g. a refund flow would be its own server-authoritative collection).

## Why it holds

- **You can only sell as yourself.** `$sellerId == @user.id` in every listing write plus the `listing_seller` tenantTag means a listing can never sit under one seller's path while tagged with another, and nobody writes into someone else's shelf.
- **The seller of record cannot be rewritten.** `seller` is `String!` and the update rule pins `@newData.seller == @data.seller`, so a listing cannot be re-attributed after create.
- **The cap sums real prices, not buyer-supplied numbers.** If the buyer could write `amountUsd` freely, an order for a $500 listing with `amountUsd: 0` would hollow out the ceiling. The create rule cross-checks `get(/sellers/@newData.seller/listings/@newData.listingRef)`: the listing must be `active` and `amountUsd` must equal its `priceUsd`. Because the listing path segments are `@newData.seller` and `@newData.listingRef`, the order's `seller` is bound to a real listing too - a buyer cannot invent a seller, item, or price.
- **$5,000/day per buyer, proven.** The `daily_spend_cap` rollingSum (window 86400s, limit 5000, scoped on `$buyerId`) is discharged at deploy time; a create that would push a buyer's 24h total past the limit is rejected by the engine, not by app code.
- **The history behind the cap is append-only.** `update`/`delete` are `"false"` on orders, so past spend cannot be edited down to free up budget. The literal `"false"` rules are the intended deny idiom; `bounded verify` flags them as non-blocking intentional-deny advisories.
- **Orders leak to nobody.** `$buyerId == @user.id` on read keeps each buyer's purchase history private to them; listings alone are public.

If prices can change between placement and settlement, derive the order server-side in a function instead of trusting the read-then-write race - see the marketplace walkthrough in [policy-examples.md](../policy-examples.md#b--marketplace-listings-orders-spend-cap).

## Related

- [policy-examples.md](../policy-examples.md) - the full worked marketplace example this page condenses
- [invariants.md](../invariants.md) - `tenantTag` and `rollingSum` in depth
- [policy-generation-guide.md](../policy-generation-guide.md) - the method that produced this shape
