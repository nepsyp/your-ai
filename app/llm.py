import json
from collections.abc import AsyncIterator

import httpx

from app.config import Settings


class LLMError(RuntimeError):
    pass


async def stream_completion(settings: Settings, messages: list[dict]) -> AsyncIterator[str]:
    if not settings.api_key:
        yield _demo_completion(messages)
        return

    payload = {
        "model": settings.model,
        "messages": messages,
        "temperature": settings.temperature,
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {settings.api_key}"}
    url = f"{settings.base_url.rstrip('/')}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    body = (await response.aread()).decode("utf-8", errors="replace")
                    raise LLMError(f"LLM provider returned {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    token = _extract_delta(line[5:].strip())
                    if token:
                        yield token
    except httpx.HTTPError as exc:
        raise LLMError(f"Could not reach LLM provider: {exc}") from exc


def _extract_delta(data: str) -> str | None:
    if not data or data == "[DONE]":
        return None
    try:
        chunk = json.loads(data)
    except json.JSONDecodeError:
        return None
    if chunk.get("object") == "error" or "error" in chunk:
        raise LLMError(f"LLM provider error: {chunk['error']}")
    choices = chunk.get("choices") or []
    if not choices:
        return None
    return choices[0].get("delta", {}).get("content")


def _demo_completion(messages: list[dict]) -> str:
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    return (
        "Demo mode: no API key is configured, so this is a canned reply.\n"
        f"You said: {last_user!r}\n"
        "Set MISTRAL_API_KEY in your .env file to get real AI answers."
    )
