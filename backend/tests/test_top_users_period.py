"""Top user filters use the selected period and expose a consistent API shape."""

from types import SimpleNamespace

import pytest

import database
import main


class _Rows:
    def fetchall(self):
        return [SimpleNamespace(username="alice", session_count=2)]


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
        assert database.get_top_active_users(period=period) == [{"username": "alice", "sessions": 2}]
        assert "date_trunc('day', CURRENT_TIMESTAMP)" in connection.query


@pytest.mark.asyncio
async def test_top_users_endpoint_keeps_list_response(monkeypatch):
    monkeypatch.setattr(main, "get_top_active_users", lambda **_kwargs: [{"username": "alice", "sessions": 2}])
    result = await main.get_admin_top_users_endpoint(period="today", admin={"username": "admin"})
    assert result == [{"username": "alice", "sessions": 2}]
