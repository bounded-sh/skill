# Policy-native Solana primitives

Read this for custom program interaction, raw byte encoding, Solana account
reads, PDAs/ATAs, or cross-app document access from policy bytecode.

## Contents

- [Runtime capability gates](#status-first-compiler-support-is-not-deployment-support)
- [`@contract.address`](#contractaddress-is-a-sentinel-not-the-escrow-address)
- [`@Bytes`](#bytes)
- [`@Solana`](#solana)
- [Real-network budgets](#real-network-resource-budget)
- [Descriptor CPI](#descriptor-cpi-cpi)
- [Cross-app Documents](#cross-app-documents-app)
- [Poofnet/offchain parity](#poofnet-and-offchain-parity)
- [Policy updates](#invariant-and-policy-updates)
- [Verification](#verification-checklist)

## Status first: compiler support is not deployment support

These primitives are the **runtime-v2 source surface**; runtime v3 adds opt-in
policy/immutable upgrade governance without changing their wire tags. Both are
additive to the legacy bytecode and instruction ABI, but no agent may assume a
deployed Solana program supports them merely because the local compiler does.

- Treat function discovery, deployed-runtime support, and live-network verification as separate states.
- The current Bounded program is recorded as runtime v3 on devnet.
  That establishes its runtime grammar level, not external program or account availability.
- Check every function in [solana-capability-status.md](solana-capability-status.md) before using it.
- Resolve the deployed program/runtime capability before compiling.
- Runtime-v1 is the default for known deployed devnet/mainnet program ids unless
  the capability registry explicitly says otherwise.
- Reject runtime-v2 metadata/opcodes before transaction construction on v1.
- Reject governance enrollment and governed-update construction below v3.
- Never deploy or upgrade mainnet as an incidental step. Rehearse captured
  legacy accounts on a local validator/Surfpool, then devnet.

The compatibility contract freezes legacy instruction entrypoints, opcode and
error discriminants, invariant encodings, and `setDocumentsV2` wire bytes.

## Surface map

| Namespace | Use | Important boundary |
|---|---|---|
| `@Bytes.*` | Build/read Borsh-style little-endian bytes, UTF-8, pubkeys, Anchor discriminators, concatenation | 10 KiB allocation cap per execution; reads are bounds checked |
| `@Solana.*` | Account/lamport/data/slot reads, PDA/ATA derivation, named signer accounts, generic CPI, named account creation | CPI/owner targets are compile-time literals or address-valued `@Solana` constants |
| `@CPI.*` | Descriptor-driven CPI whose target, account schema, and instruction data are policy/deploy bound | Prefer this for attested/offchain-built instruction data |
| `@App.*` | Read or update another Bounded app's Document account | Target policy/schema must authorize writes; invariant-bearing targets currently fail closed |

Extended calls use a reserved u16 tag encoding. Unknown shared or offchain-only
tags must error; returning `null` for an unknown tag can make Poofnet accept a
path that Solana rejects.

## `@contract.address` is a sentinel, not the escrow address

In Solana policy bytecode, `@contract.address` evaluates to the deployed Bounded Solana program ID.
It is an internal sentinel that supported built-in plugin handlers recognize when their manifest documents an app-escrow source or authority.
Those handlers replace the sentinel with the current app's escrow PDA and apply the plugin's signer contract.
The value itself is not the escrow PDA.

- A direct policy query whose expression is `@contract.address` returns the Bounded program ID.
- Use `@AccountPlugin.getAccountAddress(@contract.address)` when a policy expression, query, UI, or account meta needs the concrete app escrow address.
- Only pass the sentinel to a plugin function whose manifest explicitly documents `@contract.address`, and still check that function's network support state.
- Every `@Solana.invoke` meta address must resolve to a concrete base58 public key when the transaction is built.
  Raw CPI does not apply built-in plugin source resolution, so `address: @contract.address` names the Bounded program account rather than the app escrow.
  Resolve the escrow with an `@AccountPlugin.getAccountAddress(@contract.address)` query or preflight, then place that returned public key in a concrete `Address` field or policy-bound value used by the raw meta.
- Address resolution does not grant signing authority.
  The `signer` and `signerName` confinement rules below still apply.

For example, expose the concrete escrow address rather than the sentinel:

```json
"queries": {
  "escrowAddress": {
    "returnType": "Address",
    "query": "@AccountPlugin.getAccountAddress(@contract.address)"
  }
}
```

## `@Bytes`

Encoders: `u8`, `u16`, `u32`, `u64`, `u128`, `i64`, `bool`, `pubkey`, `str`
(Borsh length + UTF-8), `utf8` (bare), `raw` (hex), `concat`, and
`anchorDiscriminator(namespace, name)`.

Readers: `len`, `u8At`, `u16At`, `u32At`, `u64At`, `i64At`, and `pubkeyAt`.
All numeric encoding is little-endian and range checked.

```json
"create": "@Solana.invoke(@Solana.systemProgram, [{ address: @user.address, writable: true, signer: true }, { address: @newData.to, writable: true }], @Bytes.concat(@Bytes.u32(2), @Bytes.u64(@newData.lamports)))"
```

The example illustrates byte construction; use a verified descriptor/built-in
plugin when one exists because it carries a narrower account contract.

## `@Solana`

Pure/read primitives include:

- `account(address)` -> `{ lamports, owner, executable, dataLen } | null`
- `lamports(address)`, `data(address, offset, length)`, and `slot`
- `pda(seeds, programId)`, `pdaBump(...)`, `ata(owner, mint)`
- `signerAccount(name)` and `rentExemption(space)`

Mutations include `invoke(programId, metas, data)` and
`createAccount(name, space, ownerProgramId)`.

Security rules:

- Program/owner targets must be static and executable. The Bounded program and
  BPF/native loaders are denied targets.
- Every raw meta address must resolve to a concrete public key during transaction construction.
  Resolve the app escrow with `@AccountPlugin.getAccountAddress(@contract.address)`, then use the returned address through a concrete field or policy-bound value instead of placing the sentinel in a raw meta.
- `signer: true` never grants a signer. Only the current transaction user, or a
  recomputed app PDA named by `signerName`, may remain a CPI signer.
- Sponsor and attestation accounts are always demoted at foreign CPI boundaries.
- A PDA `name` is the signing capability. Do not replace it with the resolved
  base58 address when a source argument expects Bounded to sign.
- Each seed is at most 32 bytes and a PDA uses at most 16 seeds. Numeric seeds
  are non-negative u64 little-endian.
- Real account/ATA creation consumes rent. Poofnet funding does not prove the
  same wallet has sufficient SOL on devnet/mainnet.

`@Solana.invokeAttested` is reserved and disabled until its client instruction
builder is complete. Use descriptor `@CPI.*` for attested instruction bytes.

## Real-network resource budget

Poofnet proves logic, not real-network funding or transaction fit:

- Account creation/reallocation and a recipient's first token account consume
  rent. Query the current rent exemption; do not preserve an old SOL estimate.
- A token transfer may need to create the recipient's ATA. Test the generated
  transaction to identify the actual payer and leave that signer enough SOL.
- Use `isPassthrough: true` for an action that needs an onchain hook/CPI but no
  durable Document. It avoids Document storage, not transaction/CPI fees.
- Keep the logical PDA name when Bounded must sign; use the derived address for
  display and readonly lookup. Never hardcode a Poofnet-derived address.
- Batch against transaction bytes, account metas, compute, stack, and heap. The
  builder fails before signing above 1,232 serialized bytes or 64 account locks
  (the current mainnet/devnet limit). It simulates compute, adds a 20% margin up
  to 1.4M CU, and requests a 160 KiB heap frame; Poofnet success does not prove
  those real-network budgets fit.
- Verify close/refund destinations from the generated accounts and deployed
  program version. Do not inherit payer/refund assumptions from old templates.

## Descriptor CPI (`@CPI`)

Descriptor CPI and `@Solana.invoke` are complementary:

- Use `@CPI.*` when a deployment descriptor should bind the program id,
  instruction builder, account order/permissions, and attested data.
- Use `@Solana.invoke` only when policy bytecode can safely build the complete
  instruction data and account metas itself.

Account resolution must reject descriptor drift. Attested bytes must be nonempty,
the target must be executable, and signer confinement still applies.

On current devnet, `@CPI.memoNote` and `@CPI.transferLamports` are source-present but remain unverified pending retained live proof.
All ten Kamino descriptors are unsupported because Kamino is unavailable on devnet.
Do not describe the generic CPI tag or descriptor registry as proof that a particular descriptor is usable.

## Cross-app Documents (`@App`)

- `@App.get(appId, path)` reads the target app's onchain Document PDA.
- `@App.set(appId, path, data)` evaluates the **target** rule/schema and writes
  the target Document atomically onchain.
- Nested target rules may not perform further writes/CPI.
- Targets with enabled invariants currently reject `@App.set`; accepting them
  without folding target invariant state into the outer transaction would be a
  bypass.
- Query contexts must not expose cross-app data unless target read authorization
  can be evaluated. Missing authorization machinery fails closed.

## Poofnet and offchain parity

Parity is a release gate, not a best-effort convenience:

1. Pure functions produce the same value and error shape in both runtimes.
2. Current chain-backed named queries must be declared on an `onchain: true` path.
   The executor does not currently activate standalone chain execution for an `onchain: false` path.
   Offchain-only plugin reads therefore have no working chain-query placement until the runtime is fixed.
   Actual chain-query execution also requires an authenticated `userAddress`, even when the read rule is public.
3. Onchain Documents are readable through the offchain mirror/read-through path.
4. A mutating primitive succeeds on Poofnet only after a deterministic model,
   target-aware host handler, or explicit policy-test mock applies its effect.
5. Arbitrary foreign CPI cannot be simulated generically. Without a model/mock,
   it fails closed rather than returning validation-only `true`.

For mirror guarantees and the Helius ingestion release gate, see
[onchain.md](onchain.md#mirror-completeness).

## Invariant and policy updates

- In wallet mode, offchain-only edits do not require an onchain authority permit;
  adding, changing, or removing any onchain collection does. Removal of the last
  onchain collection still requires the transaction.
- Runtime-v3 policy mode binds the complete final onchain path state to a
  controller-authorized manifest; immutable mode rejects all policy changes.
  The chain governance PDA, not the policy declaration, is authoritative. See
  [onchain.md](onchain.md#policy-upgrade-governance-runtime-v3).
- Deploy responses can include invariant-change warnings for lowered rolling
  caps, window/scope changes, resets, and added/removed/rekeyed conservation.
- `rollingSum.resetAtMs` excludes older offchain history. It must be a
  nonnegative epoch-millisecond integer and is rejected with
  `onchain: "onchainSupported"` until Solana implements the same boundary.
- Removing a materialized/sharded conserve declaration discards its stored
  baseline. Re-adding it derives a new baseline from live documents.

## Verification checklist

Before enabling a new primitive or runtime version:

- Add or update its individual row in [solana-capability-status.md](solana-capability-status.md).
- Pin compiler/offchain/Rust tag parity and legacy wire fixtures.
- Typecheck sol-layer, data-layer, and realtime packages.
- Run compiler, account-extractor, offchain differential, realtime detector,
  Rust unit, and formal-model suites.
- Run actual Kani proofs for signer confinement, cross-app fail-closed gates,
  and tag separation; unit examples alone are not symbolic proof.
- Measure program binary, compute, stack, heap, account-meta, and transaction
  size budgets.
- Exercise create/update/delete, readonly calls from offchain policies, replay,
  stale delivery, mirror subscription, and rollback on local validator/Surfpool.
- On devnet, assign a run ID, confirm the public transaction, and then poll the exact expected Bounded postcondition.
- Do not accept a toast, simulation, returned signature, or immediate read as complete evidence.
