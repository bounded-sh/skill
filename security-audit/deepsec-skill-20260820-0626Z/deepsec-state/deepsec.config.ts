import { defineConfig } from "deepsec/config";
import { generatedMatchersPlugin } from "./generated-matchers.js";

export default defineConfig({
  ai: { mode: "local", provider: "openai" },
  defaultAgent: "codex",
  defaultModel: "gpt-5.6-sol",
  defaultThinkingLevel: "high",
  projects: [
    {
      id: "bounded-skill",
      root: "../../..",
      githubUrl: "https://github.com/bounded-sh/skill/blob/54b05647169d6ed8b011db0c7a7cc9cc91cc0c53",
      priorityPaths: ["bounded-backend/", "bounded-onchain/", "bounded-frontend/", "bounded-deploy/", "scripts/"],
      promptAppend: `This is discovery-only and the reporting threshold is strict. Report only realistic Critical or High vulnerabilities with a reachable external or lower-privileged attacker, a concrete crossed boundary, and theft, takeover, unauthorized signing or execution, auth bypass, cross-user/app/tenant access, credential theft, privilege escalation, or comparable impact. Read every documentation page in full context before judging a code block. Trace concrete candidates through the pinned owning implementation and all downstream defenses. The only authorized implementation baselines are /Users/athar/Desktop/workspace/poof-new/bounded-monorepo-audit.2CUS9x at 8e7f1e25b53e8f0575ea0f2336640d68761d60a9 and /Users/athar/Desktop/workspace/poof-new/bounded-cli-audit.CyUPDL at 755dd6b1cdf2d810fd119c0d95616f1ff7871730; do not use the dirty sibling checkouts for behavioral evidence. Exclude candidates matching the external KNOWN_FALSE_POSITIVES.md register. Do not report Medium, Low, correctness, reliability, stale documentation, broken commands, owner-only misuse, intended-public behavior, accepted provider trust, or theoretical issues. The globally installed Bounded skills are not the pinned audit baseline and may differ; use only the target repository files for claims about public guidance.`,
    },
    // <deepsec:projects-insert-above>
  ],
  plugins: [generatedMatchersPlugin],
});
