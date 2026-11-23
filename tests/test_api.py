from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "model" in data
    assert isinstance(data["demo_mode"], bool)


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
