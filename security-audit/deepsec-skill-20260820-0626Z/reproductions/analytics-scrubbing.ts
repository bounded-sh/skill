import assert from "node:assert/strict";
import { sanitizeAnalyticsPayload } from "/Users/athar/Desktop/workspace/poof-new/bounded-monorepo-audit.2CUS9x/packages/cdk/cloudflare/bounded-router/src/analytics.ts";

const credential = "sk-audit-only-123456";
const resetCode = "Reset_A7b9";
const result = sanitizeAnalyticsPayload({
  event: "js_error",
  path: `/reset/${resetCode}`,
  props: {
    errorName: "ProviderError",
    messagePrefix: `request failed Authorization: Bearer ${credential}`
  }
}, new Request("https://victim.bounded.page/reset"), new URL("https://victim.bounded.page/reset"));

assert(result);
assert.equal(result.path, `/reset/${resetCode}`);
assert(result.messagePrefix?.includes(credential));

console.log(JSON.stringify({
  result: "PASS",
  inputCredential: credential,
  persistedMessagePrefix: result.messagePrefix,
  inputResetCode: resetCode,
  persistedBucketedPath: result.path
}, null, 2));
