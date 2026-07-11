# Chain data — managed read-only Helius + Alchemy proxy

Bounded proxies two chain-data providers through the standard managed services
surface: `ctx.services` in functions, `bounded services search|describe` in the
CLI. No provider keys in app code, every call metered and observed, and the
whole surface is read-only by construction.

```ts
// Solana: parsed activity for a wallet
const txs = await ctx.services.invoke("HELIUS_ENHANCED_TRANSACTIONS", {
  address: wallet, limit: 25
});
// EVM: ERC-20 holdings on Base
const bal = await ctx.services.invoke("ALCHEMY_TOKEN_BALANCES", {
  network: "base-mainnet", address: evmWallet
});
```

## What's available

| Tool | What it does |
|---|---|
| `HELIUS_RPC_CALL` | Solana mainnet JSON-RPC passthrough. Read-only allowlist: `getAccountInfo`, `getMultipleAccounts`, `getBalance`, `getTokenAccountsByOwner`, `getSignaturesForAddress`, `getTransaction`, `getProgramAccounts` (filters required), `simulateTransaction`. |
| `HELIUS_DAS_GET_ASSET` | One asset (NFT / compressed NFT / token) by id. |
| `HELIUS_DAS_GET_ASSETS_BY_OWNER` | Paginated assets held by a wallet. |
| `HELIUS_DAS_SEARCH_ASSETS` | Asset search by owner / creator / collection / tokenType. |
| `HELIUS_ENHANCED_TRANSACTIONS` | Parsed, human-readable transaction history for an address. |
| `ALCHEMY_EVM_RPC_CALL` | EVM JSON-RPC passthrough, per network. Read-only allowlist: `eth_call`, `eth_getBalance`, `eth_getLogs` (bounded block range), `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_blockNumber`, `eth_getCode`, `eth_getStorageAt`. |
| `ALCHEMY_TOKEN_BALANCES` | ERC-20 balances for an address. |
| `ALCHEMY_TOKEN_METADATA` | ERC-20 name / symbol / decimals / logo. |
| `ALCHEMY_ASSET_TRANSFERS` | Historical transfers (external / internal / erc20 / erc721 / erc1155) for an address. |

The Alchemy tools take a `network` argument validated against Bounded's EVM
network registry (`eth-mainnet`, `eth-sepolia`, `base-mainnet`, `base-sepolia`,
…). Unknown networks are rejected. Solana reads go through Helius.
`ctx.services.describe("helius")` / `describe("alchemy")` return every tool
with its input schema and per-call cost.

## The read-only guarantee

This proxy can observe chains; it can never touch them. The passthrough tools
accept only the explicit read-method allowlists above — `eth_sendRawTransaction`,
`sendTransaction`, and every signing or state-changing method is rejected
fail-closed, and so is any method not on the list. The fixed tools take their
method from Bounded's catalog, never from your input, and the plane holds no
signing material at all. Expensive scans are bounded too: `eth_getLogs` needs a
`blockHash` or an explicit block range, `getProgramAccounts` needs filters.

Sending transactions is a different plane entirely — onchain collections and
policy-gated writes (see `onchain.md`). Nothing you pass to `ctx.services` can
move funds or mutate chain state.

## Billing

Standard managed-services metering: each tool has a published provider cost
(Helius credits, billed at their $5/M overage rate; Alchemy compute units at
the ~$0.45/M CU on-demand rate) and Bounded charges the app owner's
AI/external-services bucket at cost + 5% — charged before the provider call,
refunded automatically if the provider errors. Cheap reads are fractions of a
cent (a Solana RPC read is ~6 µUSD); the expensive ones are asset search and
parsed history (~525 µUSD). Fail-closed 402 `services_credit_exhausted` when
the bucket is empty; free-plan apps draw from the free services allowance.
Calls are also rate-isolated per app (429 `chain_data_rate_limited` on bursts).

## Views vs proxy — which one do I want?

Chain views and onchain collections are consistent, policy-gated, subscribable
chain STATE — the thing your rules, invariants, and live queries evaluate
against. The chain-data proxy is enrichment, history, and aggregates — parsed
activity feeds, portfolio lookups, log scans, token metadata.

Rule of thumb: if a policy decision or invariant depends on the value, model it
as a collection/view; if a UI panel, agent summary, or one-off analysis needs
it, the proxy is the right tool.
