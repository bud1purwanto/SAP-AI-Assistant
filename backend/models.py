from pydantic import BaseModel, Field
from typing import List, Optional

class SourceReference(BaseModel):
    """Model untuk referensi sumber (Agentic Traceability)."""
    type: str = Field(..., description="Tipe sumber, misal: 'MCP', 'RAG'")
    name: str = Field(..., description="Nama tool atau dokumen referensi")
    content: str = Field(..., description="Cuplikan data yang diambil")

class Attachment(BaseModel):
    """Lampiran yang dikirim pengguna sebagai konteks."""
    upload_id: str
    filename: str
    kind: str = Field(default="document", description="'image' atau 'document'")
    content_type: str = ""
    size: int = 0


class ChatRequest(BaseModel):
    """Model untuk request pesan masuk dari user."""
    message: str = Field(..., description="Pesan dari user")
    history: List[dict] = Field(default_factory=list, description="Histori chat")
    session_id: Optional[str] = Field(default=None, description="ID Sesi percakapan")
    selected_server: str = Field(default="all", description="Target MCP Server: 'all', 'sap', 'rag', atau 'sap:target_alias'")
    server: Optional[str] = Field(default=None, description="Alias untuk kompatibilitas frontend")
    active_server: Optional[str] = Field(default=None, description="Alias untuk kompatibilitas frontend")
    attachment_ids: List[str] = Field(default_factory=list, description="ID lampiran sebagai konteks")
    mode: Optional[str] = Field(default=None, description="Kode mode chat yang dipilih (misal: 'fast', 'medium', 'expert')")

class GeneratedArtifact(BaseModel):
    """Berkas (Excel/CSV) yang dihasilkan asisten dan siap diunduh."""
    artifact_id: str = Field(..., description="ID untuk mengunduh berkas")
    filename: str = Field(..., description="Nama berkas")
    type: str = Field(..., description="Jenis berkas: 'xlsx' atau 'csv'")
    size: int = Field(default=0, description="Ukuran berkas dalam byte")


class UsageStats(BaseModel):
    """Pemakaian token dan waktu untuk satu permintaan.

    Ditampilkan apa adanya kepada pengguna. Angka token datang dari provider —
    bila provider tidak melaporkannya, nilainya None dan antarmuka menyembunyikan
    bagian itu alih-alih menampilkan tebakan.
    """
    prompt_tokens: Optional[int] = Field(default=None, description="Token masukan")
    completion_tokens: Optional[int] = Field(default=None, description="Token keluaran")
    total_tokens: Optional[int] = Field(default=None, description="Total token")
    cached_tokens: Optional[int] = Field(
        default=None,
        description="Bagian token masukan yang dilayani dari cache provider",
    )
    latency_ms: Optional[int] = Field(default=None, description="Waktu proses di server, milidetik")
    model: Optional[str] = Field(default=None, description="Model yang menjawab")
    tool_calls: int = Field(default=0, description="Jumlah pemanggilan tool SAP/RAG")
    estimated: bool = Field(
        default=False,
        description="True bila jumlah token diperkirakan sendiri karena provider tidak melaporkannya",
    )


class ChatResponse(BaseModel):
    """Model untuk response dari AI."""
    reply: str = Field(..., description="Jawaban dari asisten AI")
    sources: List[SourceReference] = Field(default_factory=list, description="Daftar referensi sumber data yang digunakan")
    session_id: Optional[str] = Field(default=None, description="ID Sesi percakapan yang aktif")
    message_id: Optional[int] = Field(default=None, description="ID pesan di database")
    user_message_id: Optional[int] = Field(
        default=None,
        description="ID pesan pengguna yang memicu jawaban ini; dipakai fitur edit pertanyaan",
    )
    artifacts: List[GeneratedArtifact] = Field(default_factory=list, description="Berkas yang dihasilkan asisten")
    usage: Optional["UsageStats"] = Field(
        default=None,
        description="Pemakaian token dan waktu proses untuk permintaan ini",
    )
    quota: Optional[dict] = Field(
        default=None,
        description="Sisa kuota token harian pengguna setelah permintaan ini",
    )