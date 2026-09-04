<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# Plugin catalog

Compact O(1) router for policy-callable plugins. Open one namespace page for manifest argument details, or use the [complete signatures index](plugin-signatures.md) when you need to scan every callable signature. Check [solana-capability-status.md](solana-capability-status.md) before treating a function as deployed or live-verified.

Argument descriptions and signer markers come directly from existing monorepo manifests. A `-` signer cell means the manifest makes no claim, not that no signature is required. Do not infer custody support from an argument name; follow its description and the [custody and PDAs guide](custody-and-pdas.md).

| Namespace | Role | Function names | Detail |
|---|---|---|---|
| `@AccountPlugin` | Named app PDAs (per-entity escrow/vault accounts) - create them and read their addresses. | `createAccount`, `getAccountAddress` | [reference](plugins/AccountPlugin.md) |
| `@App` | Cross-app Document reads and writes from onchain policy. | `set`, `get` | [reference](plugins/App.md) |
| `@BondingCurvePlugin` | Pure constant-product bonding-curve math (quotes only, no mutation). | `getMarketCapInSol`, `getMaxSolInProduct`, `getMaxTokensInProduct`, `getSolOutProduct`, `getTokensInProduct`, `getTokensOutProduct` | [reference](plugins/BondingCurvePlugin.md) |
| `@Bytes` | Borsh-style byte building and reading for raw instruction data. | `anchorDiscriminator`, `bool`, `concat`, `i64`, `i64At`, `len`, `pubkey`, `pubkeyAt`, `raw`, `str`, `u128`, `u16`, `u16At`, `u32`, `u32At`, `u64`, `u64At`, `u8`, `u8At`, `utf8` | [reference](plugins/Bytes.md) |
| `@CPI` | Descriptor-bound CPI calls (memo, lamports, Kamino, DLMM, Raydium, stake pools). | `dlmmSwap`, `kaminoBorrow`, `kaminoDeposit`, `kaminoInitObligation`, `kaminoInitUserMetadata`, `kaminoRefreshObligation`, `kaminoRefreshReserve`, `kaminoRepay`, `kaminoWithdraw`, `memoNote`, `raydiumDeposit`, `raydiumSwapBaseInput`, `raydiumWithdraw`, `stakePoolDepositSol`, `stakePoolWithdrawSol`, `transferLamports` | [reference](plugins/CPI.md) |
| `@DeFiPlugin` | AMM pools, swaps, Meteora launches/fee claims, and cp-AMM liquidity positions. | `addCpAmmLiquidity`, `claimDammV2PoolFees`, `claimMeteoraPoolFees`, `closeCpAmmPosition`, `createCpAmmPosition`, `createMeteoraConfig`, `createMeteoraVirtualPool`, `createPool`, `lockCpAmmPosition`, `removeCpAmmLiquidity`, `swap`, `swapInMeteoraVirtualPool`, `withdrawLeftover`, `getClaimableCpAmmPositionFee`, `getClaimableMeteoraPoolFees`, `getCpAmmPoolAddress`, `getCpAmmPositionNftMintAddress`, `getDammV2PoolAddress`, `getMeteoraSwapQuote`, `getMeteoraVirtualPoolAddress`, `getSwapQuote` | [reference](plugins/DeFiPlugin.md) |
| `@DflowPlugin` | DFlow prediction-market orders and KYC status. | `openPredictionMarketOrder`, `getKycStatus` | [reference](plugins/DflowPlugin.md) |
| `@DocumentPlugin` | Staged document writes from hooks; check each function for its supported hook plane. | `putDocument`, `updateField` | [reference](plugins/DocumentPlugin.md) |
| `@MathPlugin` | Overflow-safe mulDiv helpers for rule arithmetic. | `mulDivCeil`, `mulDivFloor` | [reference](plugins/MathPlugin.md) |
| `@NFTPlugin` | Metaplex Core NFTs: collections, mints, transfers, burns, royalties. | `burn`, `createCollection`, `mintNFT`, `transfer`, `updateCollectionRoyalties`, `updateRoyalties`, `getCollectionMintAddress`, `getOwner`, `getTokenMintAddress`, `getUpdateAuthority` | [reference](plugins/NFTPlugin.md) |
| `@OraclePlugin` | ORAO verifiable randomness (request + reveal reads). | `requestRandomness`, `getRandomNumber`, `getVRFAddress` | [reference](plugins/OraclePlugin.md) |
| `@PhoenixPerpsPlugin` | Phoenix leveraged perps: registration, collateral, positions. | `closePosition`, `depositFunds`, `emberDeposit`, `emberWithdraw`, `placeLong`, `placeShort`, `registerTrader`, `syncParentToChild`, `transferToCross`, `transferToIsolated`, `withdrawFunds`, `getCollateralBalance`, `getMarkPrice`, `getPortfolioValue`, `getPositionSize`, `getUnrealizedPnl`, `hasPosition`, `isRegistered` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PredictionMarketPlugin` | Pure AMM/LSMR prediction-market math (quotes only, no mutation). | `applyFee`, `getCollateralOutAmm`, `getNoCollateralOutLsmr`, `getNoTokensOutLsmr`, `getYesCollateralOutLsmr`, `getYesTokenOutAmm`, `getYesTokensOutLsmr` | [reference](plugins/PredictionMarketPlugin.md) |
| `@PriceFeedPlugin` | Pyth price reads by 64-hex feed id. | `getPriceFeed` | [reference](plugins/PriceFeedPlugin.md) |
| `@PumpFunPlugin` | Pump.fun token launches, buys, creator fees, and PumpSwap liquidity. | `buyExactSolIn`, `buyExactSolInWithMinimumOutput`, `collectCreatorFee`, `createFeeSharingConfig`, `createToken`, `createTokenV2`, `distributeCreatorFees`, `pumpswapDeposit`, `pumpswapWithdraw`, `transferCreatorFeesToPump`, `updateShareholders`, `getBondingCurveProgress`, `getCreatorFee`, `getPumpBuyQuote` | [reference](plugins/PumpFunPlugin.md) |
| `@Solana` | Extended Solana primitives: account reads, PDAs/ATAs, named signers, raw invoke. | `createAccount`, `invoke`, `account`, `ata`, `data`, `lamports`, `pda`, `pdaBump`, `rentExemption`, `signerAccount` | [reference](plugins/Solana.md) |
| `@StringUtils` | String helpers usable in rules. | `concat`, `length` | [reference](plugins/StringUtils.md) |
| `@TensorPlugin` | Tensor NFT marketplace buys and listings. | `buyNft`, `listNft` | [reference](plugins/TensorPlugin.md) |
| `@TokenPlugin` | SPL and Token-2022 tokens: transfers, mints, burns, balances, supply. | `burn`, `createToken`, `createToken2022`, `mint`, `transfer`, `transferWholeTokens`, `withdrawWithheldTokens`, `getBalance`, `getDecimals`, `getSupply`, `getTokenMintAddress`, `getWithdrawWithheldAuthority` | [reference](plugins/TokenPlugin.md) |

## Capability-only entries

Rows in the capability table with no callable manifest function today (disabled, runtime-gated, or core language forms):

| Entry | Support | Markers |
|---|---|---|
| `@Bytes.keccak256` | unverified | NEEDS-RUNTIME-V4 |
| `@Bytes.sha256` | unverified | NEEDS-RUNTIME-V4 |
| `@Solana.invokeAttested` | unsupported | DISABLED |
| `@Solana.secp256k1Recover` | unverified | NEEDS-RUNTIME-V4 |
| `@Solana.slot` | unverified | LIVE-PENDING |
| `@Solana.verifyEd25519` | unverified | NEEDS-RUNTIME-V4 |
| `get` | unverified | LIVE-PENDING |
| `getAfter` | unverified | LIVE-PENDING |
