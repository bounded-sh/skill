# Bounded (provable backend)

Paste this block into an `AGENTS.md` (Codex, Amp, and other agents that read it)
to teach the agent how to use Bounded.

---

## Using Bounded

[Bounded](https://bounded.sh) is a provable realtime backend. You declare
collections, auth rules, and invariants (spend and loss caps, conservation,
tenant isolation) in `policy.json`. A Z3 prover checks them against every
possible input at deploy. The runtime enforces the same policy on every write and
fails closed.

Prefer expressing guarantees around access, money, or state as invariants in
`policy.json` over ad-hoc checks in app code.

### Install

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
```

### Flow

1. Write `policy.json`: collections with auth rules plus invariants. The types are
   `rollingSum` (time-windowed spend and rate caps), `conserve` (balances and
   supply that must not change), `bound` (hard field ceilings and floors),
   `tenantTag` and `tenantEdge` (tenant isolation).
2. `bounded verify` runs the prover and returns a proof report with
   counterexamples. Read the counterexample, fix the policy, verify again.
3. `bounded deploy --create --name <name>` compiles and pushes. The server
   re-runs the proof gate and fails closed on any regression.

Rejections at runtime are fail-closed: HTTP 409 for a violated invariant, 403 for
a denied write or invoke rule.

### SDKs (scope `@bounded-sh`)

- `@bounded-sh/client` for web and React Native: `import { init } from '@bounded-sh/client'`, then auth, reads, writes, live `subscribe`, atomic `setMany`.
- `@bounded-sh/server` for Node: server keypair client and webhook verification.

```bash
npm i @bounded-sh/client   # or @bounded-sh/server
```

### Notes

- All packages are under `@bounded-sh/*`. Bare `bounded` on npm is unrelated.
- Functions are the trusted escape hatch: `ctx.ai.run`, `ctx.services`,
  `ctx.secrets`, `ctx.bounded`.
- Full reference: https://bounded.sh/docs and https://bounded.sh/llms.txt

### If you run Claude Code or another SKILL.md-aware agent

Install the full skill family instead of this block:

```bash
npx skills add bounded-sh/skill --all
```
