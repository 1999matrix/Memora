import hashlib

import numpy as np

from app.settings import settings


def _stub_embed(text: str, dim: int) -> list[float]:
    digest = hashlib.sha256(text.encode()).digest()
    vec = np.zeros(dim, dtype=np.float64)
    for i in range(dim):
        vec[i] = digest[i % len(digest)] / 255.0 * 2 - 1
    vec /= np.sqrt(dim)
    return vec.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    dim = settings.embedding_dimensions
    if settings.ai_provider == "openai" and settings.openai_api_key.strip():
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        out: list[list[float]] = []
        batch = 64
        for start in range(0, len(texts), batch):
            slice_ = texts[start : start + batch]
            resp = client.embeddings.create(
                model=settings.openai_embedding_model, input=slice_
            )
            out.extend(row.embedding for row in resp.data)
        return out
    return [_stub_embed(t, dim) for t in texts]
