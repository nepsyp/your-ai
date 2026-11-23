from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "chat_model" in data
    assert "capabilities" in data
    assert data["capabilities"]["image"] is True


def test_chat_demo_mode_streams():
    get_settings.cache_clear()
    res = client.post("/api/chat", json={"message": "hello", "history": []})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert "hello" in res.text
    assert res.text.strip().endswith("data: [DONE]")


def test_chat_rejects_empty_message():
    res = client.post("/api/chat", json={"message": "", "history": []})
    assert res.status_code == 422


def test_generate_demo_mode():
    get_settings.cache_clear()
    res = client.post("/api/generate", json={"message": "write a haiku", "history": []})
    assert res.status_code == 200
    assert "text" in res.json()


def test_translate_demo_mode():
    get_settings.cache_clear()
    res = client.post("/api/translate", json={"text": "hello world", "target_language": "Bengali"})
    assert res.status_code == 200
    data = res.json()
    assert data["demo"] is True
    assert data["text"] == "hello world"


def test_images_demo_mode():
    get_settings.cache_clear()
    res = client.post("/api/images", json={"prompt": "a red house"})
    assert res.status_code == 200
    data = res.json()
    assert data["demo"] is True
    assert data["image"].startswith("data:image/svg+xml;base64,")


def test_videos_unconfigured_returns_message():
    get_settings.cache_clear()
    res = client.post("/api/videos", json={"prompt": "waves crashing"})
    assert res.status_code == 502
    assert "VIDEO_API_KEY" in res.json()["detail"]


def test_speech_unconfigured_returns_message():
    get_settings.cache_clear()
    res = client.post("/api/speech", json={"text": "hi"})
    assert res.status_code == 502
    assert "TTS_API_KEY" in res.json()["detail"]


def test_transcribe_unconfigured_returns_message():
    get_settings.cache_clear()
    res = client.post("/api/transcribe", files={"file": ("a.webm", b"fake-audio")})
    assert res.status_code == 502
    assert "STT_API_KEY" in res.json()["detail"]


def test_transcribe_empty_file_rejected():
    get_settings.cache_clear()
    res = client.post("/api/transcribe", files={"file": ("a.webm", b"")})
    assert res.status_code == 422


def test_index_served():
    res = client.get("/")
    assert res.status_code == 200
    assert "your-ai" in res.text


def test_build_messages_trims_and_injects_system():
    from app.main import _build_messages

    history = [{"role": "user", "content": f"msg {i}"} for i in range(50)]
    messages = _build_messages(history[-3:], "last")
    assert messages[0]["role"] == "system"
    assert messages[-1]["content"] == "last"
