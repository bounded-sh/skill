# Solana devnet capability status

This is the canonical public classification of Bounded Solana functions for devnet.
It is a source-derived snapshot, not a claim that every discovered function works on a live cluster.
The catalog contains 149 individually classified functions.

## Read the three states independently

1. **Discovery** records where a function exists in compiler or runtime source.
2. **Devnet support** records whether the current external programs, accounts, and configuration can make the function usable on devnet.
3. **Live verification** records whether a retained devnet acceptance run confirmed the transaction and its expected Bounded postcondition.

Compiler discovery is never support evidence by itself.
Poofnet behavior, proof contracts, local validators, manifests, lookup-table entries, and source parity are also not live devnet evidence.
The current Bounded Solana program is recorded as runtime v3 on devnet.
Runtime v3 establishes the deployed bytecode and invariant/governance grammar level, but it does not prove that an external plugin is configured or usable.

No function in this snapshot has a published live acceptance receipt yet.
The current totals are 96 `unverified`, 34 `unsupported`, and 19 `blocked`.
A function moves to `supported` only after a retained live run confirms both its chain outcome and its expected Bounded mirror, query, reveal, account, or denied state.

## Constraint codes

| Code | Meaning |
|---|---|
| `LIVE-PENDING` | Source is present, but a retained devnet acceptance run is still required. |
| `LIVE-ORAO-PROOF` | ORAO request, fulfillment, reveal, and query still require retained live proof. |
| `LIVE-PYTH-PROOF` | The Pyth read still requires retained live proof with freshness enforcement. |
| `LIVE-SAFE-CPI-PROOF` | A descriptor-backed safe CPI still requires retained live proof. |
| `SAFE-TARGET-ONLY` | Generic invoke may be claimed only for an explicitly modeled safe program and account flow. |
| `LIVE-PUMP-PROOF` | Pump.fun or PumpSwap stays unverified until live proof exists. |
| `LIVE-TENSOR-PROOF` | Tensor stays unverified until live proof exists. |
| `LIVE-CROSS-APP-PROOF` | A distinct target fixture and source scenario are present, but the finalized source transaction, both mirrors, exact target-field match, and `@App.get` existence query still require retained live proof. |
| `NO-DEVNET-JUPITER` | Jupiter is unavailable on devnet. |
| `NO-DEVNET-PHOENIX` | Phoenix is unavailable on devnet. |
| `NO-DEVNET-DFLOW` | DFlow is unavailable on devnet. |
| `NO-DEVNET-KAMINO` | Kamino is unavailable on devnet. |
| `METEORA-CONFIG` | Meteora is blocked until an operator provisions a replacement config for the current Bounded program authority. |
| `OFFCHAIN-ONLY` | The compiler explicitly rejects this function in an onchain target. |
| `DISABLED` | The registry entry exists but is disabled. |

## Function inventory

| Function | Discovery | Devnet support | Live verification | Constraint |
|---|---|---|---|---|
| `@AccountPlugin.createAccount` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@AccountPlugin.getAccountAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@App.get` | extended runtime | unverified | source parity only | LIVE-CROSS-APP-PROOF |
| `@App.set` | extended runtime | unverified | source parity only | LIVE-CROSS-APP-PROOF |
| `@BondingCurvePlugin.getMarketCapInSol` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@BondingCurvePlugin.getMaxSolInProduct` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@BondingCurvePlugin.getMaxTokensInProduct` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@BondingCurvePlugin.getSolOutProduct` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@BondingCurvePlugin.getTokensInProduct` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@BondingCurvePlugin.getTokensOutProduct` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.anchorDiscriminator` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.bool` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.concat` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.i64` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.i64At` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.len` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.pubkey` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.pubkeyAt` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.raw` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.str` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u128` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u16` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u16At` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u32` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u32At` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u64` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u64At` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u8` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.u8At` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Bytes.utf8` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@CPI.kaminoBorrow` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoDeposit` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoInitObligation` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoInitUserMetadata` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoRefreshObligation` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoRefreshObligationDeposited` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoRefreshObligationEmpty` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoRefreshReserve` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoRepay` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.kaminoWithdraw` | descriptor CPI | unsupported | not run | NO-DEVNET-KAMINO |
| `@CPI.memoNote` | descriptor CPI | unverified | source parity only | LIVE-SAFE-CPI-PROOF |
| `@CPI.transferLamports` | descriptor CPI | unverified | source parity only | LIVE-SAFE-CPI-PROOF |
| `@DeFiPlugin.addCpAmmLiquidity` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.claimDammV2PoolFees` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.claimMeteoraPoolFees` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.closeCpAmmPosition` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.createCpAmmPosition` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.createMeteoraConfig` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.createMeteoraVirtualPool` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.createPool` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getClaimableCpAmmPositionFee` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getClaimableMeteoraPoolFees` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getCpAmmPoolAddress` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getCpAmmPositionNftMintAddress` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getDammV2PoolAddress` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getMeteoraSwapQuote` | legacy offchain-only | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getMeteoraVirtualPoolAddress` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.getSwapQuote` | legacy offchain-only | unsupported | not run | NO-DEVNET-JUPITER |
| `@DeFiPlugin.lockCpAmmPosition` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.removeCpAmmLiquidity` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.swap` | legacy runtime | unsupported | not run | NO-DEVNET-JUPITER |
| `@DeFiPlugin.swapInMeteoraVirtualPool` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DeFiPlugin.withdrawLeftover` | legacy runtime | blocked | not run | METEORA-CONFIG |
| `@DflowPlugin.getKycStatus` | legacy offchain-only | unsupported | not run | NO-DEVNET-DFLOW |
| `@DflowPlugin.openPredictionMarketOrder` | legacy runtime | unsupported | not run | NO-DEVNET-DFLOW |
| `@DocumentPlugin.putDocument` | legacy offchain-only | unsupported | not applicable | OFFCHAIN-ONLY |
| `@DocumentPlugin.updateField` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@MathPlugin.mulDivCeil` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@MathPlugin.mulDivFloor` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.burn` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.createCollection` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.getCollectionMintAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.getOwner` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.getTokenMintAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.getUpdateAuthority` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.mintNFT` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.transfer` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.updateCollectionRoyalties` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@NFTPlugin.updateRoyalties` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@OraclePlugin.getRandomNumber` | legacy runtime | unverified | source parity only | LIVE-ORAO-PROOF |
| `@OraclePlugin.getVRFAddress` | legacy runtime | unverified | source parity only | LIVE-ORAO-PROOF |
| `@OraclePlugin.requestRandomness` | legacy runtime | unverified | source parity only | LIVE-ORAO-PROOF |
| `@PhoenixPerpsPlugin.closePosition` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.depositFunds` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.emberDeposit` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.emberWithdraw` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.getCollateralBalance` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.getMarkPrice` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.getPortfolioValue` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.getPositionSize` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.getUnrealizedPnl` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.hasPosition` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.isRegistered` | legacy offchain-only | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.placeLong` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.placeShort` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.registerTrader` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.syncParentToChild` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.transferToCross` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.transferToIsolated` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PhoenixPerpsPlugin.withdrawFunds` | legacy runtime | unsupported | not run | NO-DEVNET-PHOENIX |
| `@PredictionMarketPlugin.applyFee` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getCollateralOutAmm` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getNoCollateralOutLsmr` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getNoTokensOutLsmr` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getYesCollateralOutLsmr` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getYesTokenOutAmm` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PredictionMarketPlugin.getYesTokensOutLsmr` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@PriceFeedPlugin.getPriceFeed` | legacy runtime | unverified | source parity only | LIVE-PYTH-PROOF |
| `@PumpFunPlugin.buyExactSolIn` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.collectCreatorFee` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.createFeeSharingConfig` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.createToken` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.createTokenV2` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.distributeCreatorFees` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.getBondingCurveProgress` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.getCreatorFee` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.pumpswapDeposit` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.pumpswapWithdraw` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.transferCreatorFeesToPump` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.updateShareholders` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@Solana.account` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.ata` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.createAccount` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.data` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.invoke` | extended runtime | unverified | source parity only | SAFE-TARGET-ONLY |
| `@Solana.invokeAttested` | extended disabled | unsupported | not applicable | DISABLED |
| `@Solana.lamports` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.pda` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.pdaBump` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.rentExemption` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.signerAccount` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@Solana.slot` | extended runtime | unverified | source parity only | LIVE-PENDING |
| `@StringUtils.length` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TensorPlugin.buyNft` | legacy runtime | unverified | source parity only | LIVE-TENSOR-PROOF |
| `@TensorPlugin.listNft` | legacy runtime | unverified | source parity only | LIVE-TENSOR-PROOF |
| `@TokenPlugin.burn` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.createToken` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.createToken2022` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.getBalance` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.getDecimals` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.getSupply` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.getTokenMintAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.getWithdrawWithheldAuthority` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.mint` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.transfer` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.transferWholeTokens` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@TokenPlugin.withdrawWithheldTokens` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `get` | core legacy | unverified | source parity only | LIVE-PENDING |
| `getAfter` | core legacy | unverified | source parity only | LIVE-PENDING |

## Built-in values and devnet mint rule

`@TokenPlugin.SOL` is a source-defined native token alias, but its complete lab flow remains unverified in this snapshot.
`@TokenPlugin.USDC` is mainnet-only and is unsupported for TokenPlugin operations on devnet.
Do not confuse that constant with the separate Crossmint staging test-stablecoin payment rail.
Devnet token acceptance must create and use an app-owned classic SPL or Token-2022 mint.
`@TokenPlugin.EURC` has no published devnet acceptance receipt and must remain unverified.

## Read-query contracts

`@PriceFeedPlugin.getPriceFeed` returns a decimal `String` from the deployed runtime.
Do not declare it as `Float` or document it as a JavaScript number.
It remains unverified on devnet until a retained Pyth read proves the string value and freshness behavior.
Named-query `queryArgs` populate staged `@newData` for the query expression.
Current chain-backed named queries must be declared on an `onchain: true` path.
The current executor does not activate standalone chain execution for an `onchain: false` path.
Actual chain-query execution requires an authenticated `userAddress` even when the path read rule is public.

## Acceptance contract

Every live acceptance run must have a unique run ID.
Browsing the catalog, validating forms, and preflighting must work without a wallet.
That wallet-free requirement does not apply to current live chain named-query execution, which requires an authenticated `userAddress`.
Submission may use the funded global Bounded CLI keypair for automation or Phantom for the manual browser check.
After submission, confirm the public devnet transaction at the required commitment.
Then poll with bounded backoff for the exact expected Bounded mirror, query, reveal, account, or denied state.
A toast, a returned signature, simulation success, or one immediate read is not acceptance evidence.
Give every declared action its own evidence contract and receipt.
A write action must own its exact finalized transaction records and postconditions, while a read action must own a new query or read observation produced during that action.
For a passing scenario, require every postcondition, including independent RPC account probes, to belong to exactly one action and require the aggregate list to equal the ordered action-owned lists.
Reject no-op actions, free-floating or reused evidence, and any mismatch between the scenario signature, transaction, or postcondition lists and the action-owned records.
Store only sanitized receipts containing public transaction signatures, public explorer links, run metadata, and postcondition results.
Never store private keys, credentials, secret RPC URLs, access tokens, or signed transaction bytes.

## Updating this snapshot

A Solana compiler, runtime, manifest, descriptor, deployment, or external configuration change must update this table and its corresponding acceptance scenario in the same change.
Do not promote a row from `unverified`, `blocked`, or `unsupported` without retained evidence that matches the deployed revision.
