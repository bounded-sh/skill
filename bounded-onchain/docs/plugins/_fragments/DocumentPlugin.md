## Placement

`updateField` is the one mutating plugin call legal in both hook planes: offchain hooks on any collection, and onchain bytecode following the [staged document update contract](../policy-primitives.md#onchain-staged-document-updates) (`get()` pre-state, staged writes, `getAfter()` post-state). Offchain hooks admit only DocumentPlugin mutations (plus StringUtils reads); every other plugin is onchain-hook-only. `putDocument` is offchain-only and its data argument must be an object literal (`{ total: 99 }`), never a JSON string. Field names must be quoted string literals.
