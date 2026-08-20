#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const auditRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const raw = readFileSync(path.join(auditRoot, "policy-e2e-required-raw.txt"), "utf8");
const specs = [];
let current = null;
for (const line of raw.split(/\r?\n/)) {
  const header = line.match(/^=== (.+) ===$/);
  if (header) {
    current = { name: header[1], passed: 0, failed: 0, skipped: 0 };
    specs.push(current);
    continue;
  }
  if (!current) continue;
  if (/^  PASS\b/.test(line)) current.passed += 1;
  if (/^  FAIL\b/.test(line)) current.failed += 1;
  if (/^  SKIP\b/.test(line)) current.skipped += 1;
}
const totals = specs.reduce((out, spec) => ({
  passed: out.passed + spec.passed,
  failed: out.failed + spec.failed,
  skipped: out.skipped + spec.skipped,
  steps: out.steps + spec.passed + spec.failed + spec.skipped
}), { passed: 0, failed: 0, skipped: 0, steps: 0 });
const output = {
  generatedAt: new Date().toISOString(),
  required: true,
  pinnedCli: "755dd6b1cdf2d810fd119c0d95616f1ff7871730",
  pinnedMonorepo: "8e7f1e25b53e8f0575ea0f2336640d68761d60a9",
  specCount: specs.length,
  totals,
  specs
};
writeFileSync(path.join(auditRoot, "policy-e2e-required-summary.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
