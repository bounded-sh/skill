The safe design is two-stage because Bounded does not permit an ordinary tenant member to invoke an `actAs` function directly. The member records an immutable request; an queued, service-identity worker reserves the worst-case spend before performing the external action.

Replace the placeholders and confirm the external tool’s exact schema before use. The sample limits are $1 per operation and $100 per tenant per rolling 24 hours.

### `policy.json`

```json
{
  "auth": {
    "wallets": true
  },

  "constants": {
    "FOUNDER_USER_ID": "<FOUNDER_USER_ID>",
    "PRIVILEGED_ACTION_SERVICE": "<PRIVILEGED_ACTION_SERVICE_ADDRESS>",
    "MAX_OPERATION_SPEND_MICRO_USD": 1000000
  },

  "admins/$userId": {
    "tier": "durable",
    "fields": {
      "active": "Bool"
    },
    "rules": {
      "read": "@user.id != null && ($userId == @user.id || get(/admins/@user.id).active == true)",
      "create": "@user.id != null && @newData.active == true && ((@user.id == @const.FOUNDER_USER_ID && $userId == @const.FOUNDER_USER_ID) || get(/admins/@user.id).active == true)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true"
    }
  },

  "tenants/$tenantId/members/$memberId": {
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "active": "Bool"
    },
    "rules": {
      "read": "@user.id != null && ($memberId == @user.id || get(/tenants/$tenantId/members/@user.id).active == true || get(/admins/@user.id).active == true)",
      "create": "@user.id != null && get(/admins/@user.id).active == true && @newData.tenantId == $tenantId",
      "update": "@user.id != null && get(/admins/@user.id).active == true && @newData.tenantId == @data.tenantId",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "member_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      }
    ]
  },

  "tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId": {
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "operationId": "String!",
      "originalCallerId": "String!",
      "operation": "String!",
      "resourceId": "String!",
      "destination": "String!",
      "units": "UInt!",
      "spendCapMicroUsd": "UInt!",
      "status": "String",
      "providerReceipt": "String?",
      "failureCode": "String?"
    },
    "rules": {
      "read": "(@user.id != null && $callerId == @user.id && get(/tenants/$tenantId/members/@user.id).active == true) || @user.address == @const.PRIVILEGED_ACTION_SERVICE",

      "create": "@user.id != null && $callerId == @user.id && get(/tenants/$tenantId/members/@user.id).active == true && @newData.tenantId == $tenantId && @newData.operationId == $operationId && @newData.originalCallerId == @user.id && @newData.operation == 'create_capped_order' && @StringUtils.length(@newData.resourceId) >= 1 && @StringUtils.length(@newData.resourceId) <= 128 && @StringUtils.length(@newData.destination) >= 1 && @StringUtils.length(@newData.destination) <= 256 && @newData.units >= 1 && @newData.units <= 1000 && @newData.spendCapMicroUsd >= 1 && @newData.spendCapMicroUsd <= @const.MAX_OPERATION_SPEND_MICRO_USD && @newData.status == 'pending' && @newData.providerReceipt == null && @newData.failureCode == null",

      "update": "@user.address == @const.PRIVILEGED_ACTION_SERVICE && @newData.tenantId == @data.tenantId && @newData.operationId == @data.operationId && @newData.originalCallerId == @data.originalCallerId && @newData.operation == @data.operation && @newData.resourceId == @data.resourceId && @newData.destination == @data.destination && @newData.units == @data.units && @newData.spendCapMicroUsd == @data.spendCapMicroUsd && ((@data.status == 'pending' && @newData.status == 'rejected' && @newData.providerReceipt == null && @newData.failureCode != null) || (@data.status == 'pending' && @newData.status == 'reserved' && @newData.providerReceipt == null && @newData.failureCode == null && get(/tenants/$tenantId/privilegedSpend/$callerId/ops/$operationId) == null && getAfter(/tenants/$tenantId/privilegedSpend/$callerId/ops/$operationId).reservedMicroUsd == @data.spendCapMicroUsd) || (@data.status == 'reserved' && @newData.status == 'succeeded' && @newData.providerReceipt != null && @newData.failureCode == null) || (@data.status == 'reserved' && (@newData.status == 'failed' || @newData.status == 'attention_required') && @newData.providerReceipt == null && @newData.failureCode != null))",

      "delete": "false"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "request_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      },
      {
        "type": "tenantEdge",
        "name": "request_caller_is_same_tenant_member",
        "field": "tenantId",
        "referenceField": "originalCallerId",
        "targetScope": "tenants/$tenantId/members/$memberId",
        "targetField": "tenantId",
        "targetPathVariable": "$memberId"
      }
    ]
  },

  "tenants/$tenantId/privilegedSpend/$callerId/ops/$operationId": {
    "description": "Immutable worst-case spend authorization created before external egress.",
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "operationId": "String!",
      "originalCallerId": "String!",
      "operation": "String!",
      "resourceId": "String!",
      "destination": "String!",
      "units": "UInt!",
      "reservedMicroUsd": "UInt!"
    },
    "requiresInBatch": {
      "create": [
        "tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId"
      ]
    },
    "rules": {
      "read": "(@user.id != null && $callerId == @user.id && get(/tenants/$tenantId/members/@user.id).active == true) || @user.address == @const.PRIVILEGED_ACTION_SERVICE",

      "create": "@user.address == @const.PRIVILEGED_ACTION_SERVICE && get(/tenants/$tenantId/members/$callerId).active == true && @newData.tenantId == $tenantId && @newData.operationId == $operationId && @newData.originalCallerId == $callerId && @newData.operation == get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).operation && @newData.resourceId == get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).resourceId && @newData.destination == get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).destination && @newData.units == get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).units && @newData.reservedMicroUsd == get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).spendCapMicroUsd && get(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).status == 'pending' && getAfter(/tenants/$tenantId/privilegedRequests/$callerId/ops/$operationId).status == 'reserved'",

      "update": "false",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "rollingSum",
        "name": "tenant_privileged_spend_24h_cap",
        "field": "reservedMicroUsd",
        "windowSeconds": 86400,
        "limit": 100000000,
        "scopeVariable": "$tenantId"
      },
      {
        "type": "tenantTag",
        "name": "spend_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      },
      {
        "type": "tenantEdge",
        "name": "spend_caller_is_same_tenant_member",
        "field": "tenantId",
        "referenceField": "originalCallerId",
        "targetScope": "tenants/$tenantId/members/$memberId",
        "targetField": "tenantId",
        "targetPathVariable": "$memberId"
      }
    ]
  },

  "functions": {
    "claimPrivilegedAction": {
      "auth": "@origin.kind == 'user' && @user.id != null",
      "entry": "functions/claimPrivilegedAction.ts",
      "timeout": 30
    },

    "executePrivilegedAction": {
      "auth": "@origin.kind == 'user' && @user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/executePrivilegedAction.ts",
      "timeout": 60,
      "queueCallable": true,
      "actAs": "<PRIVILEGED_ACTION_SERVICE_ADDRESS>"
    }
  },

  "proofs": {
    "attestations": [
      {
        "claim": "each tenant reserves at most 100 USD of privileged external spend in any rolling 24 hour window",
        "kind": "rollingSum",
        "scope": "tenants/$tenantId/privilegedSpend/$callerId/ops/$operationId",
        "field": "reservedMicroUsd",
        "windowSeconds": 86400,
        "limit": 100000000,
        "scopeVariable": "$tenantId"
      }
    ]
  }
}
```

### `functions/claimPrivilegedAction.ts`

```ts
type ClaimArgs = {
  tenantId: string;
  operationId: string;
  resourceId: string;
  destination: string;
  units: number;
  spendCapMicroUsd: number;
};

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_OPERATION_SPEND_MICRO_USD = 1_000_000;

function validate(args: ClaimArgs): void {
  if (!TENANT_ID.test(args.tenantId)) throw new Error("invalid tenantId");
  if (!OPERATION_ID.test(args.operationId)) {
    throw new Error("operationId must be a UUIDv4");
  }
  if (!RESOURCE_ID.test(args.resourceId)) throw new Error("invalid resourceId");

  if (
    typeof args.destination !== "string" ||
    args.destination.length < 1 ||
    args.destination.length > 256
  ) {
    throw new Error("invalid destination");
  }

  if (
    !Number.isSafeInteger(args.units) ||
    args.units < 1 ||
    args.units > 1000
  ) {
    throw new Error("invalid units");
  }

  if (
    !Number.isSafeInteger(args.spendCapMicroUsd) ||
    args.spendCapMicroUsd < 1 ||
    args.spendCapMicroUsd > MAX_OPERATION_SPEND_MICRO_USD
  ) {
    throw new Error("invalid spend cap");
  }
}

function sameRequest(a: any, b: any): boolean {
  return (
    a?.tenantId === b.tenantId &&
    a?.operationId === b.operationId &&
    a?.originalCallerId === b.originalCallerId &&
    a?.operation === b.operation &&
    a?.resourceId === b.resourceId &&
    a?.destination === b.destination &&
    a?.units === b.units &&
    a?.spendCapMicroUsd === b.spendCapMicroUsd
  );
}

export default async function claimPrivilegedAction(
  args: ClaimArgs,
  ctx: any
) {
  validate(args);

  const callerId = ctx.user.id;
  const path =
    `tenants/${args.tenantId}/privilegedRequests/` +
    `${callerId}/ops/${args.operationId}`;

  const proposed = {
    tenantId: args.tenantId,
    operationId: args.operationId,
    originalCallerId: callerId,
    operation: "create_capped_order",
    resourceId: args.resourceId,
    destination: args.destination,
    units: args.units,
    spendCapMicroUsd: args.spendCapMicroUsd,
    status: "pending",
    providerReceipt: null,
    failureCode: null
  };

  let request = await ctx.bounded.get(path);

  if (!request) {
    try {
      await ctx.bounded.set(path, proposed);
      request = proposed;
    } catch (error) {
      // Handles two concurrent invocations using the same operation id.
      request = await ctx.bounded.get(path);
      if (!request) throw error;
    }
  }

  if (!sameRequest(request, proposed)) {
    throw new Error("operation_id_conflict");
  }

  if (request.status === "pending" || request.status === "reserved") {
    await ctx.enqueue("executePrivilegedAction", {
      tenantId: args.tenantId,
      callerId,
      operationId: args.operationId
    });
  }

  return {
    ok: true,
    tenantId: args.tenantId,
    operationId: args.operationId,
    status: request.status
  };
}
```

### `functions/executePrivilegedAction.ts`

```ts
type WorkerArgs = {
  tenantId: string;
  callerId: string;
  operationId: string;
};

const TOOL_SLUG = "<PRIVILEGED_CAPPED_ACTION_TOOL_SLUG>";
const MAX_OPERATION_SPEND_MICRO_USD = 1_000_000;

function requestDocument(row: any, status: string, receipt: string | null, failure: string | null) {
  return {
    tenantId: row.tenantId,
    operationId: row.operationId,
    originalCallerId: row.originalCallerId,
    operation: row.operation,
    resourceId: row.resourceId,
    destination: row.destination,
    units: row.units,
    spendCapMicroUsd: row.spendCapMicroUsd,
    status,
    providerReceipt: receipt,
    failureCode: failure
  };
}

function validateStoredRequest(row: any, args: WorkerArgs): void {
  if (
    row?.tenantId !== args.tenantId ||
    row?.operationId !== args.operationId ||
    row?.originalCallerId !== args.callerId ||
    row?.operation !== "create_capped_order" ||
    typeof row.resourceId !== "string" ||
    typeof row.destination !== "string" ||
    !Number.isSafeInteger(row.units) ||
    row.units < 1 ||
    row.units > 1000 ||
    !Number.isSafeInteger(row.spendCapMicroUsd) ||
    row.spendCapMicroUsd < 1 ||
    row.spendCapMicroUsd > MAX_OPERATION_SPEND_MICRO_USD
  ) {
    throw new Error("invalid_stored_request");
  }
}

async function idempotencyKey(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `privileged-action:v1:${hex}`;
}

function errorCode(error: any): string {
  const value =
    typeof error?.code === "string" ? error.code : "external_action_unknown";
  return value.slice(0, 128);
}

export default async function executePrivilegedAction(
  args: WorkerArgs,
  ctx: any
) {
  const requestPath =
    `tenants/${args.tenantId}/privilegedRequests/` +
    `${args.callerId}/ops/${args.operationId}`;

  const spendPath =
    `tenants/${args.tenantId}/privilegedSpend/` +
    `${args.callerId}/ops/${args.operationId}`;

  let request = await ctx.bounded.get(requestPath);
  if (!request) throw new Error("request_not_found");

  if (
    request.status === "succeeded" ||
    request.status === "failed" ||
    request.status === "rejected" ||
    request.status === "attention_required"
  ) {
    return { ok: request.status === "succeeded", status: request.status };
  }

  try {
    validateStoredRequest(request, args);
  } catch (error) {
    if (request.status === "pending") {
      await ctx.bounded.set(
        requestPath,
        requestDocument(request, "rejected", null, "invalid_stored_request")
      );
    }
    throw error;
  }

  // Reserve the worst-case amount and change pending -> reserved atomically.
  // The spend rule checks that the member is still active at this point.
  if (request.status === "pending") {
    const reservation = {
      tenantId: request.tenantId,
      operationId: request.operationId,
      originalCallerId: request.originalCallerId,
      operation: request.operation,
      resourceId: request.resourceId,
      destination: request.destination,
      units: request.units,
      reservedMicroUsd: request.spendCapMicroUsd
    };

    try {
      await ctx.bounded.setMany([
        {
          path: spendPath,
          document: reservation
        },
        {
          path: requestPath,
          document: requestDocument(request, "reserved", null, null)
        }
      ]);
    } catch (error) {
      // A concurrent worker may have completed the same reservation.
      const current = await ctx.bounded.get(requestPath);
      if (!current || current.status === "pending") {
        // Includes tenant_privileged_spend_24h_cap exhaustion.
        throw error;
      }
    }
  }

  request = await ctx.bounded.get(requestPath);

  if (request?.status !== "reserved") {
    return {
      ok: request?.status === "succeeded",
      status: request?.status ?? "missing"
    };
  }

  // Use the immutable authorization row, not queue payload or invocation args.
  const authorization = await ctx.bounded.get(spendPath);
  if (!authorization) throw new Error("reservation_missing");

  const operationKey = await idempotencyKey([
    authorization.tenantId,
    authorization.originalCallerId,
    authorization.operationId,
    authorization.operation,
    "v1"
  ]);

  try {
    const result = await ctx.services.invoke(
      TOOL_SLUG,
      {
        // Replace these names only as required by the selected tool's schema.
        tenant_id: authorization.tenantId,
        operation_id: authorization.operationId,
        original_caller_id: authorization.originalCallerId,
        operation: authorization.operation,
        resource_id: authorization.resourceId,
        destination: authorization.destination,
        units: authorization.units,

        // The selected external action MUST enforce this as a hard ceiling.
        max_spend_micro_usd: authorization.reservedMicroUsd
      },
      {
        idempotencyKey: operationKey,
        entityId: authorization.tenantId
      }
    );

    const receipt = String(
      result?.result?.id ??
      result?.result?.receipt_id ??
      `bounded:${authorization.operationId}`
    ).slice(0, 256);

    await ctx.bounded.set(
      requestPath,
      requestDocument(request, "succeeded", receipt, null)
    );

    return {
      ok: true,
      tenantId: authorization.tenantId,
      operationId: authorization.operationId,
      receipt
    };
  } catch (error) {
    const code = errorCode(error);

    // These are safe to retry with the same operation key; retain reservation.
    if (
      code === "service_invoke_in_flight" ||
      code === "services_credit_exhausted"
    ) {
      throw error;
    }

    // Bounded will not replay an outcome-unknown service operation as fresh work.
    const terminalStatus =
      code === "service_invoke_outcome_unknown"
        ? "attention_required"
        : "failed";

    await ctx.bounded.set(
      requestPath,
      requestDocument(request, terminalStatus, null, code)
    );

    throw error;
  }
}
```

Security rationale:

- The member-facing function remains caller-scoped; tenant membership is enforced again by the request’s create rule.
- The worker’s `actAs` identity is dedicated to this role. Its direct invocation path is admin-gated with a working `active` off-switch; queued execution is explicitly enabled.
- The immutable request and spend records bind tenant, original caller, operation ID, operation, arguments, and worst-case spend. The worker never trusts its queue payload for action data.
- `setMany` reserves spend before egress. `rollingSum` provides the formal per-tenant 24-hour cap and rejects excess with `409`; replay converges on one operation through the stable external idempotency key.
- Bounded proves the recorded reservation cap, not arbitrary off-platform behavior. The selected external tool must itself enforce `max_spend_micro_usd` atomically and honor idempotency. Otherwise the external-spend guarantee cannot honestly be claimed.

Missing values: `<FOUNDER_USER_ID>`, `<PRIVILEGED_ACTION_SERVICE_ADDRESS>`, `<PRIVILEGED_CAPPED_ACTION_TOOL_SLUG>`, and the selected tool’s exact argument/receipt field mapping. No deployment, credentials, external calls, or filesystem writes were performed.