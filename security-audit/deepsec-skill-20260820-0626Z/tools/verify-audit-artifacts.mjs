#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const auditRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = path.resolve(auditRoot, "../..");
const baseline = "54b05647169d6ed8b011db0c7a7cc9cc91cc0c53";
const readJson = (name) => JSON.parse(readFileSync(path.join(auditRoot, name), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const files = readJson("file-coverage.json");
const examples = readJson("example-coverage.json");
const policy = readJson("policy-e2e-required-summary.json");
const crossUser = readJson("policy-cross-user-results.json");
const filtered = readJson("deepsec-filtered/confirmed-high.json");
const report = readJson("deepsec-state/data/bounded-skill/reports/report.json");

const tracked = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline], { cwd: repoRoot, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
assert(tracked.length === 161, `expected 161 tracked files, found ${tracked.length}`);
assert(files.files.length === 161, `expected 161 file dispositions, found ${files.files.length}`);
assert(new Set(files.files.map((entry) => entry.path)).size === 161, "duplicate file-coverage paths");
assert(files.files.every((entry) => entry.reviewStatus && entry.result === "covered"), "incomplete file disposition");

for (const entry of files.files) {
  const blob = execFileSync("git", ["show", `${baseline}:${entry.path}`], { cwd: repoRoot });
  const digest = createHash("sha256").update(blob).digest("hex");
  assert(digest === entry.sha256, `baseline hash mismatch: ${entry.path}`);
}

assert(examples.examples.length === 646, `expected 646 examples, found ${examples.examples.length}`);
assert(examples.fencedBlockCount === 641, "fenced block count mismatch");
assert(examples.downloadableArtifactCount === 5, "downloadable artifact count mismatch");
assert(examples.examples.every((entry) => entry.classification && entry.trustModel && entry.validationPerformed.length > 0 && entry.result), "incomplete example disposition");

assert(policy.required === true, "policy E2E was not required mode");
assert(policy.specCount === 11, "policy E2E spec count mismatch");
assert(policy.totals.steps === 121 && policy.totals.passed === 72 && policy.totals.failed === 49 && policy.totals.skipped === 0, "policy E2E totals mismatch");
assert(crossUser.results.length === 10 && crossUser.results.every((result) => result.result === "PASS"), "cross-user authorization totals mismatch");

assert(report.summary.filesAnalyzed === 140 && report.summary.totalFindings === 130, "DeepSec report totals mismatch");
const deepsecPaths = [...report.files.map((file) => file.filePath)].sort();
const expectedDeepsecPaths = files.files
  .filter((entry) => entry.disposition !== "Generated artifact verified against its authoritative source and hash")
  .map((entry) => entry.path)
  .sort();
assert(JSON.stringify(deepsecPaths) === JSON.stringify(expectedDeepsecPaths), "DeepSec path set does not exactly match non-generated baseline paths");
assert(filtered.critical === 0 && filtered.high === 9 && filtered.findings.length === 9, "filtered finding totals mismatch");
const deepsecIds = new Set(report.files.flatMap((file) => file.findings).filter((finding) => finding.revalidation?.verdict === "true-positive").map((finding) => finding.findingId));
for (const finding of filtered.findings) {
  for (const id of finding.deepsecIds) assert(deepsecIds.has(id), `confirmed ID lacks xhigh true-positive verdict: ${id}`);
}

console.log(JSON.stringify({
  baseline,
  files: files.files.length,
  examples: examples.examples.length,
  deepsecAnalyzed: report.summary.filesAnalyzed,
  policyE2E: policy.totals,
  confirmed: { critical: filtered.critical, high: filtered.high }
}, null, 2));
