#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const auditRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const result = spawnSync(process.execPath, ["scripts/policy-e2e/run.mjs", "--require"], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  timeout: 45 * 60 * 1000
});
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
writeFileSync(path.join(auditRoot, "policy-e2e-required-raw.txt"), output);
process.stdout.write(output);
process.exit(result.status ?? 1);
