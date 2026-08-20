#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const monorepo = process.env.BOUNDED_MONOREPO;
if (!monorepo) throw new Error("BOUNDED_MONOREPO is required");
const dev = path.join(monorepo, "dev");
const require = createRequire(path.join(monorepo, "packages/cdk/package.json"));
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default;
const attackerKeypair = Keypair.generate();
const attackerSecret = bs58.encode(attackerKeypair.secretKey);
const attackerAddress = attackerKeypair.publicKey.toBase58();

const DENIAL = /\[policy_denied\]|\[invariant_violation\]|403 Policy failed|policy.{0,20}(?:denied|reject)/i;

function runBounded(args, cwd, actor = "victim", allowFailure = false) {
  const inner = actor === "attacker"
    ? ["env", `BOUNDED_PRIVATE_KEY=${attackerSecret}`, "bounded", ...args]
    : ["bounded", ...args];
  try {
    const output = execFileSync(dev, ["exec", "--", ...inner], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 240_000,
    });
    return { ok: true, output };
  } catch (error) {
    const result = { ok: false, output: `${error.stdout ?? ""}\n${error.stderr ?? ""}` };
    if (!allowFailure) throw new Error(result.output.slice(0, 1000));
    return result;
  }
}

function extractPolicy(page) {
  const text = readFileSync(path.join(root, page), "utf8");
  const match = text.match(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`${page}: missing Policy JSON fence`);
  const policy = JSON.parse(match[1]);
  // The local CLI authenticates its temporary victim and attacker identities
  // through wallet login. Some examples omit this transport prerequisite even
  // though their rules and hooks use @user.address. Enabling wallet login here
  // changes no collection rule, hook argument, invariant, or signer binding.
  policy.auth = { ...(policy.auth ?? {}), wallets: true };
  return `${JSON.stringify(policy, null, 2)}\n`;
}

function substitute(value, victim, runId) {
  if (typeof value === "string") return value.replaceAll("VICTIM_ID", victim.id).replaceAll("VICTIM_ADDRESS", victim.address).replaceAll("ATTACKER_ADDRESS", attackerAddress).replaceAll("RUN_ID", runId);
  if (Array.isArray(value)) return value.map((item) => substitute(item, victim, runId));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, victim, runId)]));
  return value;
}

const cases = [
  {
    name: "marketplace owner isolation",
    page: "bounded-backend/docs/examples/marketplace.md",
    setup: [
      { path: "sellers/VICTIM_ID/listings/l_RUN_ID", data: { seller: "VICTIM_ID", title: "Victim listing", priceUsd: 120, active: true } },
      { path: "buyers/VICTIM_ID/orders/victim_RUN_ID", data: { buyer: "VICTIM_ID", listingRef: "l_RUN_ID", seller: "VICTIM_ID", amountUsd: 120 } },
    ],
    attacks: [
      { name: "attacker cannot rewrite victim listing", path: "sellers/VICTIM_ID/listings/l_RUN_ID", data: { seller: "VICTIM_ID", title: "Attacker rewrite", priceUsd: 1, active: true } },
      { name: "attacker cannot consume victim spend cap", path: "buyers/VICTIM_ID/orders/attacker_RUN_ID", data: { buyer: "VICTIM_ID", listingRef: "l_RUN_ID", seller: "VICTIM_ID", amountUsd: 120 } },
    ],
    privateReads: [{ name: "attacker cannot read victim order", path: "buyers/VICTIM_ID/orders/victim_RUN_ID" }],
  },
  {
    name: "escrow release ownership",
    page: "bounded-onchain/docs/examples/escrow.md",
    setup: [{ path: "escrows/e_RUN_ID", data: { seller: "11111111111111111111111111111111", amount: 1000, released: false } }],
    attacks: [{ name: "attacker cannot release victim escrow", path: "escrows/e_RUN_ID", data: { released: true } }],
  },
  {
    name: "isolated vault ownership",
    page: "bounded-onchain/docs/examples/isolated-vault.md",
    setup: [
      { path: "vaults/v_RUN_ID", data: { owner: "VICTIM_ADDRESS" } },
      { path: "vaults/v_RUN_ID/deposits/victim", data: { amount: 5 } },
    ],
    attacks: [{ name: "attacker cannot withdraw victim vault", path: "vaults/v_RUN_ID/withdrawals/attacker", data: { amount: 1, to: "ATTACKER_ADDRESS" } }],
  },
  {
    name: "liquidity position ownership",
    page: "bounded-onchain/docs/examples/cp-amm-liquidity-positions.md",
    setup: [{ path: "positions/p_RUN_ID", data: { creator: "VICTIM_ADDRESS" } }],
    attacks: [{ name: "attacker cannot withdraw victim position", path: "positions/p_RUN_ID/withdrawals/attacker", data: { amountA: 1, amountB: 1 } }],
  },
  {
    name: "NFT collection creator authority",
    page: "bounded-onchain/docs/examples/nft-collection.md",
    setup: [{ path: "collections/c_RUN_ID", data: { creator: "VICTIM_ADDRESS", name: "Victim Collection", uri: "https://example.com/c.json", createdAt: 1755000000 } }],
    attacks: [{ name: "attacker cannot mint into victim collection", path: "nfts/n_RUN_ID", data: { collectionId: "c_RUN_ID", owner: "ATTACKER_ADDRESS", name: "Forged NFT", uri: "https://example.com/n.json", mintedAt: 1755000100 } }],
  },
  {
    name: "prediction market resolver authority",
    page: "bounded-onchain/docs/examples/prediction-market-amm.md",
    setup: [{ path: "pmMarkets/m_RUN_ID", data: { question: "Victim market", expiryTs: 4102444800, claimWindowSec: 604800, collateralReserve: 10000000, yesSupply: 10000000, seedSupply: 10000000 } }],
    attacks: [{ name: "attacker cannot resolve victim market", path: "pmResolves/m_RUN_ID", data: { outcome: "YES" } }],
  },
  {
    name: "staking vault ownership",
    page: "bounded-onchain/docs/examples/staking-lock-vault.md",
    setup: [{ path: "stakes/s_RUN_ID", data: { amount: 2000000, lockedUntil: 0 } }],
    attacks: [{ name: "attacker cannot unstake victim position", path: "stakes/s_RUN_ID", data: { amount: 0 } }],
  },
  {
    name: "Token-2022 withdraw authority",
    page: "bounded-onchain/docs/examples/token2022-extensions.md",
    setup: [{ path: "feeTokens/f_RUN_ID", data: { name: "Victim Fee Token", symbol: "VFT", uri: "https://example.com/f.json", supply: 1000000, feeBps: 100, maxFee: 1000 } }],
    attacks: [{ name: "attacker cannot select victim fee-withdrawal authority", path: "feeWithdrawals/w_RUN_ID", data: { tokenId: "f_RUN_ID", receiver: "ATTACKER_ADDRESS", source: "ATTACKER_ADDRESS" } }],
  },
];

const results = [];
for (const test of cases) {
  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
  const victimDir = path.join(tmpdir(), `bounded-audit-victim-${runId}`);
  const attackerDir = path.join(tmpdir(), `bounded-audit-attacker-${runId}`);
  mkdirSync(victimDir, { recursive: true });
  mkdirSync(attackerDir, { recursive: true });
  const policy = extractPolicy(test.page);
  writeFileSync(path.join(victimDir, "policy.json"), policy);
  writeFileSync(path.join(victimDir, "bounded.json"), JSON.stringify({ environment: "staging", policy: "policy.json", account: { keySource: "profile", profile: "global" } }));
  writeFileSync(path.join(attackerDir, "policy.json"), policy);
  writeFileSync(path.join(attackerDir, "bounded.json"), JSON.stringify({ environment: "staging", policy: "policy.json", account: { keySource: "env" } }));
  try {
    const victim = JSON.parse(runBounded(["whoami", "--json"], victimDir).output.trim());
    const deployed = JSON.parse(runBounded(["deploy", "policy.json", "--create", "--name", `audit-${runId}`.slice(0, 40), "--public", "--json"], victimDir).output.trim());
    if (!deployed.ok || !deployed.appId) throw new Error("deployment did not return an appId");
    for (const step of test.setup) {
      const pathValue = substitute(step.path, victim, runId);
      const data = JSON.stringify(substitute(step.data, victim, runId));
      runBounded(["data", "set", "--app-id", deployed.appId, "--path", pathValue, "--data", data], victimDir);
    }
    for (const attack of test.attacks ?? []) {
      const attackPath = substitute(attack.path, victim, runId);
      const attackData = JSON.stringify(substitute(attack.data, victim, runId));
      const attempt = runBounded(["data", "set", "--app-id", deployed.appId, "--path", attackPath, "--data", attackData], attackerDir, "attacker", true);
      results.push({ name: attack.name, page: test.page, appId: deployed.appId, result: !attempt.ok && DENIAL.test(attempt.output) ? "PASS" : "FAIL", detail: !attempt.ok ? attempt.output.trim().slice(0, 240) : "attacker write unexpectedly accepted" });
    }
    for (const read of test.privateReads ?? []) {
      const readPath = substitute(read.path, victim, runId);
      const attempt = runBounded(["data", "get", "--app-id", deployed.appId, "--path", readPath, "--json"], attackerDir, "attacker", true);
      let hidden = !attempt.ok && DENIAL.test(attempt.output);
      if (attempt.ok) {
        const parsed = JSON.parse(attempt.output.trim());
        hidden = parsed == null || (Array.isArray(parsed) && parsed.length === 0) || (typeof parsed === "object" && (Object.keys(parsed).length === 0 || (Object.hasOwn(parsed, "data") && parsed.data == null)));
      }
      results.push({ name: read.name, page: test.page, appId: deployed.appId, result: hidden ? "PASS" : "FAIL", detail: hidden ? "denied read returned no document" : "attacker read returned victim data" });
    }
  } catch (error) {
    results.push({ name: test.name, page: test.page, appId: null, result: "FAIL", detail: String(error.message).slice(0, 500) });
  }
}

const pass = results.filter((result) => result.result === "PASS").length;
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), attackerAddress, pass, total: results.length, results }, null, 2));
process.exit(pass === results.length ? 0 : 1);
