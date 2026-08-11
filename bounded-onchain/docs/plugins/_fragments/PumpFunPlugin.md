## Conventions for every call

The complete launch/buy/fee lifecycle, with the custody rule for `source`/`creator` arguments and worked policies, lives in [pump-fun.md](../pump-fun.md). Short version: `creator` is the fee recipient and follows the uniform custody rule (wallet, `@contract.address` escrow, or account id); `tokenId` is the app-scoped mint derivation input; every mutating call returns `Bool`, so read balances or the mirror for amounts.
