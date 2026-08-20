#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const monorepo = process.env.BOUNDED_MONOREPO;
if (!monorepo) throw new Error("BOUNDED_MONOREPO is required");
const dev = path.join(monorepo, "dev");
const require = createRequire(path.join(monorepo, "packages/cdk/package.json"));
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58").default;
const attacker = Keypair.generate();
const attackerSecret = bs58.encode(attacker.secretKey);
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const slug = `audit-move-${runId}`.toLowerCase();
const victimDir = path.join(tmpdir(), `bounded-audit-slug-victim-${runId}`);
const attackerDir = path.join(tmpdir(), `bounded-audit-slug-attacker-${runId}`);
const policy = JSON.stringify({
  "public/$id": {
    fields: { value: "String" },
    rules: { read: "true", create: "false", update: "false", delete: "false" }
  }
}, null, 2);

for (const [dir, account] of [
  [victimDir, { keySource: "profile", profile: "global" }],
  [attackerDir, { keySource: "env" }]
]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "policy.json"), `${policy}\n`);
  writeFileSync(path.join(dir, "bounded.json"), JSON.stringify({ environment: "staging", policy: "policy.json", account }));
}

function bounded(args, cwd, actor = "victim") {
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

function createApp(cwd, actor, label) {
  const result = JSON.parse(bounded(["deploy", "policy.json", "--create", "--name", `audit-${label}-${runId}`.slice(0, 40), "--public", "--json"], cwd, actor));
  if (!result.ok || !result.appId) throw new Error(`${label} deployment did not return an appId`);
  return result.appId;
}

const victimApp = createApp(victimDir, "victim", "slug-victim");
const attackerApp = createApp(attackerDir, "attacker", "slug-attacker");
bounded(["domains", "slug", slug, "--app-id", victimApp], victimDir);
bounded(["domains", "slug", "--release", "--app-id", victimApp], victimDir);
bounded(["domains", "slug", slug, "--app-id", attackerApp], attackerDir, "attacker");
const listing = JSON.parse(bounded(["domains", "list", "--app-id", attackerApp, "--json"], attackerDir, "attacker"));
const serialized = JSON.stringify(listing);
if (!serialized.includes(slug)) throw new Error(`attacker listing did not contain reclaimed slug: ${serialized}`);

console.log(JSON.stringify({
  result: "PASS",
  slug,
  victimApp,
  attackerApp,
  documentedMigrationOrder: ["victim release", "new app claim"],
  attackerClaimedDuringGap: true,
  attackerDomainListing: listing
}, null, 2));
