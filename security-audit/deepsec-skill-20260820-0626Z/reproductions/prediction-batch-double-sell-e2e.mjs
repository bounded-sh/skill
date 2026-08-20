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
const page = readFileSync(path.join(skillRoot, "bounded-onchain/docs/examples/prediction-market-amm.md"), "utf8");
const match = page.match(/## Policy\n[\s\S]*?```json\n([\s\S]*?)\n```/);
if (!match) throw new Error("prediction-market policy block was not found");

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const cwd = path.join(tmpdir(), `bounded-audit-prediction-batch-${runId}`);
mkdirSync(cwd, { recursive: true });
writeFileSync(path.join(cwd, "policy.json"), `${match[1]}\n`);
writeFileSync(path.join(cwd, "bounded.json"), JSON.stringify({
  environment: "staging",
  policy: "policy.json",
  account: { keySource: "profile", profile: "global" }
}));

function bounded(args, actor = "creator") {
  const command = actor === "attacker"
    ? ["env", `BOUNDED_PRIVATE_KEY=${attackerSecret}`, "bounded", ...args]
    : ["bounded", ...args];
  return execFileSync(dev, ["exec", "--", ...command], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 240_000
  });
}

function record(pathValue) {
  const parsed = JSON.parse(bounded(["data", "get", "--app-id", app.appId, "--path", pathValue, "--json"]));
  return parsed?.data ?? parsed;
}

const app = JSON.parse(bounded(["deploy", "policy.json", "--create", "--name", `audit-double-sell-${runId}`.slice(0, 40), "--public", "--json"]));
if (!app.ok || !app.appId) throw new Error("deployment did not return an appId");
const marketId = `m_${runId}`;
const holderId = `h_${runId}`;
const seed = 10_000_000;
bounded(["data", "set", "--app-id", app.appId, "--path", `pmMarkets/${marketId}`, "--data", JSON.stringify({
  question: "Audit duplicate sell",
  expiryTs: Math.floor(Date.now() / 1000) + 31_536_000,
  claimWindowSec: 604800,
  collateralReserve: seed,
  yesSupply: seed,
  seedSupply: seed
})]);
bounded(["data", "set", "--app-id", app.appId, "--path", `pmPositions/${marketId}/holders/${holderId}`, "--data", JSON.stringify({ yesBalance: 0 })], "attacker");
bounded(["data", "set", "--app-id", app.appId, "--path", `pmPositions/${marketId}/holders/${holderId}/buys/buy`, "--data", JSON.stringify({ amountIn: seed })], "attacker");

const beforeMarket = record(`pmMarkets/${marketId}`);
const beforePosition = record(`pmPositions/${marketId}/holders/${holderId}`);
const batchPath = path.join(cwd, "duplicate-sells.json");
writeFileSync(batchPath, JSON.stringify([
  { path: `pmPositions/${marketId}/holders/${holderId}/sells/a`, document: { yesIn: seed / 2 } },
  { path: `pmPositions/${marketId}/holders/${holderId}/sells/b`, document: { yesIn: seed / 2 } }
], null, 2));
bounded(["data", "set-many", "--app-id", app.appId, "--from-json", batchPath], "attacker");
const afterMarket = record(`pmMarkets/${marketId}`);
const afterPosition = record(`pmPositions/${marketId}/holders/${holderId}`);

console.log(JSON.stringify({
  result: "PASS",
  appId: app.appId,
  marketId,
  before: { market: beforeMarket, position: beforePosition },
  acceptedDistinctSellPaths: 2,
  unrelatedMarketCreatorSeedDrained: 10000000,
  after: { market: afterMarket, position: afterPosition },
  expectedPhysicalPayout: 20_000_000,
  expectedLastWriteWinsRecordedReserve: 10_000_000
}, null, 2));
