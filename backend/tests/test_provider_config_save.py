"""Simpan AI Provider memakai kontrak database yang sama dengan endpoint config."""

import asyncio
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import database
import main


class FakeConnection:
    def __init__(self):
        self.writes = []
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params):
        self.writes.append((str(statement), params))

    def commit(self):
        self.committed = True


class FakeEngine:
    def __init__(self, connection):
        self.connection = connection

    def connect(self):
        return self.connection


def test_save_providers_writes_config_without_type_error():
    connection = FakeConnection()
    with patch.object(database, "get_engine", return_value=FakeEngine(connection)), \
         patch.object(main, "get_user_by_username", return_value={"username": "admin", "assistant_persona": ""}), \
         patch.object(main, "update_system_config", side_effect=database.update_system_config):
        result = asyncio.run(main.update_config(main.ConfigUpdate(
            nine_router_enabled=False,
            nine_router_base_url="http://router.local/v1",
            openrouter_enabled=True,
            openrouter_model="openrouter/auto",
        ), user={"sub": "oidc-admin", "username": "admin", "roles": ["superadmin"]}))

    assert result == {"status": "success"}
    assert connection.committed
    assert any("nine_router_enabled" in sql and params["val"] == "false" for sql, params in connection.writes)
    assert any("openrouter_enabled" in sql and params["val"] == "true" for sql, params in connection.writes)


def test_save_providers_reports_database_failure():
    with patch.object(main, "get_user_by_username", return_value={"username": "admin", "assistant_persona": ""}), \
         patch.object(main, "update_system_config", return_value=False):
        with pytest.raises(HTTPException) as error:
            asyncio.run(main.update_config(main.ConfigUpdate(nine_router_enabled=True),
                                           user={"sub": "oidc-admin", "username": "admin", "roles": ["superadmin"]}))
    assert error.value.status_code == 503
