import uuid
from datetime import datetime, timezone, timedelta
from database import (
    ensure_user_exists,
    create_user_session,
    get_user_session,
    get_active_sessions_by_username,
    update_session_heartbeat,
)

def test_concurrent_sessions_both_remain_active():
    test_user = f"test_concurrent_{uuid.uuid4().hex[:6]}"
    ensure_user_exists(username=test_user, role="user", roles=["user"])

    sess_a = str(uuid.uuid4())
    sess_b = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=24)

    # 1. Login Device A
    create_user_session(
        session_id=sess_a,
        username=test_user,
        device_name="PC (Chrome - Windows)",
        device_type="desktop",
        expires_at=exp,
    )

    # Cek sesi A aktif
    active_before = get_active_sessions_by_username(test_user)
    assert len(active_before) == 1
    assert active_before[0]["id"] == sess_a

    # 2. Login Device B (Tanpa memutus sesi A)
    # Backend main.py sekarang memanggil get_active_sessions_by_username dan tidak lagi memanggil invalidate_existing_user_sessions
    active_other = get_active_sessions_by_username(test_user)
    assert len(active_other) == 1  # Mendeteksi Device A

    create_user_session(
        session_id=sess_b,
        username=test_user,
        device_name="HP (Safari - iOS)",
        device_type="mobile",
        expires_at=exp,
    )

    # 3. Keduanya harus tetap aktif di database
    active_all = get_active_sessions_by_username(test_user)
    assert len(active_all) == 2
    ids = {s["id"] for s in active_all}
    assert sess_a in ids
    assert sess_b in ids

    # 4. Sesi A tidak boleh ditandai is_active = False atau kicked
    db_sess_a = get_user_session(sess_a)
    assert db_sess_a["is_active"] is True
    assert db_sess_a["status"] == "active"
    assert db_sess_a["kick_reason"] is None

    # 5. Heartbeat untuk Sesi A dan Sesi B sama-sama harus sukses dan memperpanjang expires_at (sliding)
    ok_a, reason_a = update_session_heartbeat(sess_a, current_action="Browsing")
    assert ok_a is True
    assert reason_a is None

    ok_b, reason_b = update_session_heartbeat(sess_b, current_action="Browsing Mobile")
    assert ok_b is True
    assert reason_b is None

    db_sess_a_updated = get_user_session(sess_a)
    assert db_sess_a_updated["expires_at"] > now + timedelta(hours=23)

