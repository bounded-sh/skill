## Reveal contract

`requestRandomness(uniqueId, revealPath)` needs `revealPath` to point at a fieldless reveal collection; the fulfillment lands through a server-driven reveal write with no user context (so that path's hooks cannot use payer-funded calls such as `@AccountPlugin.createAccount`). Read results with `getRandomNumber(uniqueId, lowerBound, upperBound)` - the upper bound is exclusive. The full flow, including anti-cheat sequencing, is in [randomness.md](../randomness.md).
