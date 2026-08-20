# Independently confirmed Critical and High findings

Pinned skill commit: `54b05647169d6ed8b011db0c7a7cc9cc91cc0c53`

Confirmed totals: **0 Critical, 9 High**. Each item below passed the ten-part finding gate, was retraced against the pinned owning implementation, and received an official DeepSec `gpt-5.6-sol` xhigh true-positive verdict. Finding identifiers beginning `H` are normalized audit findings; the DeepSec identifiers preserve machine-state traceability.

## H001 - Releasing and reclaiming a vanity slug permits session and domain takeover

**Severity:** High

**Skill evidence and context:** `bounded-deploy/docs/domains.md:32-38` says a claimed slug wires `allowedOrigins`; lines 52-63 give a complete rebuild migration sequence that releases the old app before claiming the new app. This is presented as executable deployment guidance for an app owner preserving a stable public URL. The protected assets are the app's browser session and authenticated API authority.

**Attacker and input:** An unrelated authenticated app owner watches for or races a released slug and claims the same label for the attacker's app. The attacker then serves content from that origin.

**Reachable path:** The old app's slug release deletes the hostname mapping and makes the label claimable. The documented gap occurs before the new app claims it. In the pinned domain route, release clears the slug and mapping before origin cleanup, and cleanup is best effort (`packages/cdk/cloudflare/bounded-platform/src/app/bounded-domains-routes.ts:417-453`). The pinned origin gate treats a stale explicit allowlist match as sufficient even when the host map points to a different app (`packages/cdk/cloudflare/bounded-betterauth/src/app-origins.ts:318-326`). Browser session material is kept in local storage and attached to app requests (`packages/tarobase-core/src/utils/web-session-manager.ts:16-31,120-128,299-310`).

**Owning implementation inspected:** Domain claim/release routes, BetterAuth origin resolution, static-host mapping, web session storage and refresh transport, and session invalidation behavior in the pinned monorepo.

**Defenses checked:** App ownership is required for releasing the victim's label, but no victim compromise is needed because the victim follows the documented migration. Claim ownership is serialized, but the gap deliberately frees the name. Host-map validation does not override a stale allowlist entry. The page has no atomic move command, reservation token, maintenance-host instruction, or instruction to revoke sessions before release.

**Boundary and impact:** The attacker crosses from control of an unrelated app into an origin trusted by the victim app. Existing or subsequently issued browser credentials exposed to attacker-controlled content can enable account and app takeover.

**Validation:** A fresh local-stack reproduction used victim app `27c5dbfc143dd7fb48486b4d`, attacker app `03705639e362a9898f5bc405`, and slug `audit-move-mt1eqgcw6237`. The attacker claimed the released label before the documented new-app claim. A focused proof against the pinned origin gate then showed the reclaimed hostname remained accepted for the victim app through the stale allowlist. DeepSec IDs: `finding_0af67c5530ef54bc`, `finding_c9d6b734fc80501d`.

**Fix:** Replace release-then-claim guidance and implementation with an atomic ownership-checked slug transfer that updates host mapping and origins in one transaction. Until that exists, instruct users to use a non-reusable maintenance origin and revoke affected sessions before releasing a production slug.

## H002 - Bare deploy silently promotes environment-specific authority into another app

**Severity:** High

**Skill evidence and context:** `bounded-deploy/docs/environments.md:12-23,41-43,91-114` supplies a complete multi-environment policy and says an environment is selected with `--environment`. The same page also says the CLI strips the authoring-only `environments` block. The protected asset is the production app data and function authority selected through environment constants.

**Attacker and input:** A lower-privileged staging principal already named in an environment override needs no deployment authority. The app owner or agent invokes the otherwise accepted bare command `bounded deploy ./policy.json` against the production target.

**Reachable path:** In the pinned CLI, environment constants are resolved only when the flag is present, while an unselected environments block is stripped before upload (`internal/cli/policy.go:116-147`; `internal/cli/environments.go:50-100`). When base constants contain a staging principal, bare deployment to the production app preserves that principal in production roles and rules.

**Owning implementation inspected:** CLI environment selection, constant overlay, target-app resolution, policy stripping and compilation, deployment request construction, and server policy verification.

**Defenses checked:** The CLI refuses an env-blind deploy only if an environment-scoped function is present. The documented example has no such forcing function. Server verification proves the resolved policy it receives and cannot infer that the surviving principal belongs to staging. App targeting and role checks do not distinguish the stale cross-environment principal.

**Boundary and impact:** A staging identity crosses into production authorization and can read or mutate production resources according to the promoted role, enabling cross-account data access and app takeover.

**Validation:** A fresh local deployment to app `b0c30767cb63cef7802e0e8a` omitted `--environment`. The CLI stripped environments while retaining staging principal `BDXnnDpsuLmsscBeiuAK4JBQVScyGwp5dHSBJppPyA9J`; that unrelated identity then read `victim-production-secret` through the resulting production `read:*` role. A pinned CLI regression test also reproduced the transformation. DeepSec ID: `finding_1e581f41b1bfe0cf`.

**Fix:** Refuse deploy and verify without `--environment` whenever an `environments` block exists. If backwards compatibility requires a bare mode, require an explicit `--allow-unresolved-environments` acknowledgement and reject environment-varying identity or authority constants by default.

## H003 - Source sync can upload Git-ignored credentials despite the documented secret-safe guarantee

**Severity:** High

**Skill evidence and context:** `bounded-deploy/docs/source-sync.md:37-38` describes CLI packaging as a secret-safe filtered upload. The guidance is a complete executable source deployment path, and agents are expected to rely on their repository ignore rules to exclude local credentials.

**Attacker and input:** An attacker who can read deployed source artifacts, build output, logs, or a downstream source bundle does not need write access. The triggering developer-controlled state is a Git-valid ignore pattern containing a negated bracket class, such as `local.[!e]*`, and an ignored credential file such as `local.prod`.

**Reachable path:** The pinned CLI advertises Git ignore semantics but evaluates patterns with Go `path.Match` (`internal/cli/upload_ignore.go:11-25,172,195`). Git treats `[!e]` as a negated class, while Go's matcher does not implement that spelling as Git does. The collector therefore includes a file that `git check-ignore` excludes, and the source sync packages it.

**Owning implementation inspected:** CLI ignore parsing and matching, source artifact collection, filename denylist, content scanning, source push packaging, and source-read publication access.

**Defenses checked:** Default secret filename filters do not cover arbitrary application-specific names. The file is tracked neither by Git nor by the audit worktree. Upload packaging trusts the mismatched matcher, and no content scanner or final Git-ignore reconciliation closes the path.

**Boundary and impact:** A private credential or key intentionally excluded from source control crosses into a remotely accessible deployment artifact, enabling credential theft and subsequent account, service, or deployment takeover.

**Validation:** The pinned CLI regression `TestAuditGitIgnoreNegatedClassLeaksIgnoredFile` confirmed Git ignored `local.prod` under `local.[!e]*` while the upload collector included it. DeepSec ID: `finding_f089cbe20db7be8b`.

**Fix:** Use a Git-compatible ignore implementation and add differential contract tests against `git check-ignore` for bracket negation, anchoring, directory rules, escaping, and precedence. Remove the secret-safe claim until parity is enforced.

## H004 - Prediction-market creator can resolve early and sweep an unrelated user's collateral

**Severity:** High

**Skill evidence and context:** The complete deployable policy in `bounded-onchain/docs/examples/prediction-market-amm.md:84-93` allows creator resolution but does not require expiry. Lines 113-117 allow an exact-reserve sweep whenever `winningSupply == 0`; line 134 describes creator resolution as the normal flow. The protected asset is collateral deposited by traders.

**Attacker and input:** The market creator is lower-privileged relative to an unrelated trader's deposited collateral. The creator sets outcome `NO` immediately after a victim trade, which hook-derives `winningSupply` to zero, then creates the documented sweep.

**Reachable path:** Both writes satisfy the active policy. The first closes trading and records zero winners; the second sees zero winning supply and transfers the full reserve to the creator without waiting for `expiryTs + claimWindowSec`.

**Owning implementation inspected:** Policy rule evaluation, hook staging, document mutation, token balance and transfer handling, onchain planner/interpreter, and the exact extracted policy E2E path.

**Defenses checked:** Creator identity and create-once resolution are enforced, but creator is the attacker in this boundary. Immutable fields and hook-derived winning supply prevent client forgery but actively enable the zero-supply branch. Balance and exact-reserve checks ensure the theft amount is executable rather than preventing it.

**Boundary and impact:** A market creator irreversibly takes unrelated users' deposited funds before the promised market expiry.

**Validation:** On fresh app `6026dc048b8b32a0708f3c74`, a victim deposited 10,000,000 units into a future-dated market. The creator immediately resolved `NO` and swept 20,000,000 units, leaving `collateralReserve` zero before expiry. DeepSec ID: `finding_5bed72968ee3f7ae`.

**Fix:** Require `@time.now >= expiryTs` for resolution, or require a trusted oracle outcome with an attested event time. Require the claim window to close before any creator sweep regardless of winning supply.

## H005 - Two distinct sell paths in one batch pay from the same pre-state and drain pooled collateral

**Severity:** High

**Skill evidence and context:** The same complete prediction-market example accepts independently keyed sell requests at `bounded-onchain/docs/examples/prediction-market-amm.md:67-80` and calculates each payout from collection pre-state. The surrounding solvency claim at lines 141-142 assumes reserves and positions move consistently through hooks. The protected assets include the creator seed and collateral of other traders in the pooled token account.

**Attacker and input:** An authenticated trader controls two distinct sell-request paths submitted in one `setMany` batch after acquiring a single position.

**Reachable path:** Both create rules and hooks observe the same pre-batch balance and reserve. Each request validates the full position and stages the full quote. Because the paths are distinct, create-once path protection does not conflict; both physical transfers execute, while document updates collapse to one final reserve and position state.

**Owning implementation inspected:** Batch snapshot semantics, duplicate-path checks, hook evaluation, staged document update maps, token transfer accumulation, transaction planner, and interpreter execution ordering.

**Defenses checked:** Per-path immutability, caller ownership, exact quote, token balance, product invariant, and hook-only state all pass. The missing defense is a transaction-wide conservation invariant or a single-consumption marker whose write conflicts across distinct request paths.

**Boundary and impact:** An attacker sells one position twice and irreversibly drains funds contributed by an unrelated creator or other traders.

**Validation:** On fresh app `0c6f313db7f50c32514c1e79`, the attacker bought 5,000,000 YES and submitted two distinct sells in one accepted batch. Each paid the 10,000,000-unit pre-state quote. The physical payout was 20,000,000, draining the creator's 10,000,000-unit seed, while final recorded reserve was still 10,000,000. DeepSec ID: `finding_76269b0b72d8de3c`.

**Fix:** Enforce transaction-level token and document conservation, or serialize all sells through one market-scoped nonce/version that every sell must consume exactly once. Add a two-distinct-path batch regression to the example E2E suite.

## H006 - Pump buy slippage protection is recomputed from attacker-moved execution reserves

**Severity:** High

**Skill evidence and context:** The complete token-launch policy at `bounded-onchain/docs/examples/token-launch.md:54-68,98` asks the buyer for `slippageBps` and says the buyer signs and spends their own SOL. It does not capture a quote, minimum output, deadline, or protected transaction intent. The protected asset is the buyer's SOL and expected token output.

**Attacker and input:** A mempool or ordering attacker moves the bonding-curve reserves before the victim transaction executes. The victim signed only SOL input and slippage basis points.

**Reachable path:** The pinned Pump interpreter obtains a fresh quote from current execution reserves, then computes the minimum output from that same fresh quote before CPI (`packages/cdk/layers/sol-helper/nodejs/sol-layer/programs/tarobase/src/interpreter.rs:14318-14323,14358`). The computed minimum therefore bounds only plugin/CPI deviation after attacker movement, not price movement since the victim authorized the transaction.

**Owning implementation inspected:** Public plugin signature, policy hook argument construction, account resolution, Pump quote arithmetic, CPI instruction bytes, signer/source binding, destination ATA handling, and deploy-verifier capability status.

**Defenses checked:** Source is bound to the caller and the caller signs. The basis-point cap, current-reserve quote, CPI minimum, and destination ATA all work as implemented. None commits the victim to a pre-attack minimum token amount or expiry.

**Boundary and impact:** An ordering attacker can sandwich or front-run a documented buy and cause irreversible execution at a materially worse price while every current check passes.

**Validation:** A focused proof against the pinned formula moved the expected quote from 90 with an authorization-time minimum of 85 to an execution quote of 23 and a recomputed minimum of 21. The latter remains accepted. The representative token-launch agent evaluation reproduced the same unsafe shape. DeepSec ID: `finding_d85c66d684bb089b`.

**Fix:** Make the caller sign an absolute `minTokensOut` and a deadline derived from a displayed quote. Pass that bound unchanged to the onchain instruction and reject if it cannot be met.

## H007 - Analytics viewer can recover reset credentials and bearer tokens from retained blobs

**Severity:** High

**Skill evidence and context:** `bounded/docs/analytics.md:32-45,59-60` promises scrubbing before analytics retention. Analytics access is explicitly granted to a lower-privileged viewer role. The protected assets are reset credentials, API bearer tokens, and the accounts or services they authorize.

**Attacker and input:** A legitimate analytics viewer reads an error or event blob containing a short reset path or an `Authorization: Bearer ...` value emitted by the application.

**Reachable path:** The pinned analytics sanitizer truncates and applies narrow regular expressions but preserves the reproduced credential shapes (`packages/cdk/cloudflare/bounded-router/src/analytics.ts:497-569,750-767`). The analytics response includes retained blob fields (`packages/cdk/cloudflare/bounded-platform/src/app/client-app-analytics.ts:504-549`), and app-access authorization permits viewers with `analytics:view` (`packages/cdk/cloudflare/bounded-platform/src/app/routes.ts:8389-8407`; `packages/cdk/cloudflare/bounded-platform/src/app/access-model.ts:99-104`).

**Owning implementation inspected:** Browser and edge sanitization, analytics ingestion and persistence shape, aggregation queries, viewer capability presets, authenticated read route, and response serialization.

**Defenses checked:** The route requires app membership and analytics permission, so the attacker is a lower-privileged project viewer rather than the public. Length truncation, email and identifier replacement, and the documented keyword scrub were exercised. Short path tokens and header-style bearer values survive.

**Boundary and impact:** A viewer crosses from observability-only access to live credential possession, enabling password reset, API account takeover, or service actions with the leaked bearer authority.

**Validation:** The pinned sanitizer retained both `/reset/Reset_A7b9` and `Authorization: Bearer sk-audit-only-123456` in a focused source-level reproduction. DeepSec ID: `finding_c4bf0d86b113087a`.

**Fix:** Never retain raw error/event blobs for viewer access. Apply structured allowlisting before persistence, remove authorization headers and URL secrets at ingestion, rotate any detected credentials, and add adversarial credential-corpus tests.

## H008 - Any authenticated app user can invoke secret-bearing agent capabilities without action authorization

**Severity:** High

**Skill evidence and context:** `bounded-backend/docs/agents-flue.md:33-46,109-126` documents sealed capabilities including app secrets, services, queues, schedules, data, and AI, then gives the invocation endpoint and token flow without an action authorization gate. `bounded-backend/docs/backend-runtime.md:91-125` provides a secret-bearing `onInvoke` handler; its authorization warning at lines 127-166 is limited to `kind: backend` fetch handlers. `bounded-backend/docs/functions-graduation.md:45-70` reinforces that hosted agents inherit auth. These are complete public starting points for app-authenticated agents.

**Attacker and input:** Any unrelated, minimally authenticated user of the same app sends attacker-controlled input to the documented agent invocation route.

**Reachable path:** The pinned host verifies that the JWT belongs to the app, checks billing and declared capability ceilings, and forwards the identity to the agent handler, but makes no role, ownership, or action authorization decision (`packages/cdk/cloudflare/bounded-host/src/index.ts:17342-17414,18993-19065`). The invoked handler can read declared secrets and exercise declared app-wide Flue capabilities.

**Owning implementation inspected:** Agent HTTP admission, JWT/app verification, runtime dispatch, generated handler wrapper, sealed Flue environment, store/secrets/services/queue/schedule/AI capabilities, billing limits, and policy-mediated data gateway.

**Defenses checked:** JWT, app match, billing, capability declarations, provider controls, and downstream `ctx.bounded` policy are enforced. Direct writes and a runtime policy write were denied in validation, confirming policy remains a defense for policy-mediated data. It does not prevent handler code from using secrets, external services, queues, schedules, or other declared capabilities, nor does the guidance require `onInvoke` to authorize the caller before doing so.

**Boundary and impact:** A low-privilege app user crosses into privileged app capabilities and can trigger service-key-backed operations, secret-authenticated external actions, or agent-controlled transactions, enabling account or service takeover and unauthorized execution.

**Validation:** On fresh app `3811b24da4ec6b7556326d9b`, an unrelated authenticated wallet was denied a direct policy write but successfully invoked the documented `kind: agent` handler, mutated its app-scoped runtime store, and caused access to a declared audit-only secret. A downstream `ctx.bounded` write remained denied, precisely locating the missing boundary at invocation/capability admission. DeepSec IDs: `finding_c25682bb8a82d60e`, `finding_cd64dd5b1dd92ac9`, `finding_0cbdec87fa68e83f`.

**Fix:** Add platform-enforced per-agent invocation authorization tied to roles/actions, defaulting to deny. Require public guidance and templates to check the verified caller before secret or tool access, and offer least-privilege capability grants per action rather than per app.

## H009 - Standalone NFT caller becomes update authority despite the program-managed claim

**Severity:** High

**Skill evidence and context:** The curated canonical fragment `bounded-onchain/docs/plugins/_fragments/NFTPlugin.md:4` states that assets created through `createCollection` or `mintNFT` are update-authority-signed by the program. The generated signature permits `mintNFT(source, owner, name, uri, collection?)` and makes collection optional (`bounded-onchain/docs/plugin-signatures.md:87`). An agent can therefore reasonably use the complete standalone mint path while relying on program-managed authority. The protected asset is NFT ownership and lifecycle authority.

**Attacker and input:** An untrusted caller invokes an otherwise permitted standalone mint with their wallet as payer/source and a different intended owner, omitting the optional collection.

**Reachable path:** The pinned runtime makes the caller the payer, supplies the requested destination owner, and in the standalone branch omits both authority and update authority (`packages/cdk/layers/sol-helper/nodejs/sol-layer/programs/tarobase/src/interpreter.rs:9039-9230`). The locked `mpl-core` 0.10.0 contract defaults omitted standalone update authority to the payer. That authority is accepted for lifecycle operations including transfer and burn.

**Owning implementation inspected:** Canonical fragment and generated signature, plugin catalog capability status, policy hook parser, NFT CPI builder and signer seeds, collection and standalone branches, transfer/burn delegate authority, CLI deploy verification, `Cargo.lock`, and the locked Metaplex create contract test.

**Defenses checked:** Caller/source confinement, requested owner, metadata, optional collection handling, policy verification, and signer construction were inspected. The collection branch has program/collection authority, but it is not reached when the documented optional collection is absent. Neither policy verification nor transaction simulation reports the authority mismatch.

**Boundary and impact:** The payer crosses from funding a mint into control over an NFT assigned to another user and can later transfer or burn it, causing irreversible asset loss or takeover.

**Validation:** A focused policy using the public standalone `mintNFT` signature passed the pinned CLI's `solana_devnet` deploy-safety gate with zero schema and proof failures. The pinned runtime call sequence and locked dependency test establish that omitted authority becomes payer and that this authority controls transfer/burn. No live-network transaction was performed. DeepSec ID: `finding_20aefcc965bde502`.

**Fix:** Set an explicit program-derived update authority in every standalone mint, or reject standalone minting until such authority is available. Update the fragment to distinguish collection and standalone authority, and add a signer/authority assertion to verification and simulator tests.
