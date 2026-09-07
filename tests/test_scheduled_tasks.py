import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

from scheduler import should_run


def test_scheduler_should_run():
    now = datetime.now(timezone.utc)

    # 1. Task inactive should never run
    task_inactive = {"is_active": False, "last_run_at": None, "cron_expression": "daily"}
    assert should_run(task_inactive, now) is False

    # 2. Never run task should run
    task_never_run = {"is_active": True, "last_run_at": None, "cron_expression": "daily"}
    assert should_run(task_never_run, now) is True

    # 3. Daily task run 1 hour ago should NOT run
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    task_recent = {"is_active": True, "last_run_at": one_hour_ago, "cron_expression": "daily"}
    assert should_run(task_recent, now) is False

    # 4. Daily task run 25 hours ago should run
    yesterday = (now - timedelta(hours=25)).isoformat()
    task_due = {"is_active": True, "last_run_at": yesterday, "cron_expression": "daily"}
    assert should_run(task_due, now) is True

    # 5. Hourly task run 70 minutes ago should run
    seventy_mins_ago = (now - timedelta(minutes=70)).isoformat()
    task_hourly_due = {"is_active": True, "last_run_at": seventy_mins_ago, "cron_expression": "hourly"}
    assert should_run(task_hourly_due, now) is True


def test_scheduled_tasks_database_crud(db):
    # Buat task baru
    task = db.create_scheduled_task(
        user_id="test_user",
        title="Test PO Monitoring",
        prompt="Cek PO belum rilis",
        cron_expression="daily",
        email_to="tester@example.com",
        is_active=True
    )
    assert task is not None
    assert task["title"] == "Test PO Monitoring"
    assert task["is_active"] is True
    task_id = task["id"]

    # Ambil task
    fetched = db.get_scheduled_task(task_id)
    assert fetched["id"] == task_id
    assert fetched["email_to"] == "tester@example.com"

    # Update task
    updated = db.update_scheduled_task(task_id, title="Updated PO Monitoring", is_active=False)
    assert updated["title"] == "Updated PO Monitoring"
    assert updated["is_active"] is False

    # Catat run
    db.record_task_run(task_id, "success", "10 PO ditemukan")
    after_run = db.get_scheduled_task(task_id)
    assert after_run["last_status"] == "success"
    assert "10 PO ditemukan" in after_run["last_result"]

    # Hapus task
    deleted = db.delete_scheduled_task(task_id)
    assert deleted is True
    assert db.get_scheduled_task(task_id) is None


def test_scheduled_tasks_api_endpoints(db, client, admin_auth):
    # 1. Create task via API
    resp = client.post("/api/scheduled-tasks", json={
        "title": "API Task Test",
        "prompt": "Ringkas stok material kritis",
        "cron_expression": "hourly",
        "email_to": "admin@company.com",
        "is_active": True
    }, headers=admin_auth)
    assert resp.status_code == 200
    created = resp.json()["task"]
    task_id = created["id"]
    assert created["title"] == "API Task Test"

    # 2. Get list via API
    resp = client.get("/api/scheduled-tasks", headers=admin_auth)
    assert resp.status_code == 200
    tasks = resp.json()["tasks"]
    assert any(t["id"] == task_id for t in tasks)

    # 3. Update task via API
    resp = client.put(f"/api/scheduled-tasks/{task_id}", json={
        "title": "API Task Test Updated",
        "is_active": False
    }, headers=admin_auth)
    assert resp.status_code == 200
    assert resp.json()["task"]["title"] == "API Task Test Updated"

    # 4. Trigger run now via API
    with patch("scheduler.execute_task") as mock_exec:
        resp = client.post(f"/api/scheduled-tasks/{task_id}/run", headers=admin_auth)
        assert resp.status_code == 200

    # 5. Delete task via API
    resp = client.delete(f"/api/scheduled-tasks/{task_id}", headers=admin_auth)
    assert resp.status_code == 200
    assert resp.json()["success"] is True

