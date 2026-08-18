from pydantic import BaseModel, Field
from typing import List, Optional

class SourceReference(BaseModel):
    """Model untuk referensi sumber (Agentic Traceability)."""
    type: str = Field(..., description="Tipe sumber, misal: 'MCP', 'RAG'")
    name: str = Field(..., description="Nama tool atau dokumen referensi")
    content: str = Field(..., description="Cuplikan data yang diambil")

class ChatRequest(BaseModel):
    """Model untuk request pesan masuk dari user."""
    message: str = Field(..., description="Pesan dari user")
    history: List[dict] = Field(default_factory=list, description="Histori chat")
    session_id: Optional[str] = Field(default=None, description="ID Sesi percakapan")
    selected_server: str = Field(default="all", description="Target MCP Server: 'all', 'sap', 'rag', atau 'sap:target_alias'")
    server: Optional[str] = Field(default=None, description="Alias untuk kompatibilitas frontend")
    active_server: Optional[str] = Field(default=None, description="Alias untuk kompatibilitas frontend")

class ChatResponse(BaseModel):
    """Model untuk response dari AI."""
    reply: str = Field(..., description="Jawaban dari asisten AI")
    sources: List[SourceReference] = Field(default_factory=list, description="Daftar referensi sumber data yang digunakan")
    session_id: Optional[str] = Field(default=None, description="ID Sesi percakapan yang aktif")