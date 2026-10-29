"""Memora AI sidecar — extract, chunk, embed, chat (optional OpenAI)."""

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from app.routers import health, rag
from app.settings import settings

app = FastAPI(title="Memora AI Service", version="2.0.0")
app.include_router(health.router)
app.include_router(rag.router, prefix="/v1")


@app.get("/")
def root():
    return {
        "service": "memora-ai",
        "provider": settings.ai_provider,
        "embedding_dims": settings.embedding_dimensions,
    }
