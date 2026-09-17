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

    # 6. Specific time (daily@HH:MM) in WIB (UTC+7)
    # Set target to 08:00 WIB
    wib_tz = timezone(timedelta(hours=7))
    now_wib = now.astimezone(wib_tz)
    
    # Target in future today -> should NOT run
    future_hour = (now_wib.hour + 2) % 24
    if future_hour > now_wib.hour: # safely in the future today
        task_future = {"is_active": True, "last_run_at": None, "cron_expression": f"daily@{future_hour:02d}:00"}
        assert should_run(task_future, now) is False

    # Target in past today, not run today -> should run
    past_hour = (now_wib.hour - 1)
    if past_hour >= 0:
        task_past_due = {"is_active": True, "last_run_at": (now - timedelta(days=1)).isoformat(), "cron_expression": f"daily@{past_hour:02d}:00"}
        assert should_run(task_past_due, now) is True

    # 7. Interval task (interval_2h)
    task_interval = {"is_active": True, "last_run_at": (now - timedelta(hours=3)).isoformat(), "cron_expression": "interval_2h"}
    assert should_run(task_interval, now) is True

    task_interval_not_yet = {"is_active": True, "last_run_at": (now - timedelta(hours=1)).isoformat(), "cron_expression": "interval_2h"}
    assert should_run(task_interval_not_yet, now) is False



def test_scheduled_tasks_database_crud(db):
    # Buat task baru dengan multiple recipients
    task = db.create_scheduled_task(
        user_id="test_user",
        title="Test PO Monitoring",
        prompt="Cek PO belum rilis",
        cron_expression="daily@08:00",
        email_to="tester1@example.com, tester2@example.com; tester3@example.com",
        is_active=True
    )
    assert task is not None
    assert task["title"] == "Test PO Monitoring"
    assert task["cron_expression"] == "daily@08:00"
    assert task["is_active"] is True
    task_id = task["id"]

    # Ambil task
    fetched = db.get_scheduled_task(task_id)
    assert fetched["id"] == task_id
    assert "tester1@example.com" in fetched["email_to"]
    assert "tester2@example.com" in fetched["email_to"]

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


def test_task_lease_allows_one_owner_and_fences_stale_completion(db):
    task = db.create_scheduled_task(
        user_id="TRSTDEV",
        title="Lease test",
        prompt="check",
        cron_expression="daily",
    )

    first = db.claim_scheduled_task(task["id"], "worker-a")
    assert first is not None
    assert db.claim_scheduled_task(task["id"], "worker-b") is None

    from sqlalchemy import text
    with db.get_engine().connect() as conn:
        conn.execute(text("""
            UPDATE ai_assistant_dev.scheduled_tasks
            SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second'
            WHERE id = :tid
        """), {"tid": task["id"]})
        conn.commit()

    second = db.claim_scheduled_task(task["id"], "worker-b")
    assert second is not None
    assert db.record_task_run(task["id"], "success", "stale", lease_owner="worker-a") is False
    assert db.record_task_run(task["id"], "success", "current", lease_owner="worker-b") is True

    completed = db.get_scheduled_task(task["id"])
    assert completed["last_status"] == "success"
    assert completed["last_result"] == "current"
    assert completed["lease_owner"] is None
    assert completed["lease_until"] == ""



def test_scheduled_task_lease_inactive_and_manual_conflict(db, client, admin_auth):
    task = db.create_scheduled_task(
        user_id="TRSTDEV",
        title="Inactive & Conflict Test",
        prompt="test prompt",
        cron_expression="daily",
        is_active=False
    )
    task_id = task["id"]

    # 1. Scheduled claim rejects inactive task
    assert db.claim_scheduled_task(task_id, "worker-1", allow_inactive=False) is None

    # 2. Manual claim allows inactive task
    claimed = db.claim_scheduled_task(task_id, "manual-worker", allow_inactive=True)
    assert claimed is not None
    assert claimed["lease_owner"] == "manual-worker"

    # 3. API run returns 409 conflict when task is currently leased
    resp = client.post(f"/api/scheduled-tasks/{task_id}/run", headers=admin_auth)
    assert resp.status_code == 409

    # 4. Once lease is released, API run succeeds (200)
    assert db.record_task_run(task_id, "success", "done", lease_owner="manual-worker") is True
    with patch("scheduler.execute_task") as mock_exec:
        resp = client.post(f"/api/scheduled-tasks/{task_id}/run", headers=admin_auth)
        assert resp.status_code == 200

    db.delete_scheduled_task(task_id)


@pytest.mark.asyncio
async def test_execute_task_failure_clears_lease(db):
    from scheduler import execute_task

    task = db.create_scheduled_task(
        user_id="TRSTDEV",
        title="Failing Task Test",
        prompt="will fail",
        cron_expression="daily",
    )
    task_id = task["id"]
    lease_owner = "worker-fail-test"
    claimed = db.claim_scheduled_task(task_id, lease_owner)
    assert claimed is not None

    with patch("agent.process_chat", side_effect=RuntimeError("Simulated LLM crash")):
        res = await execute_task(claimed, lease_owner=lease_owner)
        assert res["status"] == "failed"

    after_fail = db.get_scheduled_task(task_id)
    assert after_fail["last_status"] == "failed"
    assert "Simulated LLM crash" in after_fail["last_result"]
    assert after_fail["lease_owner"] is None
    assert after_fail["lease_until"] == ""

    db.delete_scheduled_task(task_id)


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


def test_build_monitoring_email_html():
    from scheduler import build_monitoring_email_html
    md_sample = (
        "### 📋 Daftar PO Belum Rilis\n\n"
        "| Nomor PO | Vendor | Nilai |\n"
        "|:---|:---|:---|\n"
        "| **4508000306** | TOYOBO | `160,770,000` |\n\n"
        "- Item: Inline Monitoring\n"
        "- Status: In Release\n"
    )
    html = build_monitoring_email_html("Rekap PO", md_sample, "07 September 2026, 15:48 WIB")
    assert "<table" in html
    assert "border-collapse" in html
    assert "bgcolor=\"#3730a3\"" in html  # Outlook MSO banner
    assert "bgcolor=\"#f1f5f9\"" in html  # Table header
    assert "4508000306" in html
    assert "TOYOBO" in html
    assert "<code" in html


