from __future__ import annotations

"""Tests for the /api/v1/health endpoint."""

from httpx import AsyncClient


async def test_health_check(client: AsyncClient) -> None:
    """GET /api/v1/health should return 200 with database connected."""
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
