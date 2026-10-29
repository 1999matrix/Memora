from typing import AsyncIterator

from app.settings import settings


async def stream_chat(
    question: str,
    contexts: list[dict],
    history: list[dict],
    conversation_summary: str | None,
) -> AsyncIterator[str]:
    if settings.ai_provider == "openai" and settings.openai_api_key.strip():
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        context_block = "\n\n".join(
            f"[{i + 1}] {c.get('documentName', 'doc')}: {c.get('content', '')[:1200]}"
            for i, c in enumerate(contexts[:8])
        )
        messages = [
            {
                "role": "system",
                "content": "Answer from context only. Cite sources.",
            },
        ]
        if conversation_summary:
            messages.append(
                {"role": "system", "content": f"Summary: {conversation_summary}"}
            )
        for turn in history[-10:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append(
            {
                "role": "user",
                "content": f"Context:\n{context_block}\n\nQuestion: {question}",
            }
        )
        stream = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
        return

    preview = contexts[0].get("content", "")[:200] if contexts else ""
    stub = (
        f"Stub answer for: {question}\n"
        f"Context preview: {preview}\n"
        "Wire AI_PROVIDER=openai for real chat."
    )
    for i in range(0, len(stub), 24):
        yield stub[i : i + 24]
