# MCP Target Connection Access Request & Superadmin Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement target-connection level access request with superadmin approval across `dashboard-mcp` (backend + UI) and `ai-assistant` (chat request button + fail-closed Gateway enforcement).

**Architecture:**
- `dashboard-mcp`: Prisma schema migration with `McpAccessRequest` and `ClientConnectionGrant.accessLevel`.
- `dashboard-mcp`: REST module `/v1/access-requests` handling user submission, listing, superadmin approval (atomic provisioning of `McpPermission` + personal `ApiClient` + `ClientConnectionGrant`), and rejection.
- `dashboard-mcp`: Strict fail-closed `GatewayGuard` removing the legacy HS256 auto-grant fallback and enforcing triple-check (user permission, active personal token, and granted target connection).
- `dashboard-mcp`: Frontend user request table and superadmin approval dashboard.
- `ai-assistant`: ChatLayout locked connection item with "Minta Akses" trigger modal, updating live state from `/v1/access-requests/available`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), TypeScript, React (Vite / Tailwind / Lucide), Python 3.12 (FastAPI), Jest, Pytest.

**Spec:** `ai-assistant/docs/superpowers/specs/2026-09-25-mcp-access-request-approval-design.md`

## Global Constraints
- Target Connection level isolation: approval grants only the requested `McpTargetConnection`, not the whole server.
- Personal token requirement: no user can call an MCP server without an active `ApiClient` registered to their `ownerUserId`.
- Superadmin-only approval: only users with role `superadmin` can approve/reject access requests; user cannot choose their own `accessLevel`.
- Fail-closed Gateway: zero fallback grants for unpermitted users (`gateway.guard.ts:186-194` removed).
- Audit without secrets: `AuditLog` records requests, decisions, and revokes without ever storing raw tokens.
- UI text must use i18n in `ai-assistant` (`useLanguage` + `i18n.js`).

---

### Task 1: Prisma Schema Migration & Domain Model (`dashboard-mcp`)

**Files:**
- Modify: `dashboard-mcp/backend/prisma/schema.prisma`
- Create: `dashboard-mcp/backend/prisma/migrations/20260925120000_add_mcp_access_requests/migration.sql`
- Test: `dashboard-mcp/backend/src/access-requests/access-requests.spec.ts`

**Interfaces:**
- Produces: `AccessRequestStatus` enum, `McpAccessRequest` model, `ClientConnectionGrant.accessLevel` field.

- [ ] **Step 1: Write the failing test for access-requests schema expectations**

```typescript
// dashboard-mcp/backend/src/access-requests/access-requests.spec.ts
import { McpAccessLevel } from '@prisma/client';

describe('AccessRequest Model & Enum', () => {
  it('exposes AccessRequestStatus enum values', () => {
    const { AccessRequestStatus } = require('@prisma/client');
    expect(AccessRequestStatus.pending).toBe('pending');
    expect(AccessRequestStatus.approved).toBe('approved');
    expect(AccessRequestStatus.rejected).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/access-requests/access-requests.spec.ts`
Expected: FAIL (Cannot find module `@prisma/client` status enum or compilation failure).

- [ ] **Step 3: Update `schema.prisma` and create migration**

In `dashboard-mcp/backend/prisma/schema.prisma`:
1. Add `enum AccessRequestStatus { pending, approved, rejected }`.
2. Add `accessLevel McpAccessLevel @default(read) @map("access_level")` to `ClientConnectionGrant`.
3. Add `McpAccessRequest` model with relation to `McpTargetConnection`.
4. Add `accessRequests McpAccessRequest[]` to `McpTargetConnection`.
5. Run `npx prisma generate`.
6. Add manual migration file `20260925120000_add_mcp_access_requests/migration.sql` with partial unique index:
```sql
CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "client_connection_grants"
ADD COLUMN IF NOT EXISTS "access_level" "McpAccessLevel" NOT NULL DEFAULT 'read';

CREATE TABLE "mcp_access_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "granted_level" "McpAccessLevel",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_access_requests_user_id_idx" ON "mcp_access_requests"("user_id");
CREATE INDEX "mcp_access_requests_status_idx" ON "mcp_access_requests"("status");
CREATE UNIQUE INDEX "mcp_access_requests_one_pending" ON "mcp_access_requests" ("user_id", "connection_id") WHERE "status" = 'pending';

ALTER TABLE "mcp_access_requests" ADD CONSTRAINT "mcp_access_requests_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "mcp_target_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
7. Apply migration via `npm run prisma:migrate` or container SQL execution.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/access-requests/access-requests.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/apps/MCP/dashboard-mcp && git add backend/prisma/ schema.prisma backend/prisma/migrations/ backend/src/access-requests/access-requests.spec.ts
git commit -m "feat(db): add mcp_access_requests model and target connection access level"
```

---

### Task 2: Access Requests Service & Controller (`dashboard-mcp`)

**Files:**
- Create: `dashboard-mcp/backend/src/access-requests/access-requests.service.ts`
- Create: `dashboard-mcp/backend/src/access-requests/access-requests.controller.ts`
- Create: `dashboard-mcp/backend/src/access-requests/access-requests.module.ts`
- Create: `dashboard-mcp/backend/src/access-requests/dto/create-access-request.dto.ts`
- Create: `dashboard-mcp/backend/src/access-requests/dto/approve-access-request.dto.ts`
- Create: `dashboard-mcp/backend/src/access-requests/dto/reject-access-request.dto.ts`
- Modify: `dashboard-mcp/backend/src/app.module.ts`
- Test: `dashboard-mcp/backend/src/access-requests/access-requests.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `AuditService`, `ClientsService`, `McpService`.
- Produces:
  - `POST /v1/access-requests` (user creates request)
  - `GET /v1/access-requests/me` (user lists their requests)
  - `GET /v1/access-requests/available` (user checks status of connections)
  - `GET /v1/access-requests` (superadmin lists pending requests)
  - `POST /v1/access-requests/:id/approve` (superadmin atomic approve + provision)
  - `POST /v1/access-requests/:id/reject` (superadmin reject with note)

- [ ] **Step 1: Write failing unit tests for AccessRequestsService**

```typescript
// dashboard-mcp/backend/src/access-requests/access-requests.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AccessRequestsService } from './access-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;
  const prismaMock = {
    mcpAccessRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    mcpTargetConnection: { findUnique: jest.fn(), findMany: jest.fn() },
    apiClient: { findUnique: jest.fn(), create: jest.fn() },
    clientConnectionGrant: { upsert: jest.fn() },
    mcpPermission: { upsert: jest.fn() },
    $transaction: jest.fn((cb) => cb(prismaMock)),
  };
  const auditMock = { record: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get<AccessRequestsService>(AccessRequestsService);
    jest.clearAllMocks();
  });

  it('rejects duplicate pending request for same connection', async () => {
    prismaMock.mcpTargetConnection.findUnique.mockResolvedValue({ id: 'conn-1', enabled: true, serverId: 's-1' });
    prismaMock.mcpAccessRequest.findFirst.mockResolvedValue({ id: 'req-old', status: 'pending' });
    await expect(service.create('u-1', { connectionId: 'conn-1' })).rejects.toThrow(ConflictException);
  });

  it('approves request atomically and provisions permission and grant', async () => {
    prismaMock.mcpAccessRequest.findUnique.mockResolvedValue({
      id: 'req-1', status: 'pending', userId: 'u-1', connectionId: 'conn-1',
      connection: { id: 'conn-1', serverId: 's-1' },
    });
    prismaMock.apiClient.findUnique.mockResolvedValue({ id: 'c-1', revokedAt: null, expiresAt: null });

    const result = await service.approve('req-1', { accessLevel: 'read', decisionNote: 'Approved' }, 'superadmin-1', 'superadmin');
    expect(result.status).toBe('approved');
    expect(prismaMock.clientConnectionGrant.upsert).toHaveBeenCalled();
    expect(prismaMock.mcpPermission.upsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/access-requests/access-requests.service.spec.ts`
Expected: FAIL (Cannot find module './access-requests.service').

- [ ] **Step 3: Implement DTOs, Service, Controller, and Module**

1. Create DTOs with `class-validator`:
   - `CreateAccessRequestDto`: `connectionId: string` (UUID), `reason?: string`.
   - `ApproveAccessRequestDto`: `accessLevel: McpAccessLevel` (read, write, admin), `decisionNote?: string`.
   - `RejectAccessRequestDto`: `decisionNote: string`.
2. Implement `AccessRequestsService`:
   - `create(userId, dto)`: verifies connection exists & enabled; checks no active grant exists for user; checks no pending request; creates `pending` request.
   - `listMine(userId)`: returns all requests for user.
   - `listAvailable(userId)`: returns all connections with their status for this user (`approved`, `locked`, `pending`, `rejected`, `token_inactive`).
   - `listPending()`: returns pending requests for superadmin.
   - `approve(id, dto, actorId, actorRole)`: requires `actorRole === 'superadmin'`; in `$transaction`, creates/reuses `apiClient` for `(ownerUserId, serverId)`, upserts `clientConnectionGrant(clientId, connectionId, accessLevel)`, upserts `mcpPermission(userId, serverId, accessLevel)`, marks request `approved`, logs audit.
   - `reject(id, dto, actorId, actorRole)`: requires `actorRole === 'superadmin'`; updates request to `rejected`, records note, logs audit.
3. Implement `AccessRequestsController`:
   - Apply `@UseGuards(JwtAuthGuard, RolesGuard)`
   - Attach `@Roles(Role.superadmin)` to approve and reject endpoints.
4. Register `AccessRequestsModule` in `app.module.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/access-requests/access-requests.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/apps/MCP/dashboard-mcp && git add backend/src/access-requests/ backend/src/app.module.ts
git commit -m "feat(api): implement mcp access request and superadmin approval endpoints"
```

---

### Task 3: Fail-Closed GatewayGuard Enforcement (`dashboard-mcp`)

**Files:**
- Modify: `dashboard-mcp/backend/src/common/guards/gateway.guard.ts`
- Test: `dashboard-mcp/backend/src/common/guards/gateway.guard.spec.ts`

**Interfaces:**
- Consumes: `mcpPermission`, `apiClient`, `clientConnectionGrant`.
- Enforces:
  1. Complete removal of fallback grant on missing permissions (`gateway.guard.ts:186-194`).
  2. For users, token must be backed by an active `apiClient` matching `(ownerUserId, serverId)` with no revocation and non-expired date.
  3. `authorizedResources` must match the specific `connectionId` granted in `clientConnectionGrant`.

- [ ] **Step 1: Write failing unit test in gateway.guard.spec.ts**

```typescript
// in dashboard-mcp/backend/src/common/guards/gateway.guard.spec.ts
it('rejects user with no permissions even if isHs256 is true (no fallback)', async () => {
  const token = await createToken({ sub: 'user-no-perm', roles: ['user'] });
  authPrismaMock.authUser.findUnique.mockResolvedValue({ id: 'user-no-perm', isActive: true, role: 'user' });
  prismaMock.mcpPermission.findMany.mockResolvedValue([]); // no permissions

  const ctx = createMockContext({ authorization: `Bearer ${token}` });
  await expect(guard.canActivate(ctx as any)).rejects.toThrow(
    new ForbiddenException('Principal has no server permissions assigned'),
  );
});

it('rejects user when no active personal apiClient token exists for server', async () => {
  const token = await createToken({ sub: 'user-1', roles: ['user'] });
  authPrismaMock.authUser.findUnique.mockResolvedValue({ id: 'user-1', isActive: true, role: 'user' });
  prismaMock.mcpPermission.findMany.mockResolvedValue([{ server: { id: 's-sql', name: 'mcp-sql', enabled: true }, accessLevel: 'read' }]);
  prismaMock.apiClient.findUnique.mockResolvedValue(null); // No personal token exists!

  const ctx = createMockContext({ authorization: `Bearer ${token}` }, { serverName: 'mcp-sql' });
  await expect(guard.canActivate(ctx as any)).rejects.toThrow(
    new ForbiddenException('No active client token for this server'),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/common/guards/gateway.guard.spec.ts`
Expected: FAIL (First test passes if old fallback still returned enabled servers; second fails because personal token was not checked).

- [ ] **Step 3: Refactor `gateway.guard.ts`**

1. Remove the fallback block in `dashboardPrincipal`:
```typescript
// CUT lines 186-195:
// if (!permissions.length) {
//   if (isHs256) { ... }
//   throw new ForbiddenException('Principal has no server permissions assigned');
// }
if (!permissions.length) {
  throw new ForbiddenException('Principal has no server permissions assigned');
}
```
2. In `dashboardPrincipal` or `attachRoutes`, for `kind === 'user'`, verify active `apiClient` exists for `ownerUserId === subjectId` and `serverId === server.id`. If missing or revoked, filter out the grant or throw `ForbiddenException`.
3. Filter `authorizedResources` by `clientConnectionGrant` linked to that `apiClient` with level validation.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/apps/MCP/dashboard-mcp/backend && npm test src/common/guards/gateway.guard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/apps/MCP/dashboard-mcp && git add backend/src/common/guards/gateway.guard.ts backend/src/common/guards/gateway.guard.spec.ts
git commit -m "feat(gateway): enforce fail-closed authorization with personal token requirement"
```

---

### Task 4: Dashboard MCP Frontend User & Superadmin Pages (`dashboard-mcp`)

**Files:**
- Create: `dashboard-mcp/frontend/src/pages/AccessRequests.tsx`
- Create: `dashboard-mcp/frontend/src/pages/SuperadminApprovals.tsx`
- Modify: `dashboard-mcp/frontend/src/App.tsx`
- Modify: `dashboard-mcp/frontend/src/auth/authApi.ts`

**Interfaces:**
- Consumes: `/v1/access-requests`, `/v1/access-requests/me`, `/v1/access-requests/:id/approve`, `/v1/access-requests/:id/reject`.
- Produces: UI route `/access-requests` for users and `/admin/approvals` for superadmins.

- [ ] **Step 1: Write component render smoke test**

```typescript
// dashboard-mcp/frontend/src/pages/AccessRequests.test.tsx
import { render, screen } from '@testing-library/react';
import AccessRequests from './AccessRequests';

test('renders user access requests table header', () => {
  render(<AccessRequests />);
  expect(screen.getByText(/Permintaan Akses MCP/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/apps/MCP/dashboard-mcp/frontend && npm test src/pages/AccessRequests.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement Frontend Pages & API clients**

1. In `authApi.ts`, add methods:
   - `fetchMyAccessRequests()`
   - `createAccessRequest(connectionId, reason)`
   - `fetchPendingApprovals()`
   - `approveAccessRequest(id, accessLevel, decisionNote)`
   - `rejectAccessRequest(id, decisionNote)`
2. Build `AccessRequests.tsx`: displays user's past requests, status badges (`Menunggu`, `Disetujui`, `Ditolak`), and decision notes.
3. Build `SuperadminApprovals.tsx`: restricted to superadmin; lists pending items with user, server, target connection, reason; modal/inline form to select `read | write | admin` and click `Approve`, or input note and click `Reject`.
4. Register routes in `App.tsx` and add links to navbar.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/apps/MCP/dashboard-mcp/frontend && npm test src/pages/AccessRequests.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/apps/MCP/dashboard-mcp && git add frontend/src/
git commit -m "feat(ui): add access requests page and superadmin approval dashboard"
```

---

### Task 5: AI Assistant Locked Connection Modal & Live Request Hook (`ai-assistant`)

**Files:**
- Modify: `ai-assistant/frontend/src/components/ChatLayout.jsx`
- Modify: `ai-assistant/frontend/src/lib/api.js`
- Modify: `ai-assistant/frontend/src/lib/i18n.js`
- Test: `ai-assistant/backend/tests/test_access_request_flow.py`

**Interfaces:**
- Consumes: `POST http://192.168.1.161:4000/v1/access-requests` via user dashboard bearer token.
- Produces: Live UI lock state + "Minta Akses" action modal in Chat dropdown.

- [ ] **Step 1: Write regression test in Python for live request flow**

```python
# ai-assistant/backend/tests/test_access_request_flow.py
import pytest

def test_available_connections_mapping():
    from mcp_manager import classify_connection_status
    status = classify_connection_status(is_approved=False, has_pending_request=True)
    assert status == "pending"
    status_locked = classify_connection_status(is_approved=False, has_pending_request=False)
    assert status_locked == "locked"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/apps/MCP/ai-assistant && PYTHONPATH=backend backend/venv/bin/pytest backend/tests/test_access_request_flow.py`
Expected: FAIL.

- [ ] **Step 3: Implement Frontend UI & Translations**

1. In `i18n.js`:
   - EN: `'mcp.requestAccess': 'Request Access'`, `'mcp.pendingApproval': 'Pending Approval'`, `'mcp.accessDeniedLocked': 'Access locked by administrator'`.
   - ID: `'mcp.requestAccess': 'Minta Akses'`, `'mcp.pendingApproval': 'Menunggu Persetujuan'`, `'mcp.accessDeniedLocked': 'Akses terkunci oleh administrator'`.
2. In `api.js`:
   - Add `requestConnectionAccess(connectionId, reason)` calling Dashboard MCP `/v1/access-requests`.
   - Add `getAvailableAccess()` calling Dashboard MCP `/v1/access-requests/available`.
3. In `ChatLayout.jsx`:
   - For locked servers or targets without approved grant, display lock badge + **Minta Akses** button.
   - Clicking opens a simple prompt/dialog for optional `reason`.
   - On submit, call `requestConnectionAccess`, change status to `Menunggu Persetujuan`.
   - Prevent toggling/enabling unapproved connectors.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /data/apps/MCP/ai-assistant && PYTHONPATH=backend backend/venv/bin/pytest backend/tests/test_access_request_flow.py`
Expected: PASS.
Run frontend build: `cd /data/apps/MCP/ai-assistant/frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/apps/MCP/ai-assistant && git add frontend/src/ backend/tests/test_access_request_flow.py
git commit -m "feat(chat): add request access trigger and status badge for locked MCP connections"
```

---

### Task 6: End-to-End System Verification & Integration Smoke (`all`)

**Files:**
- Test: `dashboard-mcp/backend/test/access-request-e2e.spec.ts`

**Steps:**
- [ ] **Step 1: Rebuild and deploy containers**
  - Run `docker compose build && docker compose up -d` in `dashboard-mcp`.
  - Run `docker compose build backend && docker compose up -d backend` in `ai-assistant`.
- [ ] **Step 2: Execute End-to-End Test Scenario**
  1. Login as `test-user` (no SQL grant).
  2. Attempt `POST /api/chat/stream` with `enabled_connectors: ["sql"]` -> Gateway must return 403 / "Akses ditolak: Anda belum memiliki izin/token yang disetujui untuk target ini".
  3. User submits `POST /v1/access-requests` for connection `dev-223`.
  4. Superadmin logs in, calls `POST /v1/access-requests/:id/approve` with `accessLevel: "read"`.
  5. Repeat `POST /api/chat/stream` with `enabled_connectors: ["sql"]` -> SQL query executes successfully and lists databases.
- [ ] **Step 3: Commit and update ledger**

```bash
cd /data/apps/MCP/ai-assistant && git add . && git commit -m "chore(e2e): verify end-to-end access request and superadmin approval pipeline"
```

---

## Self-Review Checklist
1. **Spec Coverage:**
   - Model & Migration -> Task 1
   - API endpoints (user & superadmin) -> Task 2
   - GatewayGuard fail-closed & token requirement -> Task 3
   - Dashboard UI -> Task 4
   - AI Assistant UI & i18n -> Task 5
   - E2E Verification -> Task 6
2. **Placeholder scan:** None (exact test assertions, SQL migration statements, endpoints, and file paths are provided).
3. **Type consistency:** `AccessRequestStatus` (`pending`, `approved`, `rejected`), `McpAccessLevel` (`read`, `write`, `admin`), `connectionId` consistently used throughout all tasks.
