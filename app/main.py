import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import get_settings
from app.llm import LLMError, stream_completion

app = FastAPI(title="your-ai", description="Your own AI app: chatbot, assistant and generator API")

STATIC_DIR = Path(__file__).parent / "static"
HISTORY_LIMIT = 32


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[dict] = Field(default_factory=list)


def _build_messages(history: list[dict], message: str) -> list[dict]:
    settings = get_settings()
    valid = [m for m in history if isinstance(m, dict) and m.get("role") in ("system", "user", "assistant") and isinstance(m.get("content"), str)]
    trimmed = valid[-HISTORY_LIMIT:]
    if not any(m["role"] == "system" for m in trimmed):
        trimmed = [{"role": "system", "content": settings.system_prompt}, *trimmed]
    return [*trimmed, {"role": "user", "content": message}]


def _stream_response(messages: list[dict]):
    settings = get_settings()

    async def event_stream():
        try:
            async for token in stream_completion(settings, messages):
                yield f"data: {json.dumps({'delta': token})}\n\n"
        except LLMError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "model": settings.model,
        "demo_mode": settings.api_key is None,
    }


@app.post("/api/chat")
def chat(body: ChatRequest):
    return _stream_response(_build_messages(body.history, body.message))


@app.post("/api/generate")
async def generate(body: ChatRequest):
    messages = _build_messages(body.history, body.message)
    parts: list[str] = []
    try:
        async for token in stream_completion(get_settings(), messages):
            parts.append(token)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"text": "".join(parts)}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
