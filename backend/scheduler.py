"""Scheduler pemantauan otomatis & rekap terjadwal (Daily Digest & Early Warning).

Menjalankan tugas-tugas terdaftar secara periodik di latar belakang,
mengeksekusi prompt ke agent, dan opsional mengirimkan rekap via Email MCP.
"""
import asyncio
import logging
from datetime import datetime, timezone
import database
from models import ChatRequest

logger = logging.getLogger(__name__)


def should_run(task: dict, now: datetime) -> bool:
    """Mengecek apakah tugas terjadwal sudah saatnya dijalankan."""
    if not task.get("is_active"):
        return False

    last_run_iso = task.get("last_run_at")
    if not last_run_iso:
        return True

    try:
        # Konversi ISO string ke datetime UTC
        last_run = datetime.fromisoformat(last_run_iso.replace("Z", "+00:00"))
        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning(f"Format last_run_at tidak valid ({last_run_iso}): {e}")
        return False

    elapsed_seconds = (now - last_run).total_seconds()
    cron = (task.get("cron_expression") or "daily").strip().lower()

    if cron in ("every_30m", "30m", "*/30"):
        return elapsed_seconds >= 1800
    elif cron in ("hourly", "1h", "every_hour"):
        return elapsed_seconds >= 3600
    elif cron in ("daily", "24h", "every_day"):
        return elapsed_seconds >= 86400
    elif cron.startswith("interval_"):
        try:
            minutes = int(cron.replace("interval_", "").replace("m", ""))
            return elapsed_seconds >= (minutes * 60)
        except Exception:
            return elapsed_seconds >= 86400
    else:
        # Default toleransi 24 jam untuk cron umum
        return elapsed_seconds >= 86400


async def execute_task(task: dict) -> dict:
    """Mengeksekusi satu tugas pemantauan terjadwal."""
    task_id = task.get("id")
    title = task.get("title", "Pemantauan Terjadwal")
    prompt = task.get("prompt", "")
    user_id = task.get("user_id", "admin")
    email_to = task.get("email_to")

    logger.info(f"Menjalankan pemantauan terjadwal: '{title}' (ID: {task_id}) untuk user {user_id}")
    database.record_task_run(task_id, "running", "Sedang diproses oleh asisten AI...")

    try:
        # Import lazily to avoid circular dependencies
        from agent import process_chat

        # Cari role pengguna
        user_roles = database.get_user_roles(user_id) if hasattr(database, "get_user_roles") else ["basis"]
        primary_role = user_roles[0] if user_roles else "basis"

        req = ChatRequest(
            message=prompt,
            history=[],
            role=primary_role,
        )

        resp = await process_chat(req, username=user_id)
        result_text = resp.message if hasattr(resp, "message") else str(resp)

        # Opsional: Kirim via Email Gateway jika email_to terisi
        if email_to and "@" in email_to:
            try:
                from mcp_manager import mcp_manager
                # Cari tool send_email di MCP manager jika tersedia
                email_tool = None
                for tool in mcp_manager.get_all_tools():
                    if "send_email" in tool.name.lower() or "mail" in tool.name.lower():
                        email_tool = tool
                        break

                if email_tool:
                    logger.info(f"Mengirim hasil rekap '{title}' ke {email_to}")
                    await email_tool.ainvoke({
                        "to": email_to,
                        "subject": f"[SAP AI Monitoring] {title}",
                        "body": result_text,
                    })
                else:
                    logger.info(f"MCP Email belum aktif, ringkasan pemantauan '{title}' disimpan di log sistem.")
            except Exception as mail_err:
                logger.warning(f"Gagal mengirim email rekap ke {email_to}: {mail_err}")

        database.record_task_run(task_id, "success", result_text[:1500])
        return {"status": "success", "result": result_text}

    except Exception as e:
        logger.error(f"Gagal mengeksekusi pemantauan '{title}': {e}", exc_info=True)
        database.record_task_run(task_id, "failed", str(e)[:1500])
        return {"status": "failed", "error": str(e)}


async def run_scheduler_loop():
    """Loop periodik yang memeriksa tugas terjadwal setiap 60 detik."""
    logger.info("Background Worker Pemantauan Terjadwal (Scheduled Tasks) dimulai.")
    while True:
        try:
            await asyncio.sleep(60)
            now = datetime.now(timezone.utc)
            tasks = database.list_scheduled_tasks(only_active=True)

            for task in tasks:
                if should_run(task, now):
                    # Jalankan eksekusi di latar belakang agar tidak memblok loop
                    asyncio.create_task(execute_task(task))

        except asyncio.CancelledError:
            logger.info("Background Worker Pemantauan Terjadwal dihentikan.")
            break
        except Exception as e:
            logger.error(f"Kesalahan pada loop scheduler: {e}", exc_info=True)
            await asyncio.sleep(10)

