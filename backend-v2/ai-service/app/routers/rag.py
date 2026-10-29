import json
from typing import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.chunking import chunk_text
from app.services.embeddings import embed_texts
from app.services.extraction import extract_text
from app.services.llm import stream_chat

router = APIRouter(tags=["rag"])


class ExtractRequest(BaseModel):
    filename: str
    mime_type: str
    content_base64: str


class ChunkRequest(BaseModel):
    text: str


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    contexts: list[dict] = Field(default_factory=list)
    history: list[ChatMessage] = Field(default_factory=list)
    conversation_summary: str | None = None


@router.post("/extract")
def extract(body: ExtractRequest):
    text = extract_text(body.filename, body.mime_type, body.content_base64)
    return {"text": text}


@router.post("/chunk")
def chunk(body: ChunkRequest):
    return {"chunks": chunk_text(body.text)}


@router.post("/embed")
def embed(body: EmbedRequest):
    vectors = embed_texts(body.texts)
    return {"embeddings": vectors}


@router.post("/chat/stream")
async def chat_stream(body: ChatRequest):
    async def events() -> AsyncIterator[bytes]:
        async for token in stream_chat(
            question=body.question,
            contexts=body.contexts,
            history=[m.model_dump() for m in body.history],
            conversation_summary=body.conversation_summary,
        ):
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n".encode()

    return StreamingResponse(events(), media_type="text/event-stream")
