import base64
import hashlib
import json
import urllib.parse
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.llm import LLMError


@dataclass
class ImageResult:
    url: str
    demo: bool = False


@dataclass
class VideoJob:
    job_id: str
    status: str


@dataclass
class VideoStatus:
    status: str
    url: str | None


async def generate_image(settings: Settings, prompt: str, size: str | None = None) -> ImageResult:
    if not settings.image_api_key:
        return ImageResult(url=_demo_image(prompt), demo=True)

    url = f"{settings.image_base_url.rstrip('/')}/images/generations"
    payload = {"model": settings.image_model, "prompt": prompt, "n": 1, "size": size or settings.image_size}
    headers = {"Authorization": f"Bearer {settings.image_api_key}"}

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise LLMError(f"Image provider returned {response.status_code}: {response.text[:300]}")
        data = response.json()["data"][0]
        if data.get("b64_json"):
            return ImageResult(url=f"data:image/png;base64,{data['b64_json']}")
        return ImageResult(url=data["url"])


async def submit_video(settings: Settings, prompt: str) -> VideoJob:
    if not settings.video_api_key:
        raise LLMError(
            "Video generation needs a provider key. Set VIDEO_API_KEY (Luma Dream Machine) in .env — see README."
        )
    url = f"{settings.video_base_url.rstrip('/')}/generations"
    headers = {"Authorization": f"Bearer {settings.video_api_key}", "accept": "application/json"}
    payload = {"prompt": prompt, "model": settings.video_model}

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code not in (200, 201, 202):
            raise LLMError(f"Video provider returned {response.status_code}: {response.text[:300]}")
        data = response.json()
        return VideoJob(job_id=data["id"], status=data.get("state", "queued"))


async def get_video(settings: Settings, job_id: str) -> VideoStatus:
    if not settings.video_api_key:
        raise LLMError("Video generation is not configured (missing VIDEO_API_KEY).")
    url = f"{settings.video_base_url.rstrip('/')}/generations/{job_id}"
    headers = {"Authorization": f"Bearer {settings.video_api_key}", "accept": "application/json"}

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            raise LLMError(f"Video provider returned {response.status_code}: {response.text[:300]}")
        data = response.json()
        return VideoStatus(status=data.get("state", "unknown"), url=(data.get("assets") or {}).get("video"))


async def text_to_speech(settings: Settings, text: str, voice: str | None = None) -> bytes:
    if not settings.tts_api_key:
        raise LLMError(
            "Server-side voice needs a provider key. Set TTS_API_KEY in .env, or use the browser voice (mic button) which needs no key."
        )
    url = f"{settings.tts_base_url.rstrip('/')}/audio/speech"
    headers = {"Authorization": f"Bearer {settings.tts_api_key}"}
    payload = {"model": settings.tts_model, "voice": voice or settings.tts_voice, "input": text}

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise LLMError(f"Speech provider returned {response.status_code}: {response.text[:300]}")
        return response.content


async def transcribe_audio(settings: Settings, filename: str, content: bytes, language: str | None = None) -> str:
    if not settings.stt_api_key:
        raise LLMError(
            "Server-side transcription needs a provider key. Set STT_API_KEY in .env, or use the browser mic which needs no key."
        )
    url = f"{settings.stt_base_url.rstrip('/')}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.stt_api_key}"}
    data = {"model": settings.stt_model}
    if language:
        data["language"] = language
    files = {"file": (filename, content)}

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        response = await client.post(url, data=data, files=files, headers=headers)
        if response.status_code != 200:
            raise LLMError(f"Transcription provider returned {response.status_code}: {response.text[:300]}")
        return response.json().get("text", "")


def _demo_image(prompt: str) -> str:
    digest = hashlib.sha256(prompt.encode()).digest()
    hue = digest[0] * 360 // 255
    hues = [(hue + offset) % 360 for offset in (0, 40, 90)]
    label = urllib.parse.quote(prompt[:60])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl({hues[0]},70%,55%)"/>
      <stop offset="0.5" stop-color="hsl({hues[1]},70%,45%)"/>
      <stop offset="1" stop-color="hsl({hues[2]},70%,35%)"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <text x="512" y="500" text-anchor="middle" font-family="sans-serif" font-size="44"
        fill="white" opacity="0.9">{label}</text>
  <text x="512" y="570" text-anchor="middle" font-family="sans-serif" font-size="30"
        fill="white" opacity="0.7">demo image — set IMAGE_API_KEY for real AI art</text>
</svg>"""
    encoded = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{encoded}"
