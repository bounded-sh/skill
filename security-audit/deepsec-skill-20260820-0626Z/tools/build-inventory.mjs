#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const outDir = resolve(process.argv[3] ?? "security-audit/deepsec-skill-20260820-0626Z");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const digest = (value) => createHash("sha256").update(value).digest("hex");
const generatedPlugin = (path) =>
  path === "bounded-onchain/docs/plugins.md" ||
  path === "bounded-onchain/docs/plugin-signatures.md" ||
  (/^bounded-onchain\/docs\/plugins\/[^/]+\.md$/.test(path) && !path.includes("/_fragments/"));
const testEvidence = (path) =>
  path.startsWith("scripts/tests/") ||
  path.startsWith("scripts/policy-e2e/specs/") ||
  path === "scripts/router-baseline.json" ||
  path.endsWith("policy.verify-today.json");
const supported = (path) => [".js", ".mjs"].includes(extname(path));
const downloadable = (path) =>
  path.includes("/examples/") && !path.endsWith(".md") || path.endsWith(".policy.json");

const files = tracked.map((path) => {
  const bytes = readFileSync(resolve(root, path));
  let disposition;
  let reason;
  if (generatedPlugin(path)) {
    disposition = "Generated artifact verified against its authoritative source and hash";
    reason = "Generated plugin reference; canonical source is bounded-onchain/data/plugin-catalog.json plus curated _fragments.";
  } else if (testEvidence(path)) {
    disposition = "Test or fixture reviewed as security-contract evidence";
    reason = "Repository gate, policy E2E, or publication contract evidence.";
  } else if (supported(path)) {
    disposition = "Supported-language DeepSec scan";
    reason = "Executable JavaScript module included in a dedicated DeepSec partition.";
  } else {
    disposition = "Forced-format security review";
    reason = "Agent-facing Markdown, JSON, rules, or configuration reviewed in full context outside language matcher coverage.";
  }
  return {
    path,
    sha256: digest(bytes),
    bytes: bytes.length,
    disposition,
    reason,
    active: true,
    reviewStatus: "pending"
  };
});

const blocks = [];
for (const path of tracked.filter((value) => value.endsWith(".md") || value.endsWith(".mdc"))) {
  const text = readFileSync(resolve(root, path), "utf8");
  const lines = text.split(/\r?\n/);
  let open = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*```\s*([^\s`]*)?.*$/);
    if (!match) {
      if (open) open.content.push(lines[index]);
      continue;
    }
    if (!open) {
      open = { line: index + 1, language: match[1] || "text", content: [] };
    } else {
      const content = open.content.join("\n");
      const contentHash = digest(content);
      const language = open.language.toLowerCase();
      const executableLanguages = new Set(["json", "jsonc", "javascript", "js", "typescript", "ts", "tsx", "jsx", "bash", "sh", "shell", "solidity", "rust"]);
      const conceptualLanguages = new Set(["text", "plaintext", "console", "output", "diff"]);
      const generated = generatedPlugin(path);
      const classification = generated
        ? "generated"
        : conceptualLanguages.has(language)
          ? "conceptual"
          : executableLanguages.has(language)
            ? "executable"
            : "partial";
      blocks.push({
        id: `${path}:${open.line}`,
        file: path,
        line: open.line,
        endLine: index + 1,
        language: open.language,
        classification,
        intendedUse: "Pending full-page contextual review",
        trustModel: "Pending full-page contextual review",
        sha256: contentHash,
        canonicalSource: null,
        duplicateOf: null,
        securitySensitivity: /policy|auth|owner|admin|secret|service|sign|wallet|token|transfer|escrow|payment|deploy|key|runAs|actAs|origin/i.test(content) ? "security-sensitive" : "general",
        validationPerformed: [],
        owningImplementationFilesInspected: [],
        result: "pending",
        limitation: null
      });
      open = null;
    }
  }
}

const firstByHash = new Map();
for (const block of blocks) {
  const first = firstByHash.get(block.sha256);
  if (first) {
    block.duplicateOf = first.id;
    block.canonicalSource = first.id;
  } else {
    firstByHash.set(block.sha256, block);
    block.canonicalSource = block.id;
  }
}

const artifacts = tracked.filter(downloadable).map((path) => ({
  id: path,
  file: path,
  line: 1,
  language: extname(path).slice(1) || "text",
  classification: "executable",
  intendedUse: "Downloadable repository example artifact",
  trustModel: "Pending containing-directory and linked-page review",
  sha256: files.find((file) => file.path === path).sha256,
  canonicalSource: path,
  duplicateOf: null,
  securitySensitivity: "security-sensitive",
  validationPerformed: [],
  owningImplementationFilesInspected: [],
  result: "pending",
  limitation: null
}));

writeFileSync(resolve(outDir, "file-coverage.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), root, total: files.length, files }, null, 2)}\n`);
writeFileSync(resolve(outDir, "example-coverage.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), root, fencedBlockCount: blocks.length, downloadableArtifactCount: artifacts.length, examples: [...blocks, ...artifacts] }, null, 2)}\n`);
const canonicalFiles = files
  .filter((file) => file.disposition !== "Generated artifact verified against its authoritative source and hash")
  .map((file) => file.path);
const partitions = {
  "01-routers-agents": canonicalFiles.filter((path) => !path.startsWith("bounded-backend/") && !path.startsWith("bounded-frontend/") && !path.startsWith("bounded-deploy/") && !path.startsWith("bounded-onchain/") && !path.startsWith("scripts/")),
  "02-backend": canonicalFiles.filter((path) => path.startsWith("bounded-backend/")),
  "03-frontend": canonicalFiles.filter((path) => path.startsWith("bounded-frontend/")),
  "04-deploy": canonicalFiles.filter((path) => path.startsWith("bounded-deploy/")),
  "05-onchain": canonicalFiles.filter((path) => path.startsWith("bounded-onchain/")),
  "06-publication-supply-chain": canonicalFiles.filter((path) => path.startsWith("scripts/"))
};
const manifestDir = resolve(outDir, "deepsec-state", "manifests");
mkdirSync(manifestDir, { recursive: true });
for (const [name, paths] of Object.entries(partitions)) {
  writeFileSync(resolve(manifestDir, `${name}.json`), `${JSON.stringify(paths, null, 2)}\n`);
  writeFileSync(resolve(manifestDir, `${name}.txt`), `${paths.join("\n")}\n`);
}
process.stdout.write(JSON.stringify({ trackedFiles: files.length, fencedBlocks: blocks.length, downloadableArtifacts: artifacts.length, duplicateBlocks: blocks.filter((block) => block.duplicateOf).length }, null, 2));
