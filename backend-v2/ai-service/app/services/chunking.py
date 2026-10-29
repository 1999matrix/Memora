def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[dict]:
    chunks: list[dict] = []
    i = 0
    index = 0
    while i < len(text):
        content = text[i : i + size].strip()
        if content:
            chunks.append(
                {
                    "content": content,
                    "chunkIndex": index,
                    "pageNumber": index // 3 + 1,
                    "metadata": {},
                }
            )
            index += 1
        i += size - overlap
    return chunks or [{"content": text or "empty", "chunkIndex": 0, "pageNumber": 1, "metadata": {}}]
