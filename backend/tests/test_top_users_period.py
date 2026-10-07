"""Top user filters use the selected period and expose a consistent API shape."""

from types import SimpleNamespace

import database
import main


class _Rows:
    def fetchall(self):
        return [SimpleNamespace(username="alice", oidc_sub="oidc-alice", session_count=2)]


class _Connection:
    def __init__(self):
        self.query = ""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, _params):
        self.query = str(query)
        return _Rows()


class _Engine:
    def __init__(self, connection):
        self.connection = connection

    def connect(self):
        return self.connection


def test_today_and_day_filter_sessions_created_today(monkeypatch):
    connection = _Connection()
    monkeypatch.setattr(database, "get_engine", lambda: _Engine(connection))
    for period in ("today", "day"):
        assert database.get_top_active_users(period=period) == [{"username": "alice", "oidc_sub": "oidc-alice", "sessions": 2}]
        assert "date_trunc('day', CURRENT_TIMESTAMP)" in connection.query


def test_top_users_endpoint_keeps_list_response(monkeypatch):
    import asyncio

    async def directory(_kind, _token):
        return [{"id": "oidc-alice", "username": "alice-new", "full_name": "Alice", "role": "analyst"}]

    monkeypatch.setattr(main, "get_top_active_users", lambda **_kwargs: [{"username": "alice", "oidc_sub": "oidc-alice", "sessions": 2}])
    monkeypatch.setattr(main, "fetch_directory", directory)
    result = asyncio.run(main.get_admin_top_users_endpoint(period="today", admin={"dashboard_token": "token"}))
    assert result == [{"username": "alice-new", "oidc_sub": "oidc-alice", "full_name": "Alice", "role": "analyst", "sessions": 2}]
