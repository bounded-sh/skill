<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@Solana`

Extended Solana primitives: account reads, PDAs/ATAs, named signers, raw invoke.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Confinement contract

These primitives carry the raw-CPI security rules documented in [policy-primitives.md](../policy-primitives.md#solana): static executable targets only, every meta address must resolve to a concrete pubkey at build time, `signer: true` never grants a signer, and only the current user or an app PDA named via `signerName` may remain a CPI signer. A PDA `name` is the signing capability - do not replace it with the resolved address. `@Solana.createAccount` spending from the app escrow must be paired with caller funding in the same hook.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `Solana.createAccount`

```
@Solana.createAccount(name, space, ownerProgramId) - Creates the app-scoped named PDA (Bounded_pda(appId, name)) as a fresh account with `space` bytes owned by ownerProgramId; rent-exempt minimum is funded by the app escrow.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `name` | string | yes | no | - | The app-scoped account name; the created account is Bounded_pda(appId, name), also addressable via @Solana.signerAccount(name). |
| `space` | number | yes | no | - | The account data size in bytes (rent-exempt minimum computed on-chain via the Rent sysvar; see @Solana.rentExemption for budgeting). |
| `ownerProgramId` | string | yes | no | - | The executable program that will own the account. Must be a literal or @Solana well-known program constant. |

### `Solana.invoke`

```
@Solana.invoke(programId, metas, data) - Generic CPI to an arbitrary executable program. metas is an array of {address, writable?, signer?, signerName?} objects in callee order; signer:true is allowed only for the current user and signerName elevates only app-derived PDAs. data is Bytes built on-chain via @Bytes.*. programId must be a literal or @Solana well-known constant; Bounded, loaders, and signature precompiles are denied.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: SAFE-TARGET-ONLY.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `programId` | string | yes | no | - | The executable target. Must be an address literal or @Solana well-known program constant; Bounded, loaders, and signature precompiles are denied. |
| `metas` | array | yes | no | - | Account metas in exact callee order. signer:true may name only the current user; signerName ('@escrow' or a named app account) elevates only that app's recomputed PDA. |
| `data` | bytes | yes | no | - | Instruction data as Bytes, built on-chain via @Bytes.* (e.g. @Bytes.concat(@Bytes.anchorDiscriminator('global','increment'), @Bytes.u64(@newData.amount))). |

## Read-only

### `Solana.account`

```
@Solana.account(addr) - Returns {lamports, owner, executable, dataLen} for the account, or null if the account is absent/empty (composes with the `!= null` idiom).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `object`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `addr` | string | yes | no | - | The account address to read |

### `Solana.ata`

```
@Solana.ata(owner, mint) - Returns the associated token account address for owner + mint.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `owner` | string | yes | no | - | The token account owner address |
| `mint` | string | yes | no | - | The token mint address |

### `Solana.data`

```
@Solana.data(addr, offset, len) - Returns a raw slice of the account's data as Bytes; errors if the slice is out of range. Combine with @Bytes.u64At/pubkeyAt/... to read any field of any account whose layout you know.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `addr` | string | yes | no | - | The account address to read data from |
| `offset` | number | yes | no | - | Byte offset into the account data |
| `len` | number | yes | no | - | Number of bytes to read |

### `Solana.lamports`

```
@Solana.lamports(addr) - Returns the account's lamport balance (0 if the account is missing).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `addr` | string | yes | no | - | The account address to read the lamport balance of |

### `Solana.pda`

```
@Solana.pda(seedsArray, programId) - find_program_address over the seeds for programId. Seed elements: string (utf8, max 32 bytes), address (32 bytes), bytes (raw, max 32), non-negative number (8-byte LE u64); max 16 seeds.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `seedsArray` | array | yes | no | - | Array of seeds (string\|address\|bytes\|non-negative number), max 16; string seeds are utf8-encoded (max 32 bytes), numbers encode as 8-byte LE u64. |
| `programId` | string | yes | no | - | The program id to derive the PDA for |

### `Solana.pdaBump`

```
@Solana.pdaBump(seedsArray, programId) - Returns the bump of the same derivation as @Solana.pda(seedsArray, programId).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `seedsArray` | array | yes | no | - | Array of seeds (string\|address\|bytes\|non-negative number), max 16 - identical encoding rules to @Solana.pda. |
| `programId` | string | yes | no | - | The program id to derive the PDA bump for |

### `Solana.rentExemption`

```
@Solana.rentExemption(space) - Returns the rent-exempt minimum lamports for an account with `space` data bytes (useful for budgeting checks before @Solana.createAccount).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `space` | number | yes | no | - | The account data size in bytes |

### `Solana.signerAccount`

```
@Solana.signerAccount(name) - Returns the app-scoped named PDA (Bounded_pda(appId, name)); usable as a signerName-elevated meta in @Solana.invoke and as the account created by @Solana.createAccount.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `name` | string | yes | no | - | The app-scoped account name |

## Built-in values

| Name | Meaning |
|---|---|
| `@Solana.ataProgram` | [object Object] |
| `@Solana.clock` | [object Object] |
| `@Solana.rent` | [object Object] |
| `@Solana.slot` | The current Clock sysvar slot (runtime read, compiles to a zero-arg extended call) |
| `@Solana.systemProgram` | [object Object] |
| `@Solana.token2022Program` | [object Object] |
| `@Solana.tokenProgram` | [object Object] |
