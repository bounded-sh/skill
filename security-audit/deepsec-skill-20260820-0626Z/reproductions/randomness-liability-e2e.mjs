#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const skillRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const monorepo = process.env.BOUNDED_MONOREPO;
if (!monorepo) throw new Error("BOUNDED_MONOREPO is required");
const dev = path.join(monorepo, "dev");
const require = createRequire(path.join(monorepo, "packages/cdk/package.json"));
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default;
const attackerSecret = bs58.encode(Keypair.generate().secretKey);
const victimSecret = bs58.encode(Keypair.generate().secretKey);
const page = readFileSync(path.join(skillRoot, "bounded-onchain/docs/examples/randomness-coin-flip.md"), "utf8");
const match = page.match(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/);
if (!match) throw new Error("coin-flip policy block was not found");
const policy = JSON.parse(match[1]);
policy.auth = { ...(policy.auth ?? {}), wallets: true };

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const cwd = path.join(tmpdir(), `bounded-audit-randomness-${runId}`);
mkdirSync(cwd, { recursive: true });
writeFileSync(path.join(cwd, "policy.json"), `${JSON.stringify(policy, null, 2)}\n`);
writeFileSync(path.join(cwd, "bounded.json"), JSON.stringify({
  environment: "staging",
  policy: "policy.json",
  account: { keySource: "profile", profile: "global" }
}));

function bounded(args, secret = null) {
  const command = secret
    ? ["env", `BOUNDED_PRIVATE_KEY=${secret}`, "bounded", ...args]
    : ["bounded", ...args];
  return execFileSync(dev, ["exec", "--", ...command], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 240_000
  });
}

const attacker = JSON.parse(bounded(["whoami", "--json"], attackerSecret));
const victim = JSON.parse(bounded(["whoami", "--json"], victimSecret));
const app = JSON.parse(bounded(["deploy", "policy.json", "--create", "--name", `audit-liability-${runId}`.slice(0, 40), "--public", "--json"]));
if (!app.ok || !app.appId) throw new Error("deployment did not return an appId");

const initialHouse = 200_000_000;
const stake = 100_000_000;
bounded(["data", "set", "--app-id", app.appId, "--path", `houseDeposits/d_${runId}`, "--data", JSON.stringify({ amount: initialHouse })]);
for (const [index, actor, secret] of [
  [0, victim, victimSecret],
  [1, attacker, attackerSecret],
  [2, attacker, attackerSecret]
]) {
  bounded(["data", "set", "--app-id", app.appId, "--path", `flips/f_${runId}_${index}`, "--data", JSON.stringify({
    player: actor.address,
    choice: Number(index) % 2,
    stake,
    settled: false
  })], secret);
}

const physicalPotAfterDeposits = initialHouse + 3 * stake;
const maximumPayoutLiability = 3 * 2 * stake;
if (maximumPayoutLiability <= physicalPotAfterDeposits) throw new Error("test setup did not create an undercollateralized state");

console.log(JSON.stringify({
  result: "PASS",
  appId: app.appId,
  acceptedUnsettledFlips: 3,
  victimFlips: 1,
  attackerFlips: 2,
  initialHouse,
  stakePerFlip: stake,
  physicalPotAfterDeposits,
  maximumPayoutLiability,
  shortfall: maximumPayoutLiability - physicalPotAfterDeposits
}, null, 2));
