# Enterprise SAP AI Assistant

Aplikasi ini adalah asisten chat berbasis AI yang ditujukan untuk berinteraksi dengan sistem SAP ECC 6.0 menggunakan arsitektur MCP (Model Context Protocol) lokal dan RAG (Retrieval-Augmented Generation) lokal.

## Arsitektur Proyek
Proyek ini menggunakan struktur monorepo:
- `/backend`: Backend server menggunakan **Python, FastAPI, dan LangChain**.
- `/frontend`: Frontend UI menggunakan **React, Vite, dan Tailwind CSS**.

---

## 1. Setup Backend

### Prasyarat:
- Python 3.9+
- MCP SAP (Node.js script `sap-leader-mcp`)
- MCP RAG (Node.js script `rag-sap`)

### Langkah-langkah:
1. Buka terminal dan masuk ke direktori backend:
   ```bash
   cd backend
   ```
2. (Opsional tapi disarankan) Buat dan aktifkan virtual environment:
   ```bash
   python -m venv venv
   # Windows
   .\venv\Scripts\activate
   # Mac/Linux
   source venv/bin/activate
   ```
3. Instal dependensi:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy file environment dan sesuaikan konfigurasinya:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` dan masukkan `OPENROUTER_API_KEY` milik Anda.*
5. Jalankan server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   *API backend akan berjalan di http://localhost:8000*

---

## 2. Setup Frontend

### Prasyarat:
- Node.js v18+

### Langkah-langkah:
1. Buka terminal baru dan masuk ke direktori frontend:
   ```bash
   cd frontend
   ```
2. Instal dependensi Node:
   ```bash
   npm install
   ```
3. Jalankan development server:
   ```bash
   npm run dev
   ```
   *UI Frontend akan berjalan di http://localhost:5173*

---

## Fitur Utama
1. **Role-Based Access Control (RBAC):** Anda dapat mengganti role (Guest, IT Admin, Production Manager) di UI untuk menguji permission akses.
2. **Agentic Traceability:** Setiap balasan AI yang menggunakan RAG atau data SAP MCP akan menampilkan tombol "View Source" untuk melihat data raw yang digunakan.
3. **Dynamic Config:** Konfigurasi seperti OpenRouter API Key dan path ke MCP SAP lokal diatur sepenuhnya melalui environment variables tanpa hardcode.
4. **🌈 Diagram & Flowchart Auto-Render (Mermaid.js):** Visualisasi otomatis alur proses bisnis SAP (Procure-to-Pay, Order-to-Cash, Production Order) langsung di bubble chat.
5. **🌐 Multilanguage & i18n Ready:** Mendukung Bahasa Indonesia (`id`) dan English (`en`) secara dinamis di seluruh antarmuka dan respons asisten.

---

## 🌐 Standar Pengembangan Multibahasa (Multilanguage Requirement)

> **ATURAN WAJIB PENGEMBANGAN:**
> Setiap pembangunan fitur baru, komponen UI, notifikasi, dan artefak **WAJIB mendukung Multibahasa (i18n)** (minimal Bahasa Indonesia `id` dan English `en`).
> 
> Dilarang meng-*hardcode* teks antarmuka secara statis. Selalu gunakan hook `useLanguage()` dan daftarkan teks ke kamus terjemahan `frontend/src/lib/i18n.js`.
>
> 📖 Baca panduan lengkapnya di: **[docs/MULTILANGUAGE_GUIDELINES.md](docs/MULTILANGUAGE_GUIDELINES.md)**.