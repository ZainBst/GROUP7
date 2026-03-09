"""Basic API tests. Requires backend models/config to be available for full startup."""
import os
import sys

import pytest

# Ensure we don't require MongoDB for health check
os.environ.setdefault("MONGO_MODE", "local")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from fastapi.testclient import TestClient
    from app import app
    client = TestClient(app)
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

pytestmark = pytest.mark.skipif(not HAS_FASTAPI, reason="fastapi not installed")


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_events_empty():
    response = client.get("/events?since_id=0")
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert isinstance(data["events"], list)


def test_start_stream_upload_requires_file():
    response = client.post("/start_stream", data={"type": "upload"})
    assert response.status_code == 400
    assert "file" in response.json().get("detail", "").lower()
