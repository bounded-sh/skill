# Policy-native Solana primitives

Read this for custom program interaction, raw byte encoding, Solana account
reads, PDAs/ATAs, or cross-app document access from policy bytecode.

## Contents

- [Runtime capability gates](#status-first-compiler-support-is-not-deployment-support)
- [`@contract.address`](#contractaddress-is-a-sentinel-not-the-escrow-address)
- [`@Bytes`](#bytes)
- [Prediction-market arithmetic](#prediction-market-arithmetic)
- [`@Solana`](#solana)
- [Real-network budgets](#real-network-resource-budget)
- [Descriptor CPI](#descriptor-cpi-cpi)
- [Onchain staged document updates](#onchain-staged-document-updates)
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

## Prediction-market arithmetic

The pure constant-product helpers round output down directly.
Use the documented quotient as written:

```text
@PredictionMarketPlugin.getYesTokenOutAmm(amountIn, collateralReserve, yesSupply)
  = floor(amountIn * yesSupply / (collateralReserve + amountIn))

@PredictionMarketPlugin.getCollateralOutAmm(yesIn, collateralReserve, yesSupply)
  = floor(collateralReserve * yesIn / (yesSupply + yesIn))
```

Do not re-express either quote as an old reserve minus a separately floored new reserve.
That form rounds the trader's output up when the division has a remainder and can decrease the constant-product invariant by one unit or more.
For example, `getYesTokenOutAmm(100, 1000, 10000)` returns `909`, and `getCollateralOutAmm(1000, 1000, 10000)` returns `90`.
Keep all inputs non-negative integers and apply `@PredictionMarketPlugin.applyFee` to the resulting integer amount when a fee is required.
An exact zero trade input returns zero.
A positive trade whose floored output would be zero is rejected as too small.
As with every discovered Solana function, check the function's current support and verification states before presenting it as available on devnet.

## `@Solana`

Pure/read primitives include:

- `account(address)` -> `{ lamports, owner, executable, dataLen } | null`
- `lamports(address)`, `data(address, offset, length)`, and `slot`
- `pda(seeds, programId)`, `pdaBump(...)`, `ata(owner, mint)`
- `signerAccount(name)` and `rentExemption(space)`
- `systemProgram`, `tokenProgram`, `token2022Program`, `ataProgram`, `rent`, and `clock` are address constants.
  `@Solana.tokenProgram` is the classic SPL Token program and can be used as a compile-time account owner.

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

When `@Solana.createAccount` spends from the app escrow, do not expose a separate public "fund escrow" action.
That lets one caller deposit shared funds that another caller can consume.
Make the caller fund the exact current rent and create the account in one hook.
This complete policy creates a durable receipt document plus a named app PDA:

```json
{
  "auth": {
    "wallets": true
  },
  "acceptance/$runId/rawAccounts/$name": {
    "onchain": true,
    "tier": "durable",
    "fields": {
      "actor": "Address!",
      "space": "UInt!",
      "rentLamports": "UInt!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.actor == @user.address && @newData.space >= 8 && @newData.space <= 128 && @newData.rentLamports == @Solana.rentExemption(@newData.space)",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@TokenPlugin.transfer(@user.address, @contract.address, @TokenPlugin.SOL, @newData.rentLamports) && @Solana.createAccount($name, @newData.space, @Solana.tokenProgram)"
      }
    },
    "queries": {
      "rentForSpace": {
        "returnType": "UInt",
        "query": "@Solana.rentExemption(@data.space)"
      },
      "address": {
        "returnType": "Address",
        "query": "@Solana.signerAccount($name)"
      },
      "exists": {
        "returnType": "Bool",
        "query": "@Solana.account(@Solana.signerAccount($name)) != null"
      }
    }
  }
}
```

Use a wallet-authenticated named query to obtain the current rent, then write that exact value:

```sh
bounded --json --env staging data query \
  --app-id <app-id> \
  --path acceptance/<run-id>/rawAccounts/example \
  --name rentForSpace \
  --args '{"space":64}'

bounded --json --env staging data set \
  --app-id <app-id> \
  --path acceptance/<run-id>/rawAccounts/example \
  --data '{"actor":"<wallet-address>","space":64,"rentLamports":<exact-query-result>}'
```

Extract the rent from the query receipt's `.result` field and place that exact canonical integer in `rentLamports`.
Confirm the returned public signature before reading `acceptance/<run-id>/rawAccounts/example`.
Then run:

```sh
bounded --json --env staging data query \
  --app-id <app-id> \
  --path acceptance/<run-id>/rawAccounts/example \
  --name address \
  --args '{}'

bounded --json --env staging data query \
  --app-id <app-id> \
  --path acceptance/<run-id>/rawAccounts/example \
  --name exists \
  --args '{}'
```

Require `address.result` to decode as a Solana public key and `exists.result` to equal `true`.
Keep the equality in policy so a stale or forged client value fails before it can overfund or underfund the shared escrow.
Use `isPassthrough: true` only when the application deliberately does not need a durable Bounded document or mirror receipt for the action.

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

## Onchain staged document updates

`@DocumentPlugin.updateField(path, field, value)` is available to onchain policy bytecode even though `@DocumentPlugin.putDocument` is offchain-only.
The value may be any policy value, including numbers, booleans, strings, structured values, or `null`.
A `null` value deletes the named field.

Use `get(path)` for the document's pre-transaction state and `getAfter(path)` for its staged post-write state.
Both functions take exactly one policy path and return the document or `null`.
An onchain hook may sequence a pre-state read, one or more `updateField` calls, and a post-state read with `&&`.
Keep fields that the hook derives absent or null in the caller's create rule so a caller cannot forge proof fields.
This complete policy records a 7-to-12 transition:

```json
{
  "auth": {
    "wallets": true
  },
  "acceptance/$runId/counters/$counterId": {
    "onchain": true,
    "tier": "durable",
    "fields": {
      "owner": "Address!",
      "value": "UInt"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.owner == @user.address && $counterId == 'main'",
      "update": "false",
      "delete": "false"
    }
  },
  "acceptance/$runId/snapshots/$snapshotId": {
    "onchain": true,
    "tier": "durable",
    "fields": {
      "actor": "Address!",
      "nextValue": "UInt!",
      "before": "UInt?",
      "after": "UInt?"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.actor == @user.address && @newData.nextValue > 0 && @newData.before == null && @newData.after == null && get(/acceptance/$runId/counters/main).owner == @user.address && $snapshotId == 'proof'",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "onchain": {
        "create": "@DocumentPlugin.updateField(/acceptance/$runId/snapshots/$snapshotId, 'before', get(/acceptance/$runId/counters/main).value) && @DocumentPlugin.updateField(/acceptance/$runId/counters/main, 'value', @newData.nextValue) && @DocumentPlugin.updateField(/acceptance/$runId/snapshots/$snapshotId, 'after', getAfter(/acceptance/$runId/counters/main).value)"
      }
    }
  }
}
```

Choose a fresh run ID for every execution.
Create `acceptance/<run-id>/counters/main` with `{"owner":"<wallet-address>","value":7}` and confirm it.
Then create `acceptance/<run-id>/snapshots/proof` with only `{"actor":"<wallet-address>","nextValue":12}` and confirm it.
Poll the two mirrors separately.
Require the counter to retain its owner and reach `value: 12`.
Require the snapshot to contain the original actor and `nextValue`, plus hook-derived `before: 7` and `after: 12`.
The initial counter creation is one separately confirmed transaction.
Snapshot creation plus both staged `updateField` effects is one later Solana transaction.
After confirmation, poll the Bounded mirror for every affected document separately.
Local compilation or a successful immediate read does not establish live devnet support.
Check the individual `get`, `getAfter`, and `@DocumentPlugin.updateField` rows in the capability status before claiming the flow is live verified.

## Cross-app Documents (`@App`)

- `@App.get(appId, path)` reads the target app's onchain Document PDA.
- `@App.set(appId, path, data)` evaluates the **target** rule/schema and writes
  the target Document atomically onchain.
- Nested target rules may not perform further writes/CPI.
- Targets with enabled invariants currently reject `@App.set`; accepting them
  without folding target invariant state into the outer transaction would be a
  bypass.
- `@App.get` reads the target Document PDA directly during onchain execution.
  Solana accounts are world-readable, so this primitive does not enforce the target Bounded read rule and must not be used for confidential data.
- Authorization to poll the target through Bounded's mirror API is a separate acceptance prerequisite.
  Use `read: "true"` only for deliberately public fixture data, or authenticate the polling principal under the target app's normal read rule.

To prove this on Devnet, deploy a distinct target Bounded app instead of substituting the source app:

1. Give the target a create-only onchain path with the exact field schema the source writes.
2. Make the target create rule evaluate the current transaction user, including `@user.address`, the target path variables, and every source-binding field written into the document.
3. Keep target onchain hooks and invariants absent.
   The runtime must fail closed if either is present or if the target rule attempts another nested write.
4. Make the target mirror readable to the acceptance principal independently of `@App.get`.
   Treat every field stored in the onchain target Document as public.
5. Compute the current rent exemption for the target document's maximum serialized space.
   In the source action, atomically transfer enough SOL from the caller into the source app escrow and require the funded amount to cover that live rent result before calling `@App.set`.
6. Finalize the one source transaction, then independently poll the source mirror and the distinct target app mirror.
7. Require the distinct target mirror to match owner, source app ID, source run ID, and value exactly.
8. Execute a separate source-app Boolean named query using `@App.get(...) != null` and require it to observe that target Document.
   Do not use `@App.get(...).field` in policy expressions because the hosted verifier does not expose field access on this primitive.

Keep `@App.get` and `@App.set` unverified until one sanitized retained run proves all of those observations against the deployed source and target revisions.
A compiler tag, a same-app substitute, target deployment alone, or one immediate read is not cross-app support evidence.

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
- A client preflight or transaction simulation rejection is not proof of an onchain invariant denial.
  Configure a trusted Devnet RPC through `SOLANA_DEVNET_RPC_URL` before CLI submission.
  Never echo, log, commit, or retain a secret RPC URL.
  For headless wallet-keypair acceptance, the public path is `bounded --json --env staging data set --app-id <app-id> --path <path> --data '<json>' --skip-preflight`.
  The CLI uses its selected credential source, signs and submits, and emits only `{"transactionId":"<public-signature>","chain":"solana_devnet"}`.
  It never emits signed bytes.
  Poll `getSignatureStatuses` until the signature is finalized with an error and retain its public finalized slot.
  Treat the numeric custom error as necessary but insufficient whenever separate Anchor error enums can assign the same number.
  Fetch `getTransaction` at finalized commitment, require `meta.err` and slot to match the status evidence, and require the exact authoritative Anchor error name plus the expected runtime program's matching failure marker.
  Retain only public `meta.err` and the minimum sanitized log markers needed to identify that error.
  Derive the denied document PDA from the runtime program, app ID, and absolute document path.
  The document seed is `sha256(utf8("tarobase_document" + appId + absolutePath))`, passed as the sole seed to `findProgramAddressSync`.
  Starting only after denial finalization, sample both the Bounded mirror and `getAccountInfo` at least four times across a measured monotonic observation window.
  Every mirror sample must show the exact pre-denial collection unchanged and the forbidden path absent.
  Every account sample must use finalized commitment, set `minContextSlot` to at least the denial slot, and return `null` for the denied document PDA.
  Fail the acceptance run if a forbidden row or account appears in any later sample within that window.
  The canonical Devnet lab uses four observations spanning at least 12 measured monotonic seconds and rejects a declared duration that did not actually elapse.
  If the command or RPC fails before returning a public signature, the run has no landed-denial evidence and must remain unverified.
  For a Phantom UI, `setMany(writes, { shouldSubmitTx: false })` returns the signed transaction without submitting it.
  Serialize it only in memory, call the configured Devnet connection's `sendRawTransaction(bytes, { skipPreflight: true, maxRetries: 3 })`, discard every byte reference immediately, and retain only the public signature.
  Never print, log, commit, or persist the signed transaction.
- Before hashing or displaying a wallet-bound review, replace every signer placeholder with the connected wallet address.
  Reject unsafe JavaScript integer values, preserve validated safe integers exactly, and encode any bigint as its canonical base-10 string before deterministic serialization.
  Build a review envelope containing a schema version, environment, network, protocol, app ID, the complete public release marker, action ID, wallet address, the materialized logical operation, and the exact Bounded SDK request intent that execution will call.
  Hash the canonical UTF-8 envelope with SHA-256, freeze it deeply, and execute only the frozen operation whose independently recomputed SDK-intent digest still matches.
  Invalidate the review and require a new preflight and digest when the wallet, form, action, path, query arguments, write document, policy/release marker, or SDK request intent changes.
  The current public SDK does not expose the final unsigned Solana transaction message before Phantom approval, so do not claim that this review digest covers the recent blockhash, compute-budget instructions, resolved account metas, lookup tables, or instruction bytes.
  The SDK and runtime validate the built transaction intent separately after the frozen logical review.
  If a future builder API exposes exact unsigned message bytes before wallet approval, add a separately labeled message digest rather than silently changing the meaning of the logical review digest.
- A non-null named-query result is not sufficient.
  Validate the declared return type and the action predicate.
  A `UInt` result is either a nonnegative safe integer, a nonnegative bigint, or a canonical decimal string matching `^(0|[1-9][0-9]*)$`.
  A Pyth decimal is a string matching `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`; reject exponential notation, `NaN`, infinities, and JavaScript numeric coercion.
  Known-vector booleans must equal `true`, Solana addresses must decode as public keys, and an ORAO result must satisfy `0 <= roll < span`.
- Bind retained live acceptance to the public deployed release marker and independently read the Devnet Program and ProgramData accounts at the beginning and end of the run.
  For the canonical staging lab, fetch `https://bounded-solana-devnet-lab.staging.bounded.page/bounded-solana-lab-release.json` with caching disabled.
  Confirm that exact base URL from the `slugUrl` returned by `bounded domains list --app-id <app-id> --env staging --json` or the `url` retained from the exact successful staging site-deploy receipt.
  Require the JSON field itself instead of copying a human-rendered hostname.
  Do not use `bounded apps inspect` as a URL source; it proves only the active policy/runtime publication.
  Require exactly `schemaVersion`, `release`, `environment`, `protocol`, `commit`, `appId`, `artifactSha256`, `policy`, `targets`, and `program`.
  Require version 2, release `bounded-solana-devnet-lab`, environment `staging`, protocol `realtime_devnet`, the exact 40-hex source commit and 24-hex app ID, and a 64-hex artifact SHA-256.
  The nested `program` object contains exactly `network`, `programId`, `programDataAddress`, `authority`, `lastDeployedSlot`, `allocatedBytes`, `dumpSha256`, `commitment`, and `contextSlot`.
  Require finalized commitment and a nonnegative integer context slot.
  The canonical cross-app lab marker contains the exact active primary publication in `policy` and one distinct private target as `{ "role": "cross_app", "provenance": <active-publication> }` in `targets`.
  An active publication contains exactly `schemaVersion`, `appId`, `environment`, `protocol`, `sitePrivate`, `submittedPolicySha256`, `resolvedPolicySha256`, `runtimeArtifactSha256`, and `receipt`.
  Its receipt contains exactly `state`, `operationId`, `status`, `policyRevisionCount`, and `runtimePublicationRevision`.
  Require committed and available receipts, positive revision numbers, the intended policy hashes, and exact equality between marker publications and fresh authenticated `bounded apps inspect --json` results.
  Its artifact digest is SHA-256 over every built-site file except the marker, sorted by slash-normalized relative path, updating the hash with `<path-byte-length>:<path>:<file-byte-length>:` followed by the raw file bytes for each file.
  Read the Program and ProgramData accounts in one Devnet `getMultipleAccounts` request with base64 encoding and finalized commitment so both values share one response context slot.
  Derive ProgramData as the PDA whose seed is the program public key under `BPFLoaderUpgradeab1e11111111111111111111111`.
  Require a 36-byte executable Program account with loader state 2 and the derived ProgramData address.
  Require a non-executable loader-owned ProgramData account with state 3, little-endian deploy slot in bytes 4 through 11, authority option 1 in byte 12, and authority public key in bytes 13 through 44.
  `allocatedBytes` is the byte length after the 45-byte ProgramData header.
  `dumpSha256` is SHA-256 over exactly those post-header bytes.
  Record the independent observation as exactly `network`, `programId`, `programDataAddress`, `authority`, `deployedSlot`, `allocatedBytes`, `dumpSha256`, `commitment`, and `contextSlot`.
  Require the Program account, ProgramData PDA, owner, authority, deploy slot, allocation, and executable hash to match the marker.
  At the end of the run, require the marker and active app publications to remain identical, require all observed program facts except the context slot to remain identical, and require the ending finalized context slot not to move backward.
- Treat the full sanitized receipt as authoritative.
  Receipt schema version 2 includes `schemaVersion: 2`, `runId`, `network`, `checkedAt`, `commit`, `evidencePath`, `qualifying`, `appId`, `deployment`, `walletAddress`, `startingBalanceLamports`, `runner`, `summary`, and `scenarios`.
  Require those exact top-level keys, a canonical public Solana wallet address, a canonical decimal starting balance, the exact five terminal-status counts, and runner version 3 with `keySource: "global"`.
  Do not name the public runner field `credentialSource`; credential-like evidence keys are intentionally rejected by sanitization.
  `deployment.marker` is the exact public marker above.
  `deployment.program` is the exact independent finalized observation above.
  `deployment.apps` contains exactly the authenticated primary and cross-app target publications, which must equal the corresponding marker publications.
  Require `receipt.commit == deployment.marker.commit`, `receipt.appId == deployment.marker.appId`, and the retained artifact digest to equal `deployment.marker.artifactSha256`.
  Require every marker program field to equal the independently observed field, with `lastDeployedSlot == deployedSlot`.
  Each scenario includes its ID, terminal status and reason, commitment, exact covered actions, action evidence, public transaction signatures and explorer links, public addresses and explorer links, sanitized transactions, and postconditions.
  Every action-evidence entry contains exactly `actionId`, `contract`, `publicTransactionSignatures`, `transactions`, and `postconditions`.
  The contract pins the exact transaction outcomes, ordered postcondition kinds, minimum attempts, and minimum observation window for that action.
  Require a nonempty fresh postcondition delta, exact signature equality with the action's transaction records, exact contract satisfaction, and unique ownership for every scenario postcondition receipt.
  For a passing scenario, require the complete ordered aggregate postcondition list, including independent RPC account probes, to equal the flattened action-owned postcondition lists exactly.
  Reject duplicate action IDs, no-op actions, inherited postconditions, invented postconditions, contract drift, free-floating postconditions, or an aggregate scenario signature, transaction, or postcondition list that differs from the ordered action-owned records.
  The compact index projection keeps the top-level run identity, app and deployment evidence plus each scenario's ID, status, reason, commitment, exact actions, action evidence, public transaction signatures, explorer links, transactions, and postconditions.
  Validate that compact projection against its own exact schema.
  It intentionally omits the full receipt's wallet, starting balance, runner, summary, and scenario address arrays and must never be rehydrated into a partial object for full-receipt validation.
  Require authoritative `denialProof` only on the invariant-denial action's finalized failed transaction, reject that field everywhere else, and allow ordinary finalized failures in nonpassing scenarios to retain only their sanitized non-null error.
  Recompute that projection from the full receipt and compare it structurally before use.
  Hash the raw full receipt file with SHA-256 as a generator input.
  Load the scenario manifest with `git show <receipt.commit>:<scenario-manifest-path>`, require exact scenario IDs, action lists, function membership, and postcondition kinds, and never let a later scenario or function inherit an older pass.
- Do not accept a toast, simulation, returned signature, or immediate read as complete evidence.
