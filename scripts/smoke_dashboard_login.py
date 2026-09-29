#!/usr/bin/env python3
"""Throwaway smoke test for dashboard-mcp BFF login. Not part of CI.

Usage:
  DASHBOARD_OIDC_ISSUER=http://localhost:4000 \
  TEST_USERNAME=alice TEST_PASSWORD=secret \
  BASE_URL=http://localhost:8000 \
  python scripts/smoke_dashboard_login.py
"""
import os
import sys
import httpx

BASE = os.environ["BASE_URL"].rstrip("/")
ISSUER = os.environ["DASHBOARD_OIDC_ISSUER"].rstrip("/")
U = os.environ["TEST_USERNAME"]
P = os.environ["TEST_PASSWORD"]


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=10)

    # Happy path.
    r = c.post("/api/auth/login", json={"username": U, "password": P})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    assert "sap_session" in r.cookies, "cookie not set"
    me = c.get("/api/me")
    assert me.status_code == 200, f"/api/me failed: {me.status_code}"
    assert me.json()["username"] == U
    print("[ok] login + /api/me")

    # Bad password.
    r2 = c.post("/api/auth/login", json={"username": U, "password": "wrong-on-purpose"})
    assert r2.status_code == 401, f"expected 401, got {r2.status_code}"
    print("[ok] bad password → 401")

    # Logout.
    r3 = c.post("/api/auth/logout")
    assert r3.status_code in (200, 204)
    print("[ok] logout")

    # Post-logout /api/me should be guest/unauthorized depending on design.
    r4 = c.get("/api/me")
    assert r4.status_code in (200, 401), f"unexpected {r4.status_code}"
    print(f"[ok] post-logout /api/me → {r4.status_code}")

    print("\nSMOKE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
