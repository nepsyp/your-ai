# your-ai

This is my own AI app — everything in one place: chatbot, assistant, text
generator, **image generation, video generation, voice input/output and
translation**.

FastAPI backend + tabbed web UI, powered by Mistral and any OpenAI-compatible
provider.

## Features

- 💬 **Chat** — streaming replies, conversation history, dark theme
- 🎤 **Voice input** — browser mic speech-to-text (no key needed, Chrome/Edge)
- 🔊 **Voice output** — AI replies read aloud via browser TTS (no key needed),
  or server-side TTS (`/api/speech`) with a provider key
- 🎨 **Image generation** — `POST /api/images` via any OpenAI-compatible
  images endpoint (OpenAI DALL·E, Together AI FLUX, …)
- 🎬 **Video generation** — `POST /api/videos` + `GET /api/videos/{id}` via
  Luma Dream Machine
- 🌐 **Translation** — `POST /api/translate` to any language
- ✨ **Text generation** — `POST /api/generate`
- 🩺 **Health & capabilities** — `GET /api/health`
- 🎈 **Demo mode** — chat and image generation work without any key

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000 — the chat, mic voice input, browser read-aloud,
demo image generation and demo translation all work out of the box.

For real AI everything, copy `.env.example` to `.env` and add your keys:

```bash
cp .env.example .env
# then edit .env
```

## API

| Endpoint | Method | What it does |
| --- | --- | --- |
| `/api/chat` | POST | Streaming chat (SSE) |
| `/api/generate` | POST | Full text generation (JSON) |
| `/api/translate` | POST | Translate text to a target language |
| `/api/images` | POST | Generate an image from a prompt |
| `/api/videos` | POST | Submit a video generation job |
| `/api/videos/{id}` | GET | Poll video job status / result URL |
| `/api/speech` | POST | Text → speech audio (mp3) |
| `/api/transcribe` | POST | Audio file → text |
| `/api/health` | GET | Health + capability report |

## Examples

Any HTTP client works against the endpoints listed above. From Python:

```bash
# Health
python - <<'EOF'
import urllib.request
print(urllib.request.urlopen("http://127.0.0.1:8000/api/health").read().decode())
EOF

# Chat (streaming SSE)
python - <<'EOF'
import urllib.request, json
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/chat",
    data=json.dumps({"message": "Hi! Who are you?"}).encode(),
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode())
EOF

# Translate
python - <<'EOF'
import urllib.request, json
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/translate",
    data=json.dumps({"text": "Good morning", "target_language": "Bengali"}).encode(),
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode())
EOF

# Image
python - <<'EOF'
import urllib.request, json
req = urllib.request.Request(
    "http://127.0.0.1:8000/api/images",
    data=json.dumps({"prompt": "A futuristic city at sunset"}).encode(),
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode()[:200])
EOF
```

Or with any HTTP tool you like (curl, httpie, Postman) against the endpoints
listed in the API table above.

## Configuration (env vars)

| Capability | Variables | Default provider |
| --- | --- | --- |
| Chat / translate | `MISTRAL_API_KEY`, `MISTRAL_BASE_URL`, `MISTRAL_MODEL` | Mistral (`mistral-small-latest`) |
| Image | `IMAGE_API_KEY`, `IMAGE_BASE_URL`, `IMAGE_MODEL`, `IMAGE_SIZE` | OpenAI (`dall-e-3`) — works with Together AI, etc. |
| Video | `VIDEO_API_KEY`, `VIDEO_BASE_URL`, `VIDEO_MODEL` | Luma Dream Machine (`ray-2`) |
| Voice out (server) | `TTS_API_KEY`, `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE` | OpenAI (`tts-1`) |
| Voice in (server) | `STT_API_KEY`, `STT_BASE_URL`, `STT_MODEL` | OpenAI (`whisper-1`) |

Browser voice input/output needs no keys at all and works in Chrome/Edge.

## Tests

```bash
pip install pytest
pytest
```
