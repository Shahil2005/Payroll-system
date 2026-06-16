from fastapi import status
from fastapi.testclient import TestClient

from app.main import app


def test_home() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"message": "All Healthy"}
