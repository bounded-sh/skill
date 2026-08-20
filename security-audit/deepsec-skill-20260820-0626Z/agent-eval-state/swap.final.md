The pinned Bounded catalog supports the Meteora virtual-pool swap contract, but marks it `unverified` pending retained live proof. Jupiter is explicitly unsupported on devnet. Therefore this is a production-grade, fail-closed Meteora design, but production release remains blocked until the configured environment passes the capability and live-network gates.

Missing values are placeholders:

- `<APP_ID>`
- `<SOLANA_DEVNET_OR_MAINNET_RPC_URL>`
- `<POOL_TOKEN_MINT>`
- `<TRUSTED_METEORA_QUOTE_PROVIDER>`

### `policy.json`

This policy defines a self-custody SOL → pool-token exact-input swap. The authenticated wallet is simultaneously the signer and source. Meteora derives the output ATA for that same wallet, so the destination cannot be redirected.

```json
{
  "constants": {
    "SWAP_INTENT": "meteora.buy.exact-in.v1",
    "SOL_MINT": "So11111111111111111111111111111111111111112",
    "POOL_TOKEN_MINT": "<POOL_TOKEN_MINT>",
    "MIN_AMOUNT_IN": 1000000,
    "MAX_AMOUNT_IN": 1000000000,
    "MAX_SLIPPAGE_BPS": 100,
    "MIN_QUOTE_BPS": 9900
  },

  "swapIntents/$intentId": {
    "description": "Append-only, client-signed SOL-to-token Meteora swap intent. The plugin derives both token accounts from the authenticated source wallet.",
    "onchain": true,

    "fields": {
      "intentId": "String!",
      "intent": "String!",

      "source": "Address!",
      "destinationOwner": "Address!",

      "inputMint": "Address!",
      "outputMint": "Address!",

      "amountIn": "UInt!",
      "quotedAmountOut": "UInt!",
      "minimumAmountOut": "UInt!",
      "maxSlippageBps": "UInt!",
      "requestedAt": "UInt!"
    },

    "rules": {
      "read": "true",

      "create": "@user.address != null && @newData.intentId == $intentId && @newData.intent == @const.SWAP_INTENT && @newData.source == @user.address && @newData.destinationOwner == @user.address && @newData.inputMint == @const.SOL_MINT && @newData.outputMint == @const.POOL_TOKEN_MINT && @newData.amountIn >= @const.MIN_AMOUNT_IN && @newData.amountIn <= @const.MAX_AMOUNT_IN && @newData.quotedAmountOut > 0 && @newData.minimumAmountOut > 0 && @newData.minimumAmountOut <= @newData.quotedAmountOut && @newData.maxSlippageBps == @const.MAX_SLIPPAGE_BPS && @newData.minimumAmountOut >= @MathPlugin.mulDivFloor(@newData.quotedAmountOut, @const.MIN_QUOTE_BPS, 10000) && @newData.requestedAt <= @time.now && @newData.requestedAt + 30 >= @time.now",

      "update": "false",
      "delete": "false"
    },

    "hooks": {
      "onchain": {
        "create": "@DeFiPlugin.swapInMeteoraVirtualPool(@user.address, @const.POOL_TOKEN_MINT, @TokenPlugin.SOL, @newData.amountIn, @newData.minimumAmountOut)"
      }
    }
  }
}
```

Important properties:

- The hook ignores client-provided source and mint arguments; it uses `@user.address`, the fixed pool mint, and `@TokenPlugin.SOL`.
- `minimumAmountOut` is passed unchanged into Meteora and causes the transaction to revert below that output.
- The submitted quote and minimum must represent no more than 100 bps adverse movement.
- `requestedAt` must use `serverTimestamp()`, so the 30-second admission fence uses the same clock as `@time.now`.
- The append-only `$intentId` path prevents successful intent IDs from being replayed as updates.
- The configured cap allows 0.001–1 SOL. Adjust these constants to the product’s risk limits.

### Client

The quote provider is deliberately injected because Bounded’s current `getMeteoraSwapQuote` surface is offchain-only and cannot presently be placed in a working chain-backed named query. Use an audited Meteora client or trusted quote backend for `<TRUSTED_METEORA_QUOTE_PROVIDER>`.

```ts
import {
  getCurrentUser,
  init,
  openBoundedWidget,
  serverTimestamp,
  set,
} from "@bounded-sh/client";
import { Connection } from "@solana/web3.js";

const APP_ID = "<APP_ID>";
const RPC_URL = "<SOLANA_DEVNET_OR_MAINNET_RPC_URL>";
const CHAIN = "solana_devnet" as const; // Change with the deployed environment.

const SOL_MINT = "So11111111111111111111111111111111111111112";
const POOL_TOKEN_MINT = "<POOL_TOKEN_MINT>";

const MIN_AMOUNT_IN = 1_000_000;
const MAX_AMOUNT_IN = 1_000_000_000;
const MAX_SLIPPAGE_BPS = 100;
const QUOTE_TTL_MS = 15_000;

await init({
  appId: APP_ID,
  chain: CHAIN,
  rpcUrl: RPC_URL,
});

const connection = new Connection(RPC_URL, "finalized");

export type MeteoraQuoteProvider = (request: {
  poolTokenMint: string;
  tokenToSwapInMint: string;
  amountIn: number;
}) => Promise<{
  amountOutBaseUnits: bigint;
}>;

export type SwapReview = {
  intent: "meteora.buy.exact-in.v1";
  signer: string;
  source: string;
  destinationOwner: string;
  inputMint: string;
  outputMint: string;
  amountIn: number;
  quotedAmountOut: number;
  minimumAmountOut: number;
  maxSlippageBps: 100;
};

export async function signIn(): Promise<void> {
  const user = await openBoundedWidget({
    methods: ["email", "google"],
  });

  if (!user.address) {
    throw new Error("Login completed without a Solana wallet");
  }
}

export async function submitMeteoraBuy(args: {
  amountIn: number;
  quote: MeteoraQuoteProvider;
  confirmReview: (review: SwapReview) => Promise<boolean>;
}): Promise<{ intentId: string; signature: string }> {
  const user = getCurrentUser();

  if (!user?.address) {
    throw new Error("An authenticated Solana wallet is required");
  }

  assertSafeUInt(args.amountIn, "amountIn");

  if (
    args.amountIn < MIN_AMOUNT_IN ||
    args.amountIn > MAX_AMOUNT_IN
  ) {
    throw new Error("amountIn is outside the policy bounds");
  }

  const quoteStartedAt = Date.now();

  const quote = await args.quote({
    poolTokenMint: POOL_TOKEN_MINT,
    tokenToSwapInMint: SOL_MINT,
    amountIn: args.amountIn,
  });

  if (quote.amountOutBaseUnits <= 0n) {
    throw new Error("Quote returned no output");
  }

  const minimumAmountOutBigInt =
    (quote.amountOutBaseUnits *
      BigInt(10_000 - MAX_SLIPPAGE_BPS)) /
    10_000n;

  const quotedAmountOut = toSafeUInt(
    quote.amountOutBaseUnits,
    "quotedAmountOut",
  );
  const minimumAmountOut = toSafeUInt(
    minimumAmountOutBigInt,
    "minimumAmountOut",
  );

  if (minimumAmountOut === 0) {
    throw new Error("Calculated minimum output is zero");
  }

  const intentId = crypto.randomUUID();

  const review: SwapReview = {
    intent: "meteora.buy.exact-in.v1",
    signer: user.address,
    source: user.address,

    // Meteora derives the output ATA owned by this address.
    destinationOwner: user.address,

    inputMint: SOL_MINT,
    outputMint: POOL_TOKEN_MINT,
    amountIn: args.amountIn,
    quotedAmountOut,
    minimumAmountOut,
    maxSlippageBps: MAX_SLIPPAGE_BPS,
  };

  if (!(await args.confirmReview(review))) {
    throw new Error("Swap cancelled");
  }

  // Never silently refresh or substitute a quote after approval.
  if (Date.now() - quoteStartedAt > QUOTE_TTL_MS) {
    throw new Error("Quote expired; obtain and approve a new quote");
  }

  const receipt = await set(`swapIntents/${intentId}`, {
    intentId,
    intent: review.intent,

    source: review.source,
    destinationOwner: review.destinationOwner,

    inputMint: review.inputMint,
    outputMint: review.outputMint,

    amountIn: review.amountIn,
    quotedAmountOut: review.quotedAmountOut,
    minimumAmountOut: review.minimumAmountOut,
    maxSlippageBps: review.maxSlippageBps,

    // Must not be replaced with Date.now().
    requestedAt: serverTimestamp(),
  });

  const signature = (receipt as { transactionId?: string }).transactionId;

  if (!signature) {
    throw new Error("Bounded returned no Solana transaction signature");
  }

  await requireFinalizedSuccess(connection, signature);

  return { intentId, signature };
}

function assertSafeUInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative safe integer`);
  }
}

function toSafeUInt(value: bigint, name: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${name} is outside Bounded UInt range`);
  }

  return Number(value);
}

async function requireFinalizedSuccess(
  connection: Connection,
  signature: string,
): Promise<void> {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses(
      [signature],
      { searchTransactionHistory: true },
    );
    const status = response.value[0];

    if (status?.err) {
      throw new Error(
        `Swap failed onchain: ${JSON.stringify(status.err)}`,
      );
    }

    if (status?.confirmationStatus === "finalized") {
      const transaction = await connection.getTransaction(signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      });

      if (!transaction || transaction.meta?.err) {
        throw new Error("Finalized transaction was missing or failed");
      }

      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_250));
  }

  throw new Error("Timed out waiting for finalized confirmation");
}
```

Do not automatically retry a timed-out submission with a new intent ID: first resolve the original signature. A blind retry can execute a second swap.

### Required release gates

Run these against the actual installed CLI and completed policy:

```sh
bounded plugins list --json
bounded plugins describe @DeFiPlugin.swapInMeteoraVirtualPool --json
bounded plugins describe @MathPlugin.mulDivFloor --json
bounded verify --protocol <ACTUAL_PROTOCOL> --json
```

Release only if:

- The described Meteora signature, signer marker, argument order, and minimum-output behavior match the policy.
- Verification passes with no blocking counterexamples.
- `capabilityReadiness` has no incompatible runtime requirement.
- Retained live evidence exists for the exact network/runtime revision.
- A funded low-value test finalizes successfully and the output lands in the signer-owned destination ATA.
- A deliberately impossible `minimumAmountOut` finalizes as failed and leaves both wallet balances and the Bounded intent path unchanged.

Security rationale: authorization, immutable intent, amount caps, pair, signer, source, destination owner, and minimum output are bound before signing. The plugin receives policy-fixed accounts and the exact approved amount/floor, so it cannot redirect proceeds or silently widen slippage. Finalized RPC state-not the returned signature or immediate mirror-is treated as settlement evidence. The remaining limitation is quote provenance: policy proves consistency with the submitted quote, not that an untrusted quote source reported the real market. The onchain `minimumAmountOut` remains the hard execution guarantee.