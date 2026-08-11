## Conventions for every call

- **Custody:** every `source`/`owner` argument follows the uniform rule - wallet, `@contract.address` escrow, or account id (named app PDA). A per-entity account id is how you keep one launch/market/position pot physically separate from another: `createPool($launchId, ...)` gives each launch its own program-signed fund instead of pooling everything in the shared escrow. See [custody and PDAs](../custody-and-pdas.md).
- Meteora launch flows (config, virtual pool, fee claims) are documented end to end in [meteora-token-launch.md](../meteora-token-launch.md) and the fee-split composition in [oapps-tokenomics-fee-split.md](../oapps-tokenomics-fee-split.md).
- Slippage arguments are basis points (`500` = 5%). Every mutating call returns `Bool` (built and executed), never an amount - read balances or pool state afterwards.
