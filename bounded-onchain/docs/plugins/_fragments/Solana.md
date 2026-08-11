## Confinement contract

These primitives carry the raw-CPI security rules documented in [policy-primitives.md](../policy-primitives.md#solana): static executable targets only, every meta address must resolve to a concrete pubkey at build time, `signer: true` never grants a signer, and only the current user or an app PDA named via `signerName` may remain a CPI signer. A PDA `name` is the signing capability - do not replace it with the resolved address. `@Solana.createAccount` spending from the app escrow must be paired with caller funding in the same hook.
