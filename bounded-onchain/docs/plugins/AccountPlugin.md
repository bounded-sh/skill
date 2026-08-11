<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@AccountPlugin`

Named app PDAs (per-entity escrow/vault accounts) - create them and read their addresses.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Custody in one paragraph

`createAccount(id)` gives the app its own program-signed Solana account (a named PDA) per id. Any documented plugin `source`/`owner`/destination argument that receives a non-pubkey string resolves to that same PDA, and the Bounded program signs for it. This is the third custody model next to user wallets and the shared `@contract.address` escrow; use it whenever separate pots of funds must not share a balance. Full model: [custody and PDAs](../custody-and-pdas.md).

## Rules that prevent real bugs

- `createAccount` is **idempotent**: calling it again for an existing id succeeds (and tops up rent if needed). The safe idiom is to prepend it to any hook that first touches the account, atomically with the funding move:

  ```json
  "hooks": { "onchain": {
    "create": "@AccountPlugin.createAccount($marketId) && @TokenPlugin.transfer(@user.address, $marketId, @TokenPlugin.SOL, @newData.amount)"
  } }
  ```

- **Account ids must not parse as a Solana pubkey.** The on-chain handler rejects pubkey-shaped ids, and in other plugins' arguments a pubkey-shaped string silently becomes a plain wallet (branch 2 of the resolver) instead of a named PDA. Never feed wallet addresses or address-typed fields in as ids.
- **The id namespace is app-global.** Two collections that both use a bare `$id` path variable can alias the same PDA and silently pool funds. Prefix per collection (for example a `defs` constant plus the path variable) or make ids globally unique by construction.
- **Never pass `getAccountAddress(...)` where a signing source is expected.** The validator rejects it statically in signer-position arguments, and the resolved base58 address could not be signed for anyway - the id string itself is the signing capability. The resolved address is fine as a destination, in rules (`@AccountPlugin.getAccountAddress($vaultId) == @data.owner`), and in named queries.
- The server-driven reveal write path (used for randomness reveals) executes with no user context and cannot call `createAccount`; create the account in a normal user-initiated write first.
- To expose the shared app escrow address itself, follow the program-ID string-literal query in [policy-primitives.md](../policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address); `getAccountAddress(@contract.address)` is rejected.

## Transactional

Callable only from `hooks.onchain` on `"onchain": true` collections (exceptions noted per function). A `false` return or thrown error aborts the entire Solana write.

### `AccountPlugin.createAccount`

```
@AccountPlugin.createAccount(accountId)
```

- Callable from: `hooks.onchain` on an `"onchain": true` collection
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `accountId` | string | yes | no | - | The id of the account to create. This should be a unique string within your entire application. |

## Read-only

### `AccountPlugin.getAccountAddress`

```
@AccountPlugin.getAccountAddress(accountId)
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING; DEVNET-ESCROW-SENTINEL.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `accountId` | string | yes | no | account id (named PDA) | The id of the account to get the address of. Must be a string account id (the same unique string you passed to createAccount). Do not pass @contract.address here - it is an on-chain address, not a string, and the on-chain interpreter rejects it. |
