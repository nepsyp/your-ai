import json
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import get_settings
from app.llm import LLMError, stream_completion
from app.media import generate_image, get_video, submit_video, text_to_speech, transcribe_audio

app = FastAPI(
    title="your-ai",
    description=(
        "Your own all-in-one AI app: chatbot, assistant, text generator, "
        "image generator, video generator, voice and translation."
    ),
)

STATIC_DIR = Path(__file__).parent / "static"
HISTORY_LIMIT = 32


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[dict] = Field(default_factory=list)


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    target_language: str = Field(min_length=1, max_length=60)


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    size: str | None = Field(default=None, pattern=r"^\d+x\d+$")


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str | None = None


def _build_messages(history: list[dict], message: str) -> list[dict]:
    settings = get_settings()
    valid = [m for m in history if isinstance(m, dict) and m.get("role") in ("system", "user", "assistant") and isinstance(m.get("content"), str)]
    trimmed = valid[-HISTORY_LIMIT:]
    if not any(m["role"] == "system" for m in trimmed):
        trimmed = [{"role": "system", "content": settings.system_prompt}, *trimmed]
    return [*trimmed, {"role": "user", "content": message}]


@app.get("/api/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "chat_model": settings.model,
        "demo_mode": settings.api_key is None,
        "capabilities": {
            "chat": True,
            "generate": True,
            "translate": True,
            "image": True,
            "voice_input": True,
            "voice_output": True,
            "video": settings.video_api_key is not None,
            "server_tts": settings.tts_api_key is not None,
            "server_stt": settings.stt_api_key is not None,
        },
    }


@app.post("/api/chat")
def chat(body: ChatRequest):
    messages = _build_messages(body.history, body.message)
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


@app.post("/api/translate")
async def translate(body: TranslateRequest):
    settings = get_settings()
    if not settings.api_key:
        return {"text": body.text, "demo": True, "detail": "Set MISTRAL_API_KEY for real translation."}

    messages = [
        {
            "role": "system",
            "content": (
                f"You are a professional translator. Translate the user's text into {body.target_language}. "
                "Reply with ONLY the translation, nothing else."
            ),
        },
        {"role": "user", "content": body.text},
    ]
    parts: list[str] = []
    try:
        async for token in stream_completion(settings, messages):
            parts.append(token)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"text": "".join(parts).strip(), "demo": False}


@app.post("/api/images")
async def images(body: ImageRequest):
    try:
        result = await generate_image(get_settings(), body.prompt, body.size)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"image": result.url, "demo": result.demo}


@app.post("/api/videos")
async def videos(body: VideoRequest):
    try:
        job = await submit_video(get_settings(), body.prompt)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"id": job.job_id, "status": job.status}


@app.get("/api/videos/{job_id}")
async def video_status(job_id: str):
    try:
        status = await get_video(get_settings(), job_id)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": status.status, "video": status.url}


@app.post("/api/speech")
async def speech(body: SpeechRequest):
    try:
        audio = await text_to_speech(get_settings(), body.text, body.voice)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/mpeg")


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty audio file")
    try:
        text = await transcribe_audio(get_settings(), file.filename or "audio.webm", content)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"text": text}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
