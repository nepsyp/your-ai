# your-ai

This is my own AI app — a chatbot, assistant and text generator in one.

FastAPI backend + streaming web chat UI, powered by the Mistral API (or any
OpenAI-compatible provider).

## Features

- 💬 **Chat UI** — streaming responses, conversation history, dark theme
- 🤖 **Assistant API** — `POST /api/chat` (Server-Sent Events) with system prompt
- ✨ **Generator API** — `POST /api/generate` returns the full text as JSON
- 🩺 **Health check** — `GET /api/health`
- 🔌 Works with **Mistral** out of the box; point `MISTRAL_BASE_URL` at any
  OpenAI-compatible `/chat/completions` endpoint
- 🎈 **Demo mode** — runs without an API key (canned replies) so you can try the UI instantly

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000 in your browser.

For real AI answers, copy `.env.example` to `.env` and set your key:

```bash
cp .env.example .env
# then edit .env and set MISTRAL_API_KEY
```

## API examples

```bash
curl http://127.0.0.1:8000/api/health

curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi! Who are you?"}'

curl -X POST http://127.0.0.1:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a two-line poem about the sea"}'
```

## Configuration (env vars)

| Variable          | Default                        | Description                       |
| ----------------- | ------------------------------ | --------------------------------- |
| `MISTRAL_API_KEY` | —                              | API key (omit for demo mode)      |
| `MISTRAL_BASE_URL`| `https://api.mistral.ai/v1`    | Any OpenAI-compatible base URL    |
| `MISTRAL_MODEL`   | `mistral-small-latest`         | Model name                        |

## Tests

```bash
pip install pytest
pytest
```
