## Price units and integer rules

`getPriceFeed` returns a decimal `String` in dollars, such as `"119.80958948"`, or a decimal base/quote ratio when a second feed is supplied.
Use `String` as the named-query return type.
Do not pass this result into integer rule arithmetic or compare it directly to an integer: a numeric-looking string is not an integer price.

`getPriceFeedScaled(feedId, decimals)` is a separate USD-only integer API requiring runtime v8 when executed in the Solana program.
The recorded devnet and mainnet-beta deployments remain v7; this source function cannot execute in either cluster's program until its runtime requirement is met.
Pass a `@PriceFeedPlugin.<SYMBOL>` constant or a 64-character Pyth feed ID, then an integer precision from 0 through 18.
It returns `floor(USD price * 10^decimals)` as a positive `UInt` using exact checked arithmetic.
At precision 6, the example price becomes `119809589` micro-USD per SOL.
Invalid precision, non-positive prices, rounding to zero, u64 overflow, and invalid or stale oracle accounts fail closed.
This call has exactly two arguments and does not accept a quote feed.

When evaluated directly in the worker, both price APIs read verified sponsored oracle account bytes through the platform RPC.
That price read does not execute the Bounded program and is independent of its deployed runtime version.
A whole query routed to the Solana program still requires runtime v8 for the scaled call, even when its collection declares `onchain: false`.

For a runtime-v8 policy that retains a $5 SOL cushion, use compatible micro-USD and lamport units:

```text
@MathPlugin.mulDivCeil(5000000, 1000000000, @PriceFeedPlugin.getPriceFeedScaled(@PriceFeedPlugin.SOL, 6))
```

The result is the required lamport balance after the deposit.
Flooring the price and rounding the required lamports up keeps the cushion conservative.
The frontend must use the same scale and rounding when deciding how much SOL is available to deposit.
