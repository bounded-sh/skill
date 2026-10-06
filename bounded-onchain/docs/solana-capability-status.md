# Solana devnet capability status

**Scope: devnet only.**
The Bounded Solana program is live on mainnet-beta as well, with runtime versions recorded separately for each cluster, but this table classifies devnet alone.
Mainnet capability is **not** established here: an external protocol being usable on devnet says nothing about its mainnet deployment or configuration, and vice versa.
Do not read a devnet row as a mainnet guarantee.

This is the canonical public classification of Bounded Solana functions for devnet.
It is a source-derived snapshot, not a claim that every discovered function works on a live cluster.
The catalog contains 165 individually classified functions.

## Read the three states independently

1. **Discovery** records where a function exists in compiler or runtime source.
2. **Devnet support** records whether the current external programs, accounts, and configuration can make the function usable on devnet.
3. **Live verification** records whether a retained devnet acceptance run confirmed the transaction and its expected Bounded postcondition.

Compiler discovery is never support evidence by itself.
Poofnet behavior, proof contracts, local validators, manifests, lookup-table entries, and source parity are also not live devnet evidence.
The Bounded Solana program is recorded as **runtime v9 on devnet** (2026-10-06, slot 508118456) and **runtime v8 on mainnet-beta** (2026-09-29, slot 451516304).
Legacy rows were classified against the runtime-v4 minimum; both clusters also meet the `NEEDS-RUNTIME-V6` and `NEEDS-RUNTIME-V7` requirements.
Both programs meet the `NEEDS-RUNTIME-V8` scaled-price requirement.
Only the programs have been upgraded for this API; the matching hosted worker, query, and compiler services, venue policy, and frontend rollout remain pending.
A program runtime version establishes the deployed bytecode and invariant/governance grammar level, but it does not prove that an external plugin is configured or that a hosted app can use it.

No function in this snapshot has a published live acceptance receipt yet.
The current totals are 133 `unverified`, 32 `unsupported`, and 0 `blocked`.
A function moves to `supported` only after a retained live run confirms both its chain outcome and its expected Bounded mirror, query, reveal, account, or denied state.

## Constraint codes

| Code | Meaning |
|---|---|
| `LIVE-PENDING` | Source is present, but a retained devnet acceptance run is still required. |
| `LIVE-ORAO-PROOF` | ORAO request, fulfillment, reveal, and query still require retained live proof. |
| `LIVE-PYTH-PROOF` | The Pyth read still requires retained live proof with freshness enforcement. |
| `NEEDS-RUNTIME-V8` | The scaled integer USD price function needs runtime v8 to execute in the Solana program. Devnet and mainnet-beta meet this requirement as of 2026-09-29 (slots 505377312 and 451516304 respectively). Program readiness alone does not establish hosted service availability or app acceptance. |
| `LIVE-SAFE-CPI-PROOF` | A descriptor-backed safe CPI still requires retained live proof. |
| `SAFE-TARGET-ONLY` | Generic invoke may be claimed only for an explicitly modeled safe program and account flow. |
| `LIVE-PUMP-PROOF` | Pump.fun or PumpSwap stays unverified until live proof exists. |
| `LIVE-TENSOR-PROOF` | Tensor stays unverified until live proof exists. |
| `LIVE-CROSS-APP-PROOF` | A cross-app claim needs a distinct target app plus a source scenario, and the finalized source transaction, both mirrors, exact target-field match, and `@App.get` existence query still require retained live proof. |
| `DEVNET-ESCROW-SENTINEL` | `@AccountPlugin.getAccountAddress(@contract.address)` is unsupported on the current deployed Devnet runtime; bind the current Devnet program ID as a string argument when resolving the escrow. |
| `NO-DEVNET-JUPITER` | Jupiter is unavailable on devnet. |
| `NO-DEVNET-PHOENIX` | Phoenix is unavailable on devnet. |
| `NO-DEVNET-DFLOW` | DFlow is unavailable on devnet. |
| `NO-USABLE-DEVNET-KAMINO-MARKET` | The KLend program IS deployed and executable on devnet at the same address as mainnet (verified on chain 2026-08-05); what has not been established is a usable market and reserve set there. Treat Kamino as untestable on devnet for that reason, not because the program is missing. |
| `LIVE-METEORA-PROOF` | The replacement Meteora config is deployed on devnet and the runtime targets it, so nothing here is externally blocked; these stay unverified until retained live proof exists. |
| `CPAMM-SCENARIO` | A devnet acceptance run of this function is straightforward to construct, so a retained passing receipt can promote it. |
| `OFFCHAIN-ONLY` | The compiler explicitly rejects this function in an onchain target. |
| `NEEDS-RUNTIME-V4` | The function needs Bounded Solana runtime v4 as a minimum. Both devnet and mainnet-beta have met it since 2026-08-05, so the runtime-version deploy-time refusal no longer applies; rows still carrying this tag were cataloged before the upgrade and stay unverified until retained live proof exists (support and live verification are separate states). |
| `NEEDS-RUNTIME-V6` | The function needs Bounded Solana runtime v6 as a minimum, because it is new on-chain interpreter code rather than a call into an external program. Both devnet (slot 492776210) and mainnet-beta (slot 444129016) have met it since 2026-09-04, so the runtime-version deploy-time refusal no longer applies. A cluster still on v5 refuses a policy using it at deploy time. |
| `NEEDS-RUNTIME-V7` | The function or call shape needs Bounded Solana runtime v7 as a minimum. Both devnet (slot 498804425) and mainnet-beta (slot 447272765) have met it since 2026-09-15, so the runtime-version deploy-time refusal no longer applies. v7 adds `@PhoenixPerpsPlugin.withdrawFunds` with the amount omitted (a same-transaction Hawkeye margin view; the explicit-amount form runs on every runtime), makes `@TokenPlugin.withdrawWithheldTokens` a successful no-op when the source holds no Token-2022 account or no withheld fees (v6 refused it), and is the runtime the fee-neutral staking and bidder-claim policies that sweep a receiver before creating it were verified against. A cluster still on v6 refuses the omitted-amount shape at deploy time and fails those sweeps closed at write time. |
| `LIVE-STAKEPOOL-PROOF` | SPL stake pool is deployed on devnet (at a DIFFERENT address from mainnet) and stays unverified until retained live proof exists. |
| `LIVE-RAYDIUM-PROOF` | Raydium CPMM is deployed on devnet (at a different address from mainnet) and stays unverified until retained live proof exists. |
| `LIVE-DLMM-PROOF` | Meteora DLMM is deployed on devnet at the same address as mainnet and stays unverified until retained live proof exists. |
| `DISABLED` | The registry entry exists but is disabled. |

## Function inventory

| Function | Discovery | Devnet support | Live verification | Constraint |
|---|---|---|---|---|
| `@AccountPlugin.createAccount` | legacy runtime | unverified | source parity only | LIVE-PENDING |
| `@AccountPlugin.getAccountAddress` | legacy runtime | unverified | source parity only | LIVE-PENDING; DEVNET-ESCROW-SENTINEL |
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
| `@CPI.kaminoBorrow` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |
| `@CPI.kaminoDeposit` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |
| `@CPI.kaminoInitObligation` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET |
| `@CPI.kaminoInitUserMetadata` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET |
| `@CPI.kaminoRefreshObligation` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET |
| `@CPI.kaminoRefreshReserve` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |
| `@CPI.kaminoRepay` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |
| `@CPI.kaminoWithdraw` | descriptor CPI | unsupported | not run | NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4 |
| `@CPI.token2022RevokeFeeAuthority` | descriptor CPI | unverified | local policy verified; live not run | LIVE-PENDING |
| `@CPI.token2022HarvestFees` | descriptor CPI | unverified | local policy verified; live not run | LIVE-PENDING, NEEDS-RUNTIME-V4 |
| `@CPI.token2022WithdrawMintFees` | descriptor CPI | unverified | local policy verified; live not run | LIVE-PENDING |
| `@CPI.token2022WithdrawMintFeesTo` | descriptor CPI | unverified | source parity only | LIVE-PENDING |
| `@CPI.memoNote` | descriptor CPI | unverified | source parity only | LIVE-SAFE-CPI-PROOF |
| `@CPI.transferLamports` | descriptor CPI | unverified | source parity only | LIVE-SAFE-CPI-PROOF |
| `@CPI.stakePoolDepositSol` | descriptor CPI | unverified | not run | LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4 |
| `@CPI.stakePoolWithdrawSol` | descriptor CPI | unverified | not run | LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4 |
| `@CPI.raydiumSwapBaseInput` | descriptor CPI | unverified | not run | LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4 |
| `@CPI.raydiumDeposit` | descriptor CPI | unverified | not run | LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4 |
| `@CPI.raydiumWithdraw` | descriptor CPI | unverified | not run | LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4 |
| `@CPI.dlmmSwap` | descriptor CPI | unverified | not run | LIVE-DLMM-PROOF, NEEDS-RUNTIME-V4 |
| `@Solana.verifyEd25519` | ext primitive | unverified | not run | NEEDS-RUNTIME-V4 |
| `@Solana.secp256k1Recover` | ext primitive | unverified | not run | NEEDS-RUNTIME-V4 |
| `@Bytes.sha256` | ext primitive | unverified | not run | NEEDS-RUNTIME-V4 |
| `@Bytes.keccak256` | ext primitive | unverified | not run | NEEDS-RUNTIME-V4 |
| `@DeFiPlugin.addCpAmmLiquidity` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.claimDammV2PoolFees` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.claimMeteoraPoolFees` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.closeCpAmmPosition` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.createCpAmmPosition` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.createMeteoraConfig` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.createMeteoraVirtualPool` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.createPool` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF; CPAMM-SCENARIO |
| `@DeFiPlugin.getClaimableCpAmmPositionFee` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getClaimableMeteoraPoolFees` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getCpAmmPoolAddress` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getCpAmmPositionNftMintAddress` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getDammV2PoolAddress` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getMeteoraSwapQuote` | legacy offchain-only | unverified | not run | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getMeteoraVirtualPoolAddress` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.getSwapQuote` | legacy offchain-only | unsupported | not run | NO-DEVNET-JUPITER |
| `@DeFiPlugin.lockCpAmmPosition` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.removeCpAmmLiquidity` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.swap` | legacy runtime | unsupported | not run | NO-DEVNET-JUPITER |
| `@DeFiPlugin.swapInMeteoraVirtualPool` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
| `@DeFiPlugin.withdrawLeftover` | legacy runtime | unverified | source parity only | LIVE-METEORA-PROOF |
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
| `@PriceFeedPlugin.getPriceFeedScaled` | extended runtime | unverified | source parity only | NEEDS-RUNTIME-V8; LIVE-PYTH-PROOF |
| `@PumpFunPlugin.buyExactSolInWithMinimumOutput` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
| `@PumpFunPlugin.getPumpBuyQuote` | legacy runtime | unverified | source parity only | LIVE-PUMP-PROOF |
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
| `@StringUtils.concat` | extended runtime | unverified | source parity only | NEEDS-RUNTIME-V6 |
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

`@TokenPlugin.SOL` is a source-defined native token alias, but its complete flow remains unverified in this snapshot.
`@TokenPlugin.USDC` is mainnet-only and is unsupported for TokenPlugin operations on devnet.
Do not confuse that constant with the platform-configured staging test-stablecoin payment rail.
Devnet token acceptance must create and use an app-owned classic SPL or Token-2022 mint.
`@TokenPlugin.EURC` has no published devnet acceptance receipt and must remain unverified.

## Read-query contracts

`@PriceFeedPlugin.getPriceFeed` returns a decimal `String` from the deployed runtime.
Do not declare it as `Float` or document it as a JavaScript number.
It remains unverified on devnet until a retained Pyth read proves the string value and freshness behavior.
`@PriceFeedPlugin.getPriceFeedScaled(feedId, decimals)` is the separate integer USD-price API for runtime v8 and later.
It returns a positive `UInt` equal to `floor(USD price * 10^decimals)`; `decimals` must be an integer from 0 through 18.
Use 6 for micro-USD, declare the named-query return type as `UInt`, and keep every arithmetic operand in compatible units.
The source implementation rejects invalid precision, non-positive oracle prices, zero after rounding, and results above u64; it preserves the oracle's account verification and freshness checks.
It accepts no quote feed and leaves the legacy decimal-string and base/quote-ratio API unchanged.
Both the devnet and mainnet-beta programs meet the runtime-v8 requirement; an older v7 program still refuses the scaled call.
The hosted services and app rollout remain pending; the program upgrade alone does not enable this API for hosted apps.
Named-query `queryArgs` populate staged `@newData` for the query expression.
On a Solana app, a named query that calls no plugin runs in the worker runtime on any path.
A plugin-calling query on an `onchain: true` path runs in the program against the collection's uploaded rules.
On an `onchain: false` path it runs whole in the program only when it calls only chain-capable plugins, reads no offchain documents, and its path's read rule is document-independent; otherwise it runs in the worker runtime.
A whole query routed to the program requires the runtime version of every function it calls, including v8 for the scaled price, even on an `onchain: false` path.
Worker evaluation normally resolves chain reads in the program, but both `PriceFeedPlugin` price APIs instead read verified sponsored oracle account bytes directly through the platform RPC.
That direct price read retains account validation and freshness checks and is independent of the deployed program version.
Anonymous chain-query execution is admitted for identity-independent queries whose owning path's read rule authorizes the caller; a query reading `@user.address`/`@user.evmAddress` requires that identity, and the anonymous surface is the browser SDK rather than the CLI.
On Solana mainnet a signed-out chain query currently fails, so require a signed-in wallet there until the platform's query payer fix ships.

## Acceptance contract

Every live acceptance run must have a unique run ID.
Browsing the catalog, validating forms, and preflighting must work without a wallet.
That wallet-free requirement also holds for live chain named-query execution when the query is identity-independent and the path read rule authorizes an anonymous caller; only a query reading `@user.address`/`@user.evmAddress` needs an authenticated wallet.
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

A Solana compiler, runtime, manifest, descriptor, deployment, or external configuration change must update this table in the same change.
Do not promote a row from `unverified`, `blocked`, or `unsupported` without retained evidence that matches the deployed revision.
