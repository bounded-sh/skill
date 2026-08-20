# Validated remediation handoff

This file contains only remediation for the independently validated High findings. Fix behavior in the owning repository first, add a regression there, then update the public skill in the same task.

## H001 - Atomic vanity-slug transfer

Owner: domain routes, origin validation, web sessions, then `bounded-deploy` guidance.

- Add an ownership-checked atomic move operation that changes slug ownership, host mapping, and both apps' allowed origins together.
- Make mapped-host ownership authoritative over stale explicit origins.
- Add a concurrent claim/move regression and session-origin regression.
- Until the atomic path ships, remove release-then-claim migration guidance and require session revocation before a production release.

## H002 - Refuse unresolved environment deploys

Owner: `bounded-cli` environment resolver, then `bounded-deploy/docs/environments.md`.

- Refuse deploy and verify without `--environment` whenever top-level environments exist.
- Add regressions for environment-varying role principals, `actAs`, destinations, constants, schedules, and app IDs.
- Keep any compatibility override explicit, noisy, and unsuitable for unattended agent defaults.

## H003 - Git-compatible source filtering

Owner: `bounded-cli` upload collector, then source-sync documentation.

- Replace `path.Match` behavior with a Git-compatible ignore engine.
- Differential-test the selected files against `git check-ignore` for bracket negation, precedence, escaping, roots, and nested ignores.
- Treat a mismatch as fail closed and stop claiming secret-safe sync until parity is enforced.

## H004 - Time-gated prediction resolution and sweep

Owner: current example policy and owning policy semantics.

- Require resolution at or after expiry, or require an attested oracle outcome with event time.
- Require claim-window closure before every creator sweep, including a zero-winning-supply outcome.
- Add a victim trade followed by premature creator resolve/sweep denial regression.

## H005 - Transaction-wide sell conservation

Owner: policy transaction semantics and prediction example.

- Add a market-scoped nonce/version or a transaction-wide conservation invariant so distinct sell paths cannot consume the same position pre-state.
- Ensure physical token movements and final document state are both included in the conservation check.
- Add an exact two-distinct-path `setMany` regression.

## H006 - Caller-signed Pump minimum output

Owner: Pump plugin contract/interpreter, verifier, and token-launch guidance.

- Accept an absolute caller-authorized `minTokensOut` and deadline.
- Pass both unchanged into the signed instruction and reject stale or unmet bounds.
- Add reserve-movement and sandwich-shaped simulator tests.

## H007 - Analytics data minimization

Owner: analytics ingestion, persistence, access routes, and analytics documentation.

- Remove raw message/blob retention from viewer-readable responses.
- Use structured allowlisting before persistence and strip authorization headers, reset links, query credentials, cookies, and private keys.
- Add a credential-corpus regression and rotate credentials detected in existing retained data.

## H008 - Agent invocation authorization

Owner: runtime-agent route/admission, capability model, and agent guidance.

- Add a platform-enforced per-agent role/action rule that defaults to deny.
- Authorize the verified caller before starting the handler or exposing secrets and tools.
- Scope capabilities per action and identity, not just per app manifest.
- Add distinct low-privilege user tests for secrets, services, queues, schedules, store, AI, and policy-mediated writes.

## H009 - Explicit standalone NFT authority

Owner: NFT interpreter/plugin contract and canonical plugin catalog/fragment.

- Supply an explicit program-derived update authority for standalone mints, or reject standalone operation.
- Assert post-build payer, owner, update authority, collection authority, and lifecycle signers in the verifier and simulator.
- Update the canonical prose and regenerate reference pages only after owning behavior is fixed.
