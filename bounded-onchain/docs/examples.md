# Onchain example policies

Complete, deployable policies indexed by what you are building. Every page carries one self-contained `policy.json` plus the operations and the reasoning; each one parses and passes this repo's policy fences, and a maintainer exercises it against the local platform (deploy, formal verification, allow/deny behavior) with `scripts/policy-e2e/run.mjs` when the example changes. Offchain-first examples live in the [backend examples index](../../bounded-backend/docs/examples.md).

| You are building | Open |
|---|---|
| An escrow that holds a buyer's funds and releases once | [escrow](examples/escrow.md) |
| Per-entity pots that must never mix (auctions, prize pools, per-tenant balances) | [isolated vault](examples/isolated-vault.md) |
| One app treasury with open deposits and gated withdrawals | [treasury](examples/treasury.md) |
| Staking with a lock window | [staking](examples/staking-lock-vault.md) |
| A prediction market with AMM pricing | [prediction market](examples/prediction-market-amm.md) |
| A token launch on pump.fun | [token launch](examples/token-launch.md) |
| An NFT collection with gated minting | [NFT collection](examples/nft-collection.md) |
| Token-2022 with transfer fees, soulbound badges, or interest | [Token-2022 extensions](examples/token2022-extensions.md) |
| Coin flips, raffles, anything needing verifiable randomness | [randomness](examples/randomness-coin-flip.md) |
| cp-AMM liquidity positions per user | [liquidity positions](examples/cp-amm-liquidity-positions.md) |
| A marketplace with listings, orders, and a spend cap (offchain) | [marketplace](../../bounded-backend/docs/examples/marketplace.md) |

Before adapting any example: the custody model behind every funds-moving hook is in [custody and PDAs](custody-and-pdas.md), manifest plugin argument details are in the [plugin catalog](plugins.md), and the live support state of each function is in [solana-capability-status.md](solana-capability-status.md).
