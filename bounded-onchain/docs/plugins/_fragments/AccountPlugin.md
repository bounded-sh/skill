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
