"""Scheduler pemantauan otomatis & rekap terjadwal (Daily Digest & Early Warning).

Menjalankan tugas-tugas terdaftar secara periodik di latar belakang,
mengeksekusi prompt ke agent, dan opsional mengirimkan rekap via Email MCP.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
import database
from models import ChatRequest

logger = logging.getLogger(__name__)

# Zona waktu Indonesia Barat (WIB = UTC+7)
WIB_TZ = timezone(timedelta(hours=7))


def should_run(task: dict, now: datetime) -> bool:
    """Mengecek apakah tugas terjadwal sudah saatnya dijalankan."""
    if not task.get("is_active"):
        return False

    cron = (task.get("cron_expression") or "daily@08:00").strip().lower()
    now_wib = now.astimezone(WIB_TZ)

    # Parsing last_run_at
    last_run = None
    last_run_iso = task.get("last_run_at")
    if last_run_iso:
        try:
            last_run = datetime.fromisoformat(str(last_run_iso).replace("Z", "+00:00"))
            if last_run.tzinfo is None:
                last_run = last_run.replace(tzinfo=timezone.utc)
        except Exception as e:
            logger.warning(f"Format last_run_at tidak valid ({last_run_iso}): {e}")

    # Parsing created_at
    created_at = None
    created_at_iso = task.get("created_at")
    if created_at_iso:
        try:
            created_at = datetime.fromisoformat(str(created_at_iso).replace("Z", "+00:00"))
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    # 1. Penjadwalan Spesifik Jam: daily@HH:MM atau workdays@HH:MM
    if cron.startswith("daily@") or cron.startswith("workdays@"):
        is_workdays = cron.startswith("workdays@")
        # Hari kerja: Senin (0) s/d Jumat (4). Sabtu/Minggu dilewati.
        if is_workdays and now_wib.weekday() >= 5:
            return False

        try:
            time_part = cron.split("@")[1]
            h_str, m_str = time_part.split(":")
            hour, minute = int(h_str), int(m_str)
        except Exception:
            hour, minute = 8, 0

        target_today = now_wib.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # Jika waktu saat ini belum mencapai jam target hari ini
        if now_wib < target_today:
            return False

        # Cek apakah sudah pernah berjalan hari ini untuk jadwal target tersebut
        if last_run:
            last_run_wib = last_run.astimezone(WIB_TZ)
            if last_run_wib >= target_today:
                return False
        elif created_at:
            created_wib = created_at.astimezone(WIB_TZ)
            # Jika baru dibuat hari ini SETELAH jam target, tunggu besok
            if created_wib >= target_today:
                return False

        return True

    # 2. Penjadwalan Interval Waktu (Interval Jam / Menit)
    if not last_run:
        return True

    elapsed_seconds = (now - last_run).total_seconds()

    if cron in ("every_30m", "30m", "*/30", "interval_30m"):
        return elapsed_seconds >= 1800
    elif cron in ("hourly", "1h", "every_hour", "interval_1h"):
        return elapsed_seconds >= 3600
    elif cron == "interval_2h":
        return elapsed_seconds >= 7200
    elif cron == "interval_4h":
        return elapsed_seconds >= 14400
    elif cron == "interval_6h":
        return elapsed_seconds >= 21600
    elif cron == "interval_12h":
        return elapsed_seconds >= 43200
    elif cron.startswith("interval_"):
        try:
            val = cron.replace("interval_", "")
            if val.endswith("h"):
                hours = int(val.replace("h", ""))
                return elapsed_seconds >= (hours * 3600)
            elif val.endswith("m"):
                mins = int(val.replace("m", ""))
                return elapsed_seconds >= (mins * 60)
        except Exception:
            pass
        return elapsed_seconds >= 86400
    elif cron in ("daily", "24h", "every_day"):
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

        # Opsional: Kirim via Email Gateway jika email_to terisi (mendukung multiple recipients)
        if email_to and "@" in email_to:
            try:
                from mcp_manager import mcp_manager
                clean_recipients = [
                    e.strip() for e in str(email_to).replace(";", ",").split(",")
                    if e.strip() and "@" in e
                ]
                if clean_recipients:
                    to_str = ", ".join(clean_recipients)
                    logger.info(f"Mengirim hasil rekap pemantauan '{title}' ke {to_str}")

                    # Format HTML bersih dan responsif untuk Outlook dan mail client
                    html_lines = []
                    for line in result_text.splitlines():
                        if line.startswith("# "):
                            html_lines.append(f"<h2 style='color:#1e1b4b;margin-top:16px;margin-bottom:8px;font-size:18px;'>{line[2:]}</h2>")
                        elif line.startswith("## "):
                            html_lines.append(f"<h3 style='color:#312e81;margin-top:14px;margin-bottom:6px;font-size:16px;'>{line[3:]}</h3>")
                        elif line.startswith("- "):
                            html_lines.append(f"<li style='margin-bottom:4px;'>{line[2:]}</li>")
                        elif line.strip() == "":
                            html_lines.append("<div style='height:8px;'></div>")
                        else:
                            html_lines.append(f"<p style='margin:4px 0;line-height:1.6;'>{line}</p>")

                    content_html = "\n".join(html_lines)
                    now_wib_str = datetime.now(WIB_TZ).strftime('%d %B %Y, %H:%M WIB')
                    full_html = f"""
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;max-width:820px;margin:0 auto;padding:16px;">
                        <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:20px 24px;border-radius:14px;color:#ffffff;box-shadow:0 4px 12px rgba(79,70,229,0.2);">
                            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.85;">SAP AI Monitoring Digest</div>
                            <h1 style="margin:6px 0 0 0;font-size:20px;font-weight:700;color:#ffffff;">{title}</h1>
                            <p style="margin:4px 0 0 0;font-size:12px;opacity:0.9;">Eksekusi otomatis pada {now_wib_str}</p>
                        </div>
                        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05);font-size:13.5px;">
                            {content_html}
                        </div>
                        <div style="margin-top:16px;text-align:center;font-size:11px;color:#94a3b8;">
                            Laporan ini dieksekusi dan dikirimkan secara otomatis oleh modul Scheduled Monitoring SAP AI Assistant.
                        </div>
                    </div>
                    """

                    mail_res = await mcp_manager.call_tool(
                        server_name="email",
                        tool_name="send_email",
                        arguments={
                            "to": to_str,
                            "subject": f"[SAP AI Monitoring] {title}",
                            "body": result_text,
                            "html": full_html,
                        }
                    )
                    if mail_res.is_error:
                        err_msg = "\n".join(item.text for item in mail_res.content) if mail_res.content else "Unknown mail error"
                        logger.warning(f"Gagal mengirim email rekap ke {to_str}: {err_msg}")
                    else:
                        logger.info(f"Email rekap '{title}' berhasil terkirim ke {to_str}")
            except Exception as mail_err:
                logger.warning(f"Kesalahan saat mengirim email pemantauan ke {email_to}: {mail_err}")

        database.record_task_run(task_id, "success", result_text[:1800])
        return {"status": "success", "result": result_text}

    except Exception as e:
        logger.error(f"Gagal mengeksekusi pemantauan '{title}': {e}", exc_info=True)
        database.record_task_run(task_id, "failed", str(e)[:1800])
        return {"status": "failed", "error": str(e)}


async def run_scheduler_loop():
    """Loop periodik yang memeriksa tugas terjadwal setiap 30 detik."""
    logger.info("Background Worker Pemantauan Terjadwal (Scheduled Tasks) dimulai.")
    while True:
        try:
            await asyncio.sleep(30)
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
