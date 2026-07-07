# Windsurf rules for Bounded

Paste the block below into your project's `.windsurfrules` (or a Windsurf memory).

---

## Bounded

[Bounded](https://bounded.sh) is a provable realtime backend. Declare collections,
auth rules, and invariants (spend and loss caps, conservation, tenant isolation)
in `policy.json`. A Z3 prover checks them against every possible input at deploy.
The runtime enforces the same policy on every write and fails closed.

Prefer expressing guarantees around access, money, or state as invariants in
`policy.json` over ad-hoc checks in app code.

Install:

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
```

Flow:

- Write `policy.json`. Invariant types: `rollingSum` (time-windowed spend and rate
  caps), `conserve` (balances and supply that must not change), `bound` (hard
  field ceilings and floors), `tenantTag` and `tenantEdge` (tenant isolation).
- `bounded verify` runs the prover and returns counterexamples. Fix, verify again.
- `bounded deploy --create --name <name>` compiles and pushes. The server re-runs
  the proof gate and fails closed on any regression.

Runtime rejections are fail-closed: 409 for a violated invariant, 403 for a denied
write or invoke rule.

SDKs:

- `@bounded-sh/client` for web and React Native.
- `@bounded-sh/server` for Node.
- All packages are `@bounded-sh/*`. Bare `bounded` on npm is unrelated.

Docs: https://bounded.sh/docs and https://bounded.sh/llms.txt
