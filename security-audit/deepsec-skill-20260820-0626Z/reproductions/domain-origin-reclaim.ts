import assert from "node:assert/strict";
import {
  originAllowedForApp,
  __clearAppOriginsCache,
} from "/Users/athar/Desktop/workspace/poof-new/bounded-monorepo-audit.2CUS9x/packages/cdk/cloudflare/bounded-betterauth/src/app-origins.ts";

const origin = "https://reclaimed.bounded.page";
const victimApp = "victim-app";
const attackerApp = "attacker-app";
__clearAppOriginsCache();

globalThis.fetch = async () => new Response(JSON.stringify({ allowedOrigins: [origin] }), {
  status: 200,
  headers: {
    "content-type": "application/json",
    "X-Bounded-App-Config-Consumer-Protocol-Ack": "bounded-auth.v1"
  }
});

const env = {
  ENVIRONMENT: "production",
  BOUNDED_APP_DOMAIN: "bounded.page",
  DEVELOPER_API_URL: "https://developer-api.invalid",
  APP_CONFIG_READ_SECRET: "audit-only-secret",
  HOST_TO_APP: {
    async get(key: string) {
      if (key === "slug:reclaimed") return attackerApp;
      return null;
    }
  }
};

const accepted = await originAllowedForApp(env, victimApp, `${origin}/callback`);
assert.equal(accepted, true, "stale victim allowlist accepted an origin now mapped to the attacker app");
console.log(JSON.stringify({
  result: "PASS",
  victimApp,
  attackerApp,
  origin,
  hostMapOwner: attackerApp,
  victimAllowedOriginsPersistedStale: true,
  victimTokenDeliveryOriginAccepted: accepted
}, null, 2));
