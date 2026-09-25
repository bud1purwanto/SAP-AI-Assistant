# MCP Access Request & Superadmin Approval — Design

Date: 2026-09-25
Status: Approved (5 sections)
Scope: `dashboard-mcp` (source of truth) + `ai-assistant` (request surface)

## Problem

`ai-assistant` chat dapat memakai MCP (SQL/RAG/Email) tanpa personal token di
menu Token Dashboard. Penyebab: Gateway menerima session JWT dan memberi
fallback grant ke semua server enabled untuk user tanpa permission
(`gateway.guard.ts:186-194`).

Model yang diinginkan:

- Tidak ada request MCP tanpa token aktif milik user.
- Semua permission dipegang Dashboard MCP.
- User meminta koneksi, superadmin menyetujui.
- Approval pada level target connection, bukan level server.
- User tidak memilih access level; superadmin menentukannya saat approval.

## Decision

Pilihan A: `McpAccessRequest` + auto-provision token.

- Approve otomatis membuat `McpPermission` + `ApiClient` personal +
  `ClientConnectionGrant`.
- User tidak pernah melihat raw token.
- Gateway fail-closed: tanpa permission + token aktif + target grant, request
  ditolak.

Pilihan B (permission saja) dan C (shared token) ditolak karena melanggar
syarat token sebagai prasyarat dan isolasi per-user.

## 1. Model Data

### `McpAccessRequest`

```prisma
enum AccessRequestStatus {
  pending
  approved
  rejected
}

model McpAccessRequest {
  id           String              @id @default(uuid())
  userId       String              @map("user_id")
  connectionId String              @map("connection_id")
  connection   McpTargetConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  status       AccessRequestStatus @default(pending)
  reason       String?
  decidedById  String?             @map("decided_by_id")
  decidedAt    DateTime?           @map("decided_at")
  decisionNote String?             @map("decision_note")
  grantedLevel McpAccessLevel?     @map("granted_level")
  createdAt    DateTime            @default(now()) @map("created_at")
  updatedAt    DateTime            @updatedAt @map("updated_at")

  @@index([userId, connectionId, status])
  @@map("mcp_access_requests")
}
```

Partial unique index via migration SQL (bukan `@@unique` penuh agar re-request
setelah `rejected` tetap bisa):

```sql
CREATE UNIQUE INDEX "mcp_access_requests_one_pending"
ON "mcp_access_requests" ("user_id", "connection_id")
WHERE "status" = 'pending';
```

### Relasi existing

- `McpTargetConnection.accessRequests McpAccessRequest[]`.
- `ApiClient` personal: `(ownerUserId, serverId)` unik, aktif = tidak revoked
  dan belum expired.
- `ClientConnectionGrant` ditambah `accessLevel McpAccessLevel` agar approval
  target kedua tidak menaikkan akses target pertama pada server yang sama.

### Invarian

1. Maksimal satu request `pending` per `(userId, connectionId)`.
2. Request `rejected` boleh diajukan ulang.
3. Target yang sudah `approved` tidak bisa diminta lagi selama akses aktif.

## 2. Approval & Provisioning API

### User endpoints

```http
GET  /v1/access-requests/me
POST /v1/access-requests
```

Request:

```json
{
  "connectionId": "target-connection-uuid",
  "reason": "Membutuhkan data laporan penjualan"
}
```

Validasi `POST`:

1. User login dan aktif.
2. Connection ada dan enabled.
3. User belum punya akses aktif ke connection tersebut.
4. Tidak ada request `pending` duplikat.
5. Field `accessLevel` dari user diabaikan bila dikirim.

Status awal selalu `pending`.

### Superadmin endpoints

```http
GET  /v1/access-requests?status=pending
POST /v1/access-requests/:id/approve
POST /v1/access-requests/:id/reject
```

Approve:

```json
{
  "accessLevel": "read",
  "decisionNote": "Disetujui untuk kebutuhan laporan"
}
```

Reject:

```json
{
  "decisionNote": "Target produksi tidak sesuai kebutuhan pengguna"
}
```

Hanya role `superadmin` boleh approve/reject. Role `admin` boleh melihat
antrean, tidak boleh memutuskan.

### Transaksi approval (atomik)

1. Lock request, pastikan masih `pending`.
2. Ambil target connection + `serverId`.
3. Cari personal `ApiClient` via `(ownerUserId, serverId)`.
4. Bila belum ada: buat token acak, simpan hash + ciphertext via vault existing.
   Token tidak dikirim ke AI Assistant atau browser user.
5. Bila token revoked/expired: rotasi/aktifkan token baru dalam approval.
6. Upsert `ClientConnectionGrant(clientId, connectionId, accessLevel)`.
7. Upsert `McpPermission(userId, serverId, accessLevel)`.
8. Tandai request `approved` + `grantedLevel` + `decidedById` + `decidedAt`.
9. Audit tanpa raw token:
   - `mcp.access_request.approve` (user, connection, server, level, superadmin).

Gagal di satu langkah = rollback penuh.

## 3. Gateway Enforcement

File: `dashboard-mcp/backend/src/common/guards/gateway.guard.ts`.

### Hapus fallback auto-grant

Blok `if (!permissions.length) { if (isHs256) { ... enabledServers ... } }`
dihapus total. Tanpa permission eksplisit, Gateway menolak dengan 403
(fail-closed).

### Triple-check per request

Untuk setiap server/target, Gateway memeriksa:

1. `McpPermission(userId, serverId)` aktif.
2. `ApiClient(ownerUserId, serverId)` aktif (tidak revoked, belum expired).
3. `ClientConnectionGrant` mencakup target connection dengan level memadai.

Perilaku:

- `tools/list`: server/target tanpa grant tidak dimunculkan.
- `tools/call`: panggilan tanpa grant ditolak 403 dengan pesan aman
  ("Akses ditolak: Anda belum memiliki izin/token yang disetujui untuk
  target ini").

### Sinkronisasi ai-assistant

- `ai-assistant` memakai Bearer session token user ke Gateway.
- Gateway hanya mengembalikan server/target approved.
- Target belum approved berstatus terkunci (`allowed: false`) di UI.
- Toggle/manual tool call tanpa approval tetap ditolak di Gateway.

## 4. UI

### 4.1 AI Assistant — target terkunci

- Approved + token aktif: Aktif, bisa dipilih.
- Belum approved: Terkunci + tombol **Minta Akses**.
- Request pending: **Menunggu Approval**, tombol nonaktif.
- Rejected: **Ditolak** + alasan + **Ajukan Lagi**.
- Token revoked/expired: **Token Tidak Aktif** + **Minta Akses**.

Request dari chat:

```http
POST /v1/access-requests
Authorization: Bearer <dashboard-session-token>
```

```json
{
  "connectionId": "connection-uuid",
  "reason": "Membutuhkan akses untuk analisis laporan"
}
```

Setelah request: UI menjadi Menunggu Approval; connector tidak dikirim ke LLM.
Chat tanpa connector tetap bisa menjawab pertanyaan umum.

### 4.2 Status endpoint

```http
GET /v1/access-requests/me
GET /v1/access-requests/available
```

Contoh item `available`:

```json
{
  "connectionId": "connection-uuid",
  "serverType": "sql",
  "name": "dev-223",
  "accessState": "locked",
  "requestState": "none",
  "canRequest": true
}
```

`accessState`: `approved | locked | pending | rejected | token_inactive`.
Status otorisasi berasal dari Dashboard, bukan tebakan lokal.

### 4.3 Dashboard — menu user: Permintaan Akses MCP

User melihat target, status, waktu, keputusan, catatan superadmin, dan level
akses setelah disetujui. User tidak bisa approve sendiri, memilih level,
melihat raw token, atau mengubah target setelah request dibuat.

### 4.4 Dashboard — menu superadmin: Approval Akses MCP

Antrean: user, server, target, waktu pengajuan, status. Detail: alasan,
riwayat request, level akses existing. Aksi:

- Approve: wajib pilih `read | write | admin`, catatan opsional.
- Reject: catatan wajib.
- Revoke: hapus permission/grant target; revoke token personal bila tidak ada
  target aktif tersisa.

### 4.5 Notifikasi

V1 tanpa websocket/push. Refresh saat selector MCP dibuka, menu request
dibuka, tombol refresh diklik, atau chat menerima 403 dari Gateway.

### 4.6 Invarian keamanan UI

UI hanya navigasi. Mengubah payload browser, menambah connector manual, atau
memanggil tool tanpa approval tidak memberi akses. Connector tanpa approval
tidak dikirim ke LLM.

## 5. Lifecycle, Audit, Migrasi, Testing

### 5.1 Revoke lifecycle

- Token expired = tidak aktif; UI Token Tidak Aktif; pengajuan ulang
  diperbolehkan. Rotasi hanya oleh superadmin/approval berikutnya.
- Revoke parsial: hapus grant target, turunkan/hapus permission bila tidak ada
  target aktif tersisa; target terkunci lagi di chat.
- User dinonaktifkan: pending request ditutup sebagai rejected, permission
  dicabut, token personal direvoke.
- Server dinonaktifkan: request tidak bisa disetujui; Gateway menolak semua
  panggilan terkait.
- Akses dicabut bisa diajukan ulang; riwayat tetap tersimpan.

### 5.2 Audit

Event tanpa raw token: `mcp.access_request.create`,
`mcp.access_request.approve`, `mcp.access_request.reject`,
`mcp.access.revoke`, `mcp.gateway.deny`. Retensi mengikuti kebijakan existing.

### 5.3 Migrasi

1. Tambah enum `AccessRequestStatus`.
2. Tambah model `McpAccessRequest`.
3. Tambah `accessLevel` ke `ClientConnectionGrant`.
4. Partial unique index request pending.
5. Backfill grant existing dengan default `read`, sesuaikan manual bila perlu.

Breaking change yang disengaja: token aktif legacy tanpa permission tercatat
tidak otomatis dipertahankan; user harus melalui approval pertama.

### 5.4 Testing

1. Request baru berhasil → `pending`.
2. Duplikat pending ditolak.
3. Approve membuat permission + token + grant.
4. Gateway menolak target belum approved (403, tidak muncul di tools).
5. Revoke target menutup akses.
6. `accessLevel` dari user diabaikan.
7. Role `admin` tidak bisa approve.
8. Partial grant tidak bocor ke target lain pada server yang sama.

Pola test backend existing: async test memakai `asyncio.run()` + fake client.
