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
const ownerDir = path.join(tmpdir(), `bounded-agent-owner-${runId}`);
const attackerDir = path.join(tmpdir(), `bounded-agent-attacker-${runId}`);
mkdirSync(ownerDir, { recursive: true });
mkdirSync(attackerDir, { recursive: true });

for (const dir of [ownerDir, attackerDir]) {
  writeFileSync(path.join(dir, "bounded.json"), JSON.stringify({
    environment: "staging",
    account: dir === ownerDir
      ? { keySource: "profile", profile: "global" }
      : { keySource: "env" }
  }));
}

function bounded(args, cwd, actor = "owner") {
  const inner = actor === "attacker"
    ? ["env", `BOUNDED_PRIVATE_KEY=${attackerSecret}`, "bounded", ...args]
    : ["bounded", ...args];
  return execFileSync(dev, ["exec", "--", ...inner], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000
  });
}

const policy = {
  auth: { wallets: true },
  "jobs/$id": {
    fields: { value: "String!" },
    rules: { read: "@user.id != null", create: "false", update: "false", delete: "false" }
  }
};
writeFileSync(path.join(ownerDir, "policy.json"), `${JSON.stringify(policy, null, 2)}\n`);
const app = JSON.parse(bounded([
  "deploy", "policy.json", "--create", "--name", `audit-agent-${runId}`.slice(0, 40), "--public", "--json"
], ownerDir));
if (!app.ok || !app.appId) throw new Error("app deploy did not return appId");

// Grant only the host-sealed runtime service identity the write. The unrelated
// user will first prove that the same operation is denied directly.
policy["jobs/$id"].rules.create = `@user.id == 'svc:${app.appId}'`;
writeFileSync(path.join(ownerDir, "policy.json"), `${JSON.stringify(policy, null, 2)}\n`);
bounded(["deploy", "policy.json", "--app-id", app.appId, "--json"], ownerDir);
bounded(["secret", "put", "AUDIT_SECRET", "audit-only-secret-value", "--app-id", app.appId, "--json"], ownerDir);

const runtimeDir = path.join(ownerDir, "runtime");
mkdirSync(runtimeDir, { recursive: true });
writeFileSync(path.join(runtimeDir, "bounded.manifest"), JSON.stringify({
  name: "audit-agent",
  kind: "agent",
  entry: "index.ts",
  allowedHosts: [],
  aiCapUSD: 1,
  secrets: ["AUDIT_SECRET"],
  dependencies: {}
}, null, 2));
writeFileSync(path.join(runtimeDir, "index.ts"), `export default {
  async onInvoke(input, ctx) {
    await ctx.store.put("attacker-controlled", String(input.value));
    const secretWasAccessible = (await ctx.secrets.get("AUDIT_SECRET")) === "audit-only-secret-value";
    let policyWriteDenied = false;
    try {
      await ctx.bounded.set("jobs/last", { value: String(input.value) });
    } catch {
      policyWriteDenied = true;
    }
    return { caller: ctx.identity.user, value: await ctx.store.get("attacker-controlled"), policyWriteDenied, secretWasAccessible };
  }
};
`);
bounded(["runtime", "deploy", ".", "--app-id", app.appId, "--json"], runtimeDir);

let directDenied = false;
try {
  bounded([
    "data", "set", "--app-id", app.appId, "--path", "jobs/last",
    "--data", JSON.stringify({ value: "direct-user-write" })
  ], attackerDir, "attacker");
} catch (error) {
  directDenied = /policy_denied|Policy failed|denied/i.test(`${error.stdout ?? ""}${error.stderr ?? ""}`);
}
if (!directDenied) throw new Error("unrelated user's direct jobs/last write did not fail closed");

const invoked = JSON.parse(bounded([
  "runtime", "invoke", "audit-agent", "--app-id", app.appId,
  "--data", JSON.stringify({ value: "lower-privileged-write" }), "--json"
], attackerDir, "attacker"));
const serialized = JSON.stringify(invoked);
if (!serialized.includes("lower-privileged-write")) {
  throw new Error(`unrelated app user did not reach onInvoke: ${serialized.slice(0, 600)}`);
}
if (invoked?.output?.policyWriteDenied !== true) {
  throw new Error(`downstream policy unexpectedly admitted the runtime write: ${serialized.slice(0, 600)}`);
}
if (invoked?.output?.secretWasAccessible !== true) {
  throw new Error(`attacker-triggered handler did not receive its declared app secret: ${serialized.slice(0, 600)}`);
}
const stored = JSON.parse(bounded([
  "data", "get", "--app-id", app.appId, "--path", "jobs/last", "--json"
], ownerDir));
const storedRecord = stored?.data ?? stored;
if (storedRecord?.value != null) {
  throw new Error(`downstream policy write did not fail closed: ${JSON.stringify(stored)}`);
}

console.log(JSON.stringify({
  result: "PASS",
  appId: app.appId,
  attackerAddress: attacker.publicKey.toBase58(),
  directAttackerWriteDenied: directDenied,
  attackerReachedOnInvokeAndMutatedStore: true,
  attackerTriggeredDeclaredSecretAccess: invoked.output.secretWasAccessible,
  downstreamPolicyWriteDenied: invoked.output.policyWriteDenied,
  response: invoked
}, null, 2));
