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

class ChatResponse(BaseModel):
    """Model untuk response dari AI."""
    reply: str = Field(..., description="Jawaban dari asisten AI")
    sources: List[SourceReference] = Field(default_factory=list, description="Daftar referensi sumber data yang digunakan")
