# Desain Integrasi MCP: URL Registry Lokal, Per-User Token dari Dashboard-MCP, SAP Bound Token, dan Penghapusan Menu Access Control

- **Status**: Draft (Menunggu Review Pengguna)
- **Tanggal**: 2026-09-24
- **Branch Target**: `new-integration`
- **Repositori**: `/data/apps/MCP/ai-assistant`

---

## 1. Latar Belakang & Masalah

Pada arsitektur saat ini:
1. **Konfigurasi MCP Server**: Seluruh lalu lintas MCP diarahkan ke satu gateway tunggal (`DASHBOARD_MCP_GATEWAY_URL`). Endpoint CRUD lokal (`/api/admin/mcp/servers/*`) telah dinonaktifkan (HTTP 410 Gone), dan UI `AdminMcpConfig.jsx` hanya menampilkan teks migrasi tanpa input form.
2. **Autentikasi MCP**: `mcp_manager.py` menyertakan OIDC Bearer token milik pengguna per-request, tetapi masih memiliki kode fallback ke token statis global (`DASHBOARD_MCP_API_TOKEN`).
3. **Kredensial SAP**: Disimpan di database lokal `user_sap_credentials` (terenkripsi Fernet) dan dikirim langsung via HTTP header `X-SAP-User`, `X-SAP-Password`, `X-SAP-Client` pada setiap tool call. Belum ada mekanisme tokenisasi kredensial SAP ke dashboard-mcp.
4. **Access Control**: Terdapat sistem RBAC 2-layer internal (`backend/access_control.py`, `AdminAccessControl.jsx`, tabel `role_resource_access`, `user_resource_access`, dll.) dengan ukuran >2.200 baris kode di frontend saja. Padahal, penegakan hak akses MCP kini ditangani secara terpusat oleh `dashboard-mcp`. Komponen lokal ini menjadi beban pemeliharaan dan duplikasi kewenangan.

---

## 2. Sasaran (Goals) & Batasan (Non-Goals)

### Sasaran (Goals)
1. **MCP URL Registry Lokal**: ai-assistant mengelola daftar URL server MCP (hanya menyimpan `name`, `url`, `enabled`, `display_order`). Tidak ada token statis yang disimpan atau dikirim dari database lokal.
2. **Per-User MCP Token**: Setiap request ke server MCP selalu diautentikasi menggunakan OIDC Bearer token milik pengguna yang sedang aktif (dihasilkan saat login via `dashboard-mcp`). Fallback ke static global token dihapus sepenuhnya.
3. **SAP Bound-Token Onboarding**:
   - Memanfaatkan form SAP Credential yang sudah ada di `SettingsModal.jsx`.
   - Mengirim kredensial SAP ke endpoint baru `dashboard-mcp` (`POST /v1/integration/sap-tokens`) untuk menghasilkan token terikat (*bound token*).
   - Menyimpan metadata token di tabel lokal baru `user_sap_tokens(username, target, encrypted_token, expires_at)`.
   - Mengharuskan setiap pengguna mengisi kredensial SAP sebelum dapat mengeksekusi tool SAP (onboarding mandatory).
4. **Penghapusan Menu Access Control**: Menghapus total UI `AdminAccessControl.jsx`, tab `'access'` di `AdminDashboard.jsx`, modul `backend/access_control.py`, dan seluruh endpoint `/api/admin/access/*`.

### Batasan (Non-Goals)
- **Implementasi sisi dashboard-mcp**: Pembuatan endpoint `POST /v1/integration/sap-tokens` di `dashboard-mcp` adalah pekerjaan repositori terpisah. ai-assistant hanya mengimplementasikan kontrak pemanggilannya dengan fallback yang aman.
- **Penghapusan tabel RBAC fisik**: Sesuai AGENTS.md §2 (*Never drop databases/schemas, never delete data*), tabel `mcp_resources`, `role_resource_access`, `user_resource_access`, dan `access_audit` **tetap dipertahankan di database**, namun tidak lagi dibaca atau ditulis oleh kode aplikasi.
- **Push ke Remote**: Seluruh commit dilakukan secara lokal pada branch `new-integration`.

---

## 3. Detail Arsitektur & Komponen

### 3.1. MCP URL Registry (Lokal)

#### 3.1.1. Skema Database
Memanfaatkan kembali tabel `ai_assistant_dev.mcp_servers` yang sudah ada:
- **Kolom Aktif**: `id`, `name`, `url`, `enabled`, `display_order`, `updated_at`.
- **Kolom Vestigial**: `auth_token`, `headers`, `transport_type`, `description`, `icon`, `is_system` tetap ada di DB (AGENTS.md §2), tetapi diabaikan (tidak dibaca dan tidak ditulis).

Fungsi database baru/diperbarui di `backend/database.py`:
- `list_mcp_servers(enabled_only: bool = False) -> list[dict]`: Mengembalikan hanya kolom non-sensitif (`id`, `name`, `url`, `enabled`, `display_order`).
- `save_mcp_server(sid: str, name: str, url: str, enabled: bool = True) -> dict`: Insert atau update nama, URL, dan status enabled.
- `delete_mcp_server(sid: str) -> bool`: Soft-disable atau delete record MCP server.

#### 3.1.2. Resolusi Koneksi di `mcp_manager.py`
- Metode `_get_client_config(name: str)` diperbarui:
  1. Periksa tabel lokal `mcp_servers` berdasarkan `name` (atau `id`).
  2. Jika ditemukan dan `enabled`, gunakan `url` tersebut.
  3. Jika tidak ditemukan di database lokal, gunakan fallback default ke `{gateway_base}/{name}` (atau `{gateway_base}` untuk agregator core).
- Metode `get_client(name: str)`:
  - Mengambil token OIDC pengguna via `auth.get_dashboard_access_token()`.
  - Hapus seluruh pengecekan fallback ke `dashboard_mcp_api_token` dan decode token lokal HS256.
  - Jika token tidak ditemukan, lempar `PermissionError("Sesi dashboard-mcp tidak ditemukan atau telah kedaluwarsa.")`.
  - Sisipkan `Authorization: Bearer {access_token}` pada header client.

#### 3.1.3. Endpoint Admin MCP di `backend/main.py`
Mengaktifkan kembali (un-410) endpoint administrasi server MCP dengan proteksi `require_superadmin`:
- `GET /api/admin/mcp/servers`: Mengembalikan daftar server MCP dari DB lokal.
- `POST /api/admin/mcp/servers`: Menerima `{name: str, url: str, enabled: bool}`.
- `PUT /api/admin/mcp/servers/{server_id}`: Memperbarui `{name?: str, url?: str, enabled?: bool}`.
- `DELETE /api/admin/mcp/servers/{server_id}`: Menghapus entri server MCP.

#### 3.1.4. Antarmuka Frontend (`AdminMcpConfig.jsx`)
- Tulis ulang komponen `frontend/src/components/AdminMcpConfig.jsx`:
  - Menampilkan tabel server MCP: Nama, URL, Status (Aktif/Nonaktif), Tombol Aksi (Edit, Hapus, Tes Koneksi).
  - Form modal tambah/edit server: Hanya field **Nama Server** dan **URL Server**, serta checkbox **Aktif**.
  - Tidak ada input token, header rahasia, atau kunci autentikasi apapun.

---

### 3.2. SAP Credential & Token Generation

#### 3.2.1. Tabel Baru: `ai_assistant_dev.user_sap_tokens`
```sql
CREATE TABLE IF NOT EXISTS ai_assistant_dev.user_sap_tokens (
    username VARCHAR(50) NOT NULL,
    target VARCHAR(50) NOT NULL,
    encrypted_token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (username, target)
);
```
- Token dienkripsi menggunakan Fernet key aplikasi (`_get_fernet_key()`).

#### 3.2.2. Alur Pengikatan Token (Token Binding Flow)
1. Pengguna membuka tab **SAP Credentials** di `SettingsModal.jsx`.
2. Pengguna mengisi: Target System, SAP Username, SAP Password, SAP Client (default `100`).
3. Saat tombol **Simpan** ditekan:
   - Frontend memanggil `POST /api/me/sap-credentials` seperti biasa (menyimpan kredensial dasar terenkripsi).
   - Frontend (atau backend secara otomatis) memicu endpoint backend: `POST /api/me/sap-credentials/bind-token` dengan body `{ target: "dev" }`.
   - Backend `ai-assistant` mengambil kredensial tersimpan, lalu memanggil `dashboard-mcp`:
     ```http
     POST {settings.dashboard_mcp_url}/v1/integration/sap-tokens
     Authorization: Bearer {user_oidc_access_token}
     Content-Type: application/json

     {
       "target": "dev",
       "sap_user": "...",
       "sap_password": "...",
       "sap_client": "100"
     }
     ```
   - `dashboard-mcp` merespons:
     ```json
     {
       "token": "sap_bound_tok_xyz123...",
       "expiresIn": 86400
     }
     ```
   - Backend menyimpan token ini ke `user_sap_tokens`.
   - **Mekanisme Fallback (Backward Compatibility)**: Jika `dashboard-mcp` mengembalikan HTTP 404 / 501 (karena endpoint belum selesai di sisi dashboard-mcp), backend tetap menyimpan kredensial lokal dan menandai status `token_bound: false`. Runtime tool SAP akan menggunakan header `X-SAP-User/Password` lama (*ponytail: bridge until dashboard-mcp sap-token endpoint ships*).

#### 3.2.3. Onboarding Wajib & Penegakan Runtime di `agent.py`
- Sebelum memanggil tool MCP kategori SAP (misal `sap-leader-mcp__*` atau `query_table`):
  1. Periksa apakah pengguna memiliki token aktif di `user_sap_tokens` untuk target server terpilih.
  2. Jika token tidak ditemukan (dan fallback kredensial dasar juga kosong):
     - Eksekusi tool dihentikan seketika.
     - Agen membalas dengan status terstruktur: `NEED_SAP_CREDENTIAL` disertai pesan ramah dalam bahasa aktif: *"Anda belum menghubungkan kredensial SAP untuk target ini. Silakan buka Pengaturan > SAP Credentials untuk mengatur akun Anda."*
     - Frontend mendeteksi error ini dan menampilkan toast dengan tombol pintas langsung ke modal pengaturan SAP.

---

### 3.3. Pembersihan Access Control (Purge RBAC Lokal)

#### 3.3.1. Frontend
- Hapus file: `frontend/src/components/AdminAccessControl.jsx` (2.236 baris).
- Di `frontend/src/components/AdminDashboard.jsx`:
  - Hapus import `AdminAccessControl`.
  - Hapus tab definition `{ id: 'access', icon: ShieldCheck, label: t('admin.tabAccess') }`.
  - Hapus blok kondisional rendering `{activeTab === 'access' && <AdminAccessControl ... />}`.
- Di `frontend/src/lib/api.js`:
  - Hapus fungsi: `adminAccessResources`, `adminSyncAccessResources`, `adminAccessRoles`, `adminUpdateAccessRoles`, `adminUserAccess`, `adminUpdateUserAccess`, `adminBulkUserAccess`, `adminAccessAudit`, `adminToggleAccessMaster`.
- Di `frontend/src/lib/i18n.js`:
  - Bersihkan key i18n yang terkait langsung dengan menu access control (`admin.tabAccess`).

#### 3.3.2. Backend
- Hapus file: `backend/access_control.py` (1.300+ baris).
- Di `backend/main.py`:
  - Hapus startup hook: `access_control.start_role_change_listener()`.
  - Hapus endpoint-endpoint berikut:
    - `GET/POST /api/admin/access/resources` & `/sync`
    - `GET/PUT /api/admin/access/roles`
    - `GET/PUT /api/admin/access/users/{username}`
    - `POST /api/admin/access/bulk`
    - `GET /api/admin/access/audit`
    - `POST /api/admin/access/enabled`
  - Pada endpoint `GET /api/mcp/servers`: Hapus panggilan `access_control.filter_servers_for_user()`. Tampilkan server langsung dari registry lokal atau gateway.
- Di `backend/agent.py`:
  - Hapus import `access_control`.
  - Ganti seluruh panggilan `access_control.assert_can_use(...)`, `access_control.allowed_connectors(...)`, dan `access_control.log_audit(...)` menjadi *pass-through* (izinkan seluruh tool call; validasi izin wewenang dilakukan di upstream gateway `dashboard-mcp`).

---

## 4. Rencana Pengujian & Verifikasi

1. **Uji Konfigurasi MCP (URL-only)**:
   - Memastikan simpan server MCP baru tanpa token berhasil di DB dan muncul di `GET /api/admin/mcp/servers`.
   - Memastikan `_get_client_config()` menggunakan URL dari DB lokal jika ada, dan `get_client()` selalu menginjeksi header `Authorization: Bearer <user_token>`.
2. **Uji SAP Token Binding**:
   - Uji pemanggilan `POST /api/me/sap-credentials/bind-token` dengan mock upstream dashboard-mcp.
   - Uji fallback ketika endpoint upstream mengembalikan status 404 (harus tetap mengizinkan chat via legacy headers).
   - Uji skenario pengguna baru tanpa kredensial SAP saat memanggil tool SAP (harus menerima `NEED_SAP_CREDENTIAL`).
3. **Uji Regresi & Build**:
   - `backend/venv/bin/pytest backend/tests/` (seluruh suite harus lolos).
   - `cd frontend && npm run build` (harus bersih tanpa error bundle atau missing import).
   - Smoke test manual login dan navigasi admin (tab Access Control dipastikan hilang).

---

## 5. Matriks Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dashboard-MCP belum siap dengan endpoint `/v1/integration/sap-tokens` | Pengguna gagal mengikat token SAP | Fallback transparan: jika 404/501, simpan kredensial lokal dan gunakan `X-SAP-*` headers lama. Ditandai komentar `ponytail:`. |
| Pengguna lama belum melakukan bind token SAP | Chat SAP terblokir | Pesan error edukatif dan modal yang langsung mengarahkan ke tab SAP Settings. |
| Referensi `access_control` tertinggal di modul lain | Crash `NameError` saat runtime | Pengecekan menyeluruh via `grep` pada seluruh file backend dan frontend sebelum commit. |
