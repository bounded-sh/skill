```json
{
  "errorDisclosure": "minimal",
  "tenants/$tenantId": {
    "description": "Private SaaS tenant. The creator is the permanent tenant owner.",
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "ownerId": "String!",
      "name": "String"
    },
    "rules": {
      "read": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role != null)",
      "create": "@user.id != null && @newData.ownerId == @user.id && @newData.tenantId == $tenantId",
      "update": "@user.id != null && @data.ownerId == @user.id && @newData.ownerId == @data.ownerId && @newData.tenantId == @data.tenantId",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "tenant_root_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      }
    ]
  },
  "tenants/$tenantId/invitations/$inviteeId": {
    "description": "Owner-issued, revocable invitation. Acceptance sets active=false atomically with membership creation.",
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "inviteeId": "String!",
      "issuedBy": "String!",
      "role": "String",
      "active": "Bool"
    },
    "rules": {
      "read": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || $inviteeId == @user.id)",
      "create": "@user.id != null && get(/tenants/$tenantId).ownerId == @user.id && @newData.tenantId == $tenantId && @newData.inviteeId == $inviteeId && @newData.issuedBy == @user.id && (@newData.role == \"viewer\" || @newData.role == \"editor\") && @newData.active == true",
      "update": "@user.id != null && @newData.tenantId == @data.tenantId && @newData.inviteeId == @data.inviteeId && @newData.issuedBy == @data.issuedBy && (@newData.role == \"viewer\" || @newData.role == \"editor\") && ((get(/tenants/$tenantId).ownerId == @user.id) || ($inviteeId == @user.id && @data.active == true && @newData.active == false && @newData.role == @data.role && getAfter(/tenants/$tenantId/members/$inviteeId).userId == @user.id && getAfter(/tenants/$tenantId/members/$inviteeId).tenantId == $tenantId))",
      "delete": "@user.id != null && get(/tenants/$tenantId).ownerId == @user.id"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "invitation_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      }
    ]
  },
  "tenants/$tenantId/members/$memberId": {
    "description": "Tenant membership keyed by the universal user identity. Joining consumes an active owner-issued invitation in the same batch.",
    "tier": "durable",
    "requiresInBatch": {
      "create": [
        "tenants/$tenantId/invitations/$memberId"
      ]
    },
    "fields": {
      "tenantId": "String!",
      "userId": "String!",
      "role": "String"
    },
    "rules": {
      "read": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role != null)",
      "create": "@user.id != null && $memberId == @user.id && @newData.userId == @user.id && @newData.tenantId == $tenantId && get(/tenants/$tenantId/invitations/$memberId).active == true && get(/tenants/$tenantId/invitations/$memberId).inviteeId == @user.id && get(/tenants/$tenantId/invitations/$memberId).tenantId == $tenantId && @newData.role == get(/tenants/$tenantId/invitations/$memberId).role && (@newData.role == \"viewer\" || @newData.role == \"editor\")",
      "update": "@user.id != null && get(/tenants/$tenantId).ownerId == @user.id && @newData.tenantId == @data.tenantId && @newData.userId == @data.userId && (@newData.role == \"viewer\" || @newData.role == \"editor\")",
      "delete": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || $memberId == @user.id)"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "membership_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      }
    ]
  },
  "tenants/$tenantId/documents/$documentId": {
    "description": "Private tenant document. Viewers may read; editors and the tenant owner may mutate.",
    "tier": "durable",
    "fields": {
      "tenantId": "String!",
      "createdBy": "String!",
      "title": "String",
      "body": "String"
    },
    "rules": {
      "read": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role != null)",
      "create": "@user.id != null && @newData.tenantId == $tenantId && @newData.createdBy == @user.id && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role == \"editor\")",
      "update": "@user.id != null && @newData.tenantId == @data.tenantId && @newData.createdBy == @data.createdBy && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role == \"editor\")",
      "delete": "@user.id != null && (get(/tenants/$tenantId).ownerId == @user.id || get(/tenants/$tenantId/members/@user.id).role == \"editor\")"
    },
    "invariants": [
      {
        "type": "tenantTag",
        "name": "document_tenant_binding",
        "field": "tenantId",
        "pathVariable": "$tenantId"
      }
    ]
  }
}
```

Security rationale:

- Every tenant-scoped collection has a named `tenantTag`; `String!` fields and preservation clauses additionally make tenant, owner, invitee, member identity, and document creator immutable.
- Only the permanent tenant owner can issue, alter, revoke, or delete invitations and change another user’s membership or role.
- Accepting an invitation requires one atomic batch that creates the member and deactivates the matching invitation. `requiresInBatch`, `get()`, and `getAfter()` prevent partial acceptance and stale-invite replay after removal.
- Tenant metadata, rosters, and documents are membership-gated. Viewers are read-only; editors and the owner can mutate documents.
- Tenant deletion is deliberately disabled, avoiding orphaned tenant data and accidental destructive cascades.
- Client-facing rejection details are minimized for production.

No values are missing: tenant IDs and user IDs are runtime path/auth values. The policy was not deployed or written to disk. Full CLI verification was not completed because the installed verifier attempted external authentication, which is outside the evaluation’s allowed boundary.