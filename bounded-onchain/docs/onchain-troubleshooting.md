# Onchain troubleshooting

Real-network failure lookup for `"onchain": true` collections: what broke, why, and the fix. Budgets and proof-vs-network boundaries live in [policy-primitives.md](policy-primitives.md#real-network-resource-budget); custody semantics in [custody and PDAs](custody-and-pdas.md).

## Error to cause to fix

| Symptom | Likely cause | Fix |
|---|---|---|
| `403` on write | A `rules` predicate denied it. Onchain rules see only `@user.address`, path variables, onchain `get()`s, and fields. | Check auth and the exact rule; remember an omitted rule denies. |
| `409` + invariant name | The write would violate a declared invariant. | Fix state or the policy; this is the invariant working. |
| `FieldReadOnly` (Anchor error) | An update payload resent a `!` field - onchain updates are patches and resending the key is a field operation even with an unchanged value. | Omit every `!` field from update payloads. See [onchain.md](onchain.md#onchain-updates-are-patches). |
| Create/Update/Delete hook failed (Anchor error names like `CreateHookFailed`) | A `hooks.onchain` expression returned `false` or a plugin call errored; the whole transaction reverts. | Read the program log for the failing call; treat the live Anchor error name as authoritative ([onchain.md](onchain.md#diagnose-custom-errors-by-the-live-anchor-log-name)). |
| Write reverts with insufficient funds on a payout | The source pot (escrow or named PDA) holds less than the transfer amount - often another entity drained a shared pot. | Gate the rule on `@TokenPlugin.getBalance(<source>, <mint>) >= amount`; use per-entity named PDAs so pots cannot mix. |
| First transfer to a new recipient fails or costs extra | Recipient's ATA does not exist; creating it consumes rent paid by the transaction payer. | Leave the payer enough SOL; expect the first send to a fresh wallet to carry ATA rent. |
| Account creation fails on rent | `@AccountPlugin.createAccount` / `@Solana.createAccount` needs rent-exempt lamports from the payer. | Query `@Solana.rentExemption(space)` live and fund the exact amount; never reuse an old estimate. |
| Transaction too large / too many accounts | The builder fails before signing above 1,232 serialized bytes (4,096 on a cluster where transaction v1 is active, for a client that can sign v1) or 64 account locks; compute is simulated with a 20% margin up to 1.4M CU. | Split the batch; account-heavy hooks may need the platform lookup table ([onchain.md](onchain.md)). |
| Build-time refusal naming a character in a string argument | Plugin string arguments cannot contain `,` `{` `}` `[` `]` - the rendered call line would be re-parsed wrong. | Sanitize or encode the value (`@Bytes.utf8`), or store free text offchain. |
| Plugin call rejected at compile for the onchain target | An offchain-only construct (`@user.id`, `@origin.*`) in an onchain rule, an address atom where a string account id is required, or an unsupported composition such as `getAccountAddress(@contract.address)`. `@StringUtils.length` is not one of these - it compiles onchain and the program enforces it. | Use `@user.address`; pass string account ids; resolve the escrow with the program-ID string literal ([policy-primitives.md](policy-primitives.md#contractaddress-is-a-sentinel-not-the-escrow-address)). |
| Deploy refuses a function with `NEEDS-RUNTIME-V4` | The function's runtime is newer than the deployed program's recorded runtime version. | Check [solana-capability-status.md](solana-capability-status.md); do not ship that path until the runtime is live. |
| Write succeeds but the mirror shows nothing yet | Mirror ingestion is eventually consistent. | Poll the mirror for the exact expected postcondition; never treat an immediate read (or its absence) as proof. |
| `validate pre-built transaction: SOLANA_DEVNET_RPC_URL is required for pre-built transaction network "solana_devnet"` | The CLI submits onchain writes itself and has no RPC endpoint configured. The platform built the transaction correctly; submission never started. | Set `SOLANA_DEVNET_RPC_URL` (or `SOLANA_MAINNET_RPC_URL`) in the shell running `bounded`. See [CLI submission needs an explicit RPC endpoint](#cli-submission-needs-an-explicit-rpc-endpoint). |
| `Pre-built Solana transaction submission requires init({ rpcUrl }) for solana_devnet` in a web app | The browser twin of the CLI rule above: the SDK submits the pre-built transaction itself, and `init()` was called without a top-level `rpcUrl`. | Pass top-level `chain` + `rpcUrl` to `init()`; a nested `walletLogin.rpcUrl` is not a substitute. See [Browser/SDK submission needs an explicit RPC endpoint](#browsersdk-submission-needs-an-explicit-rpc-endpoint). |
| `The Solana wallet returned a different transaction than the one it was asked to sign` | The wallet changed what your write MEANS, not merely its bytes - guard instructions and index renumbering are accepted. The clause after the colon names what moved. | Only `it replaced the blockhash` is a retry. Everything else means the wallet rewrote the substance of the write: capture its build and report it. See [A wallet returned a different transaction](#a-wallet-returned-a-different-transaction). |
| `Transaction building failed: onchain account resolution failed (422): onchain account not found: <pubkey> (<role>)` | An account the write references does not exist on chain (a wrong mint derivation, a pool that was never created, an absent bonding curve, an unlisted NFT). This is YOUR data, not the platform: retrying can never help. | Fix the referenced account. The commonest cause is a mint-seed mismatch: Meteora pool mints use the legacy seed, so derive them with the 3-arg `@TokenPlugin.getTokenMintAddress(tokenId, name, symbol)`, never the 1-arg id-only form. See [Missing onchain accounts vs platform 502s](#missing-onchain-accounts-vs-platform-502s). |
| `Transaction building failed: onchain account resolution failed (502): ...` on a write that is neither a `403` nor a `422` | Bounded's platform-side account resolver could not resolve the accounts and plugin values the transaction needs (platform infrastructure or its RPC). The policy did not deny; the write was rejected fail-closed before anything signed or landed. | Do not rewrite a passing hook or change amounts/slippage. Confirm it is platform-side with a trivial named query, then retry and report. See [Platform resolver and onchain-query 502s](#platform-resolver-and-onchain-query-502s). |
| `onchain query failed (502)` on a named query (CLI shows `Error: 500 onchain query failed (502)`), even a plain `@TokenPlugin.getBalance` | Same platform-side failure surface for queries: Bounded's onchain query executor could not run the query simulation. | Same as the row above; it is not a bad query argument. See [Platform resolver and onchain-query 502s](#platform-resolver-and-onchain-query-502s). |
| `500` with `"code": "rule_evaluation_failed"` on a write, a read, or a subscription | The rule was REACHED and could not be EVALUATED - so no rule denied you and nothing was read or written. Usually a plugin call in the rule that the platform could not resolve. | Not a denial and not a retryable conflict. The cause is never in the response; read `bounded decisions --app-id <id>`, where the row is recorded with `decision: error` and the cause. See [A rule that could not be evaluated](#a-rule-that-could-not-be-evaluated). |
| Pump.fun launch dies inside `Create` with `Transfer: insufficient lamports` (`... 0, need 1461600` for the mint, or a shortfall under `IX: Create Metadata Accounts v3`) | The `createToken`/`createTokenV2` `creator` is ALSO the account Pump.fun's `Create` bills: mint rent (1,461,600 lamports), metadata rent (~5,616,720), then bonding-curve/ATA setup. With app custody (a named account id), that PDA pays, and the signing user's own wallet balance is irrelevant. | Fund the named creator account with the whole Create cost (~0.025 SOL) in the same hook, before `createToken`: `@AccountPlugin.createAccount(id) && @TokenPlugin.transfer(@user.address, id, @TokenPlugin.SOL, 25000000) && @PumpFunPlugin.createToken(..., id)`. See [token-launch example](examples/token-launch.md). |

## CLI submission needs an explicit RPC endpoint

On an onchain write the platform builds and returns a pre-built transaction.
The CLI signs it locally with your credential and submits it to Solana itself, so the CLI needs its own RPC endpoint, and it reads one only from the environment:

```sh
export SOLANA_DEVNET_RPC_URL="https://<your-devnet-endpoint>"    # solana_devnet apps
export SOLANA_MAINNET_RPC_URL="https://<your-mainnet-endpoint>"  # solana_mainnet apps
```

There is no `--rpc-url` flag, no config-file setting, and no fallback to a public Solana RPC.
That is deliberate: confirmation and simulation results are only as trustworthy as the endpoint returning them, so the endpoint has to be one you chose.
The check runs before signing, so an unset variable fails the write with `validate pre-built transaction: ...` and never reaches the network.

Set it in whatever shell runs `bounded`; it applies per shell, so add it to your shell profile if you want it to persist.
A public endpoint such as `https://api.devnet.solana.com` is enough to get a development write through, but it is rate-limited and is not a trusted source for the evidence described in [Confirmation behavior](#confirmation-behavior); use a dedicated provider endpoint for anything you intend to rely on.
Never echo, log, commit, or retain a secret RPC URL.

## Browser/SDK submission needs an explicit RPC endpoint

The browser twin of the CLI rule above, with the exact error:

```
Pre-built Solana transaction submission requires init({ rpcUrl }) for solana_devnet
```

On an onchain write from a web app the platform builds the transaction, and the SDK signs it with the user's wallet and submits it to Solana itself.
That submission endpoint comes only from `init()`, and it must be TOP-LEVEL:

```ts
await init({
  appId: "<appId>",
  chain: "solana_devnet",                        // the app's onchain network
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,   // e.g. "https://api.devnet.solana.com"
  walletLogin: true,                             // if the app offers wallet login
});
```

A nested `walletLogin.rpcUrl` configures wallet login only and does not enable submission; `walletLogin: true` supplies no submit RPC either.
The check runs before the wallet signs, so a misconfigured app fails the write without spending the user's signature.
That endpoint is also what keeps the transaction alive: the SDK reads a current blockhash from it and writes that onto the transaction immediately before the wallet is asked to approve, so the whole ~60-second blockhash lifetime belongs to your user rather than to the build that produced the transaction.
A pre-built transaction the platform already co-signed (a gas-sponsored write, or any plugin write that carries an attestation signature) is left exactly as it arrived, because that signature covers the blockhash too.
The trust rationale is the same as the CLI's: there is deliberately no bundled default endpoint, because confirmation and simulation results are only as trustworthy as the endpoint returning them.
A public endpoint gets a development write through but is rate-limited; use a dedicated provider endpoint for anything you rely on, and keep secret RPC URLs out of logs and commits.

## A wallet returned a different transaction

```
The Solana wallet returned a different transaction than the one it was asked to sign, so nothing was
returned: <what moved>. Try again.
```

This is the SDK refusing, not the platform and not your app.

A wallet is ALLOWED to change the transaction it signs, and good ones do.
Phantom injects Lighthouse guard instructions on mainnet so the transaction aborts if balances move in ways its simulation did not predict, and it raises the compute-unit limit to pay for them.
Adding instructions makes the transaction recompile, which renumbers every account index in it.
None of that changes what your write does, so the SDK accepts all of it.

What the SDK checks instead is that your write still MEANS the same thing: the blockhash, the set of accounts that must sign, and every instruction it sent - same program, same data, same accounts in the same roles, same order.
The clause after the colon names what broke that.

| Clause | What happened | What to do |
|---|---|---|
| `it replaced the blockhash` | The transaction's lifetime ran out before approval and the wallet swapped in a live one. | Retry the click. The SDK refreshes the blockhash immediately before each approval, so this should be rare; if it recurs, the endpoint in `init({ rpcUrl })` is lagging, or it is a gas-sponsored or plugin write whose blockhash the platform's own signature pins and the SDK cannot refresh. |
| `it added another call to a program this transaction already uses` | The wallet appended a second call to a program your write invokes. A second `set_documents` would apply your write twice, and increment operations are not idempotent. | Do not work around this. Capture the wallet's build and report it. |
| `one of the instructions it was asked to sign is missing or altered` | An instruction was dropped, reordered, repointed at another account, had its data changed, or had an account's role changed. | Same: capture and report. |
| `it changed which accounts must sign the transaction` / `it changed how many signatures the transaction requires` | The wallet altered who is on the hook for the transaction. | Same: capture and report. |
| `could not be read` / `could not be read back` | The message could not be parsed on one side, so nothing can be shown to have survived. It fails closed. | Same: capture and report. |

Only the first row is a retry.
Everything else means the wallet rewrote the substance of your write, and no amount of retrying will fix it.

## Missing onchain accounts vs platform 502s

The resolver distinguishes two failure classes on a write, and they demand opposite responses.

- `onchain account resolution failed (422): onchain account not found: <pubkey> (<role>)` is a DETERMINISTIC verdict about your data: the named account does not exist on chain.
  The `<role>` names what the account was supposed to be (for example the tokenMint passed to `swapInMeteoraVirtualPool`).
  Retrying cannot help; fix the derivation or the argument instead.
  The classic cause is deriving a Meteora pool mint with the 1-arg `@TokenPlugin.getTokenMintAddress(tokenId)` when `createMeteoraVirtualPool` always uses the legacy seed, so the correct derivation is the 3-arg `(tokenId, name, symbol)` form.
- `onchain account resolution failed (502): ...` is the platform-side class described in the next section.
  Retrying after the platform recovers is safe there.

On an older platform version that still reports every resolver failure as a 502, you can distinguish the two yourself: run an independent `getAccountInfo` on the account your write references (for example `solana account <pubkey> --url devnet`, or `connection.getAccountInfo(new PublicKey(...))`).
If the account does not exist, you are in the missing-account class regardless of the 502 copy, and retrying will not help.

## Platform resolver and onchain-query 502s

`Transaction building failed: onchain account resolution failed (502): ...` (on a write) and `onchain query failed (502)` (on a named query; the CLI prints `Error: 500 onchain query failed (502)`) are PLATFORM-side failures, not policy verdicts and not problems with your hook.

- A policy denial is a `403` and never carries the 502 text.
  A 502 means Bounded's account resolver or onchain query executor could not complete the resolution or simulation.
  When the failure happened while EVALUATING a rule (a plugin call the rule makes), you get the `500 rule_evaluation_failed` above instead, which says so directly - see [A rule that could not be evaluated](#a-rule-that-could-not-be-evaluated).
- Both surfaces share one platform resolver, so the cheap discriminator is a trivial named query that only reads a balance, for example `bounded data query --path <collection>/<id> --name <a plain @TokenPlugin.getBalance query>`.
  If that also returns the 502, the platform (or its RPC) is the problem: do not modify the failing hook, its amounts, or its slippage, and do not switch DEXes.
- The write was rejected fail-closed before signing: nothing landed, no fees were spent, and retrying after the platform recovers is safe.
- If the 502 persists, report it to Bounded with the app id and timestamp; there is no app-policy workaround.

## A rule that could not be evaluated

A rule has three possible outcomes, not two: it allows, it denies, or it could not be evaluated at all.

The third is reported as HTTP `500` with `"code": "rule_evaluation_failed"`, and it means specifically that a READ THE RULE NEEDED could not be made - a plugin's chain query, an RPC read, a price observation. The rule was reached, no verdict exists, and nothing was read or written.

A rule that throws on a particular document's own data is NOT this. `@data.n + 1 > 0` where that document's `n` is a string fails for that document and no other, every time, so it stays an ordinary fail-closed denial for that row and the rest of the collection reads normally. The distinction is deliberate: if one badly typed document made a rule "un-evaluable", anyone who could write that document could break every read of its collection.

Do not read it as either of the other two:

- It is NOT a denial. A denial is a `403` with `"code": "policy_denied"`. Looking for the rule that said no is wasted time; none did.
- It is NOT a conflict. A conflict is a `409` `mutation_conflict` with `"retryable": true`, raised when a write must be re-attempted against fresher state. `rule_evaluation_failed` carries no `retryable` flag: the platform is not claiming a retry will help, and not claiming it will not. A stubbed plugin call never clears; a provider having a bad minute does. Look at the cause before retrying in a loop.

The same outcome reaches every surface. A read answers the `500` rather than an empty `200` (which would be indistinguishable from the document not existing); a subscription receives an `error` frame on that subscription rather than a `data` frame reporting a removal that never happened.

The response names the operation and the path and NOTHING else - not at any disclosure level. The cause is whatever the evaluation threw, and a plugin's provider can throw a message carrying a credentialed endpoint or token, so it goes to the decision log instead, which is owner/collaborator-gated:

```sh
bounded decisions --app-id <appId>
```

Every occurrence is recorded there with `decision: "error"`, including on reads, and the cause is on the row's indented detail line.

## Confirmation behavior

A mutating receipt deliberately contains only `{"transactionId": "<signature>", "chain": "..."}`. Confirm independently: poll `getSignatureStatuses` until finalized, then fetch the transaction at finalized commitment and require `meta.err` to match expectations; a client preflight or simulation rejection is not proof of an onchain denial. The full evidence discipline (including denial verification) is in [policy-primitives.md](policy-primitives.md#verification-checklist).

## Environment differences

| Environment | What runs | Watch out |
|---|---|---|
| Poofnet / local platform | Offchain simulation of the same policy bytecode; onchain hooks simulate, no validator | Poofnet success proves logic, not funding, rent, transaction fit, or external programs. |
| Devnet | Real Solana; the deployed Bounded program (runtime version per [capability table](solana-capability-status.md)) | `@TokenPlugin.USDC` is mainnet-only - create an app-owned devnet mint. Jupiter (`@DeFiPlugin.swap`), Phoenix, and DFlow are absent on devnet (`NO-DEVNET-*` markers). The program-ID string literal used to resolve the escrow is deployment-specific. |
| Mainnet | Real value; mainnet permits are required and policy changes may need onchain authority permits | Never deploy or upgrade mainnet as an incidental step; rehearse on a local validator, then devnet. |

Graduation between them changes no policy source - the same collections compile per target - but every real-network budget above starts applying the moment a protocol is `realtime_devnet` or `realtime_mainnet`.
