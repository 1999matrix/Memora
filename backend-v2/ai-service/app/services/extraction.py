import base64


def extract_text(filename: str, mime_type: str, content_base64: str) -> str:
    raw = base64.b64decode(content_base64)
    lower = filename.lower()
    if mime_type in ("text/plain", "text/markdown") or lower.endswith((".txt", ".md")):
        return raw.decode("utf-8", errors="replace")

    if mime_type == "application/pdf" or lower.endswith(".pdf"):
        import fitz  # pymupdf

        doc = fitz.open(stream=raw, filetype="pdf")
        parts = [page.get_text() for page in doc]
        return "\n\n".join(parts)

    if (
        mime_type
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or lower.endswith(".docx")
    ):
        import io

        from docx import Document

        document = Document(io.BytesIO(raw))
        return "\n".join(p.text for p in document.paragraphs if p.text.strip())

    return f"[unsupported] {filename} ({mime_type})"
