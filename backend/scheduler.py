"""Scheduler pemantauan otomatis & rekap terjadwal (Daily Digest & Early Warning).

Menjalankan tugas-tugas terdaftar secara periodik di latar belakang,
mengeksekusi prompt ke agent, dan opsional mengirimkan rekap via Email MCP.
"""
import asyncio
import logging
import re
from datetime import datetime, timezone, timedelta
import markdown
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
            # Bila sudah pernah berjalan hari ini pada atau setelah jam target, jangan jalankan lagi hari ini
            if last_run_wib.date() == now_wib.date() and last_run_wib >= target_today:
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


def build_monitoring_email_html(title: str, markdown_text: str, now_wib_str: str) -> str:
    """Mengonversi respons markdown analisis SAP menjadi email HTML responsif yang kompatibel dengan Microsoft Outlook."""
    try:
        raw_html = markdown.markdown(
            markdown_text,
            extensions=["tables", "fenced_code", "nl2br", "sane_lists"]
        )
    except Exception as ex:
        logger.warning(f"Gagal mem-parse markdown via modul markdown: {ex}")
        raw_html = f"<p>{markdown_text}</p>"

    # 1. Formatting Table untuk Outlook (Border collapse, MSO cell padding, table styling)
    raw_html = re.sub(
        r"<table>",
        r'<div style="overflow-x:auto;margin:16px 0;"><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12.5px;border:1px solid #cbd5e1;background-color:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;">',
        raw_html,
    )
    raw_html = re.sub(r"</table>", r"</table></div>", raw_html)
    raw_html = re.sub(
        r"<th>",
        r'<th bgcolor="#f1f5f9" style="background-color:#f1f5f9;color:#0f172a;font-weight:700;padding:9px 12px;border:1px solid #cbd5e1;text-align:left;font-size:12px;letter-spacing:0.3px;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<td>",
        r'<td style="padding:8px 12px;border:1px solid #e2e8f0;color:#334155;font-size:12px;vertical-align:top;line-height:1.5;">',
        raw_html,
    )

    # 2. Zebra striping pada baris tabel
    def zebra_rows(match):
        tbody_content = match.group(1)
        rows = re.findall(r"<tr.*?>.*?</tr>", tbody_content, re.DOTALL)
        styled = []
        for idx, row in enumerate(rows):
            bg = "#ffffff" if idx % 2 == 0 else "#f8fafc"
            r_styled = re.sub(r"<tr.*?>", f'<tr bgcolor="{bg}" style="background-color:{bg};">', row, count=1)
            styled.append(r_styled)
        return "<tbody>" + "".join(styled) + "</tbody>"

    raw_html = re.sub(r"<tbody>(.*?)</tbody>", zebra_rows, raw_html, flags=re.DOTALL)

    # 3. Headings dengan warna solid & pembatas
    raw_html = re.sub(
        r"<h1>(.*?)</h1>",
        r'<h1 style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#0f172a;margin:22px 0 10px 0;padding-bottom:6px;border-bottom:2px solid #e2e8f0;">\1</h1>',
        raw_html,
    )
    raw_html = re.sub(
        r"<h2>(.*?)</h2>",
        r'<h2 style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:16.5px;font-weight:700;color:#1e293b;margin:20px 0 8px 0;padding-bottom:4px;border-bottom:1px solid #e2e8f0;">\1</h2>',
        raw_html,
    )
    raw_html = re.sub(
        r"<h3>(.*?)</h3>",
        r'<h3 style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:700;color:#334155;margin:18px 0 6px 0;">\1</h3>',
        raw_html,
    )

    # 4. Inline code, badges, dan code blocks
    raw_html = re.sub(
        r"<pre>",
        r'<pre style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;overflow-x:auto;font-family:Consolas,Monaco,monospace;font-size:12px;color:#0f172a;line-height:1.5;margin:12px 0;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<code>(.*?)</code>",
        r'<code style="background-color:#f1f5f9;color:#4338ca;padding:2px 5px;border-radius:4px;font-family:Consolas,Monaco,monospace;font-size:11.5px;border:1px solid #e2e8f0;">\1</code>',
        raw_html,
    )

    # 5. Paragraf, Lists, Blockquotes, dan Dividers
    raw_html = re.sub(
        r"<p>",
        r'<p style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13.5px;color:#334155;line-height:1.6;margin:6px 0 10px 0;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<ul>",
        r'<ul style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13.5px;color:#334155;margin:8px 0 12px 0;padding-left:22px;line-height:1.6;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<ol>",
        r'<ol style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13.5px;color:#334155;margin:8px 0 12px 0;padding-left:22px;line-height:1.6;">',
        raw_html,
    )
    raw_html = re.sub(r"<li>", r'<li style="margin-bottom:5px;">', raw_html)
    raw_html = re.sub(
        r"<blockquote>",
        r'<blockquote style="border-left:4px solid #4f46e5;background-color:#f8fafc;padding:10px 16px;margin:12px 0;color:#475569;font-size:13px;border-radius:0 6px 6px 0;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<strong\b([^>]*)>",
        r'<strong\1 style="color:#0f172a;font-weight:700;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<a\s+([^>]+)>",
        r'<a \1 style="color:#4f46e5;font-weight:600;text-decoration:underline;">',
        raw_html,
    )
    raw_html = re.sub(
        r"<hr\s*/?>",
        r'<hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0;" />',
        raw_html,
    )

    # 6. Outlook-compatible Container Structure (Table-based layout dengan bgcolor solid untuk MSO)
    full_email = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Segoe UI,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:860px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
          <!-- Indigo Header Banner (Menggunakan bgcolor="#3730a3" murni agar tidak diabaikan oleh Outlook MSO engine) -->
          <tr>
            <td bgcolor="#3730a3" style="background-color:#3730a3;padding:22px 28px;text-align:left;">
              <div style="font-size:11px;font-weight:700;color:#c7d2fe;letter-spacing:1.2px;text-transform:uppercase;font-family:Segoe UI,Helvetica,Arial,sans-serif;">SAP AI Assistant &bull; Scheduled Monitoring</div>
              <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:6px;line-height:1.3;font-family:Segoe UI,Helvetica,Arial,sans-serif;">{title}</div>
              <div style="font-size:12px;color:#e0e7ff;margin-top:6px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">Eksekusi otomatis pada <strong>{now_wib_str}</strong></div>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td bgcolor="#ffffff" style="padding:28px;background-color:#ffffff;">
              {raw_html}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11.5px;color:#64748b;font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;">
              Laporan ini dieksekusi dan dikirimkan secara otomatis oleh modul <strong>SAP AI Assistant</strong>.<br>
              Data ditarik secara langsung dari sistem live ERP SAP perusahaan.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return full_email


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
        import json

        # Buat sesi chat baru di riwayat percakapan pengguna
        now_wib_str = datetime.now(WIB_TZ).strftime('%d/%m/%Y %H:%M')
        session_title = f"📋 [{title}] {now_wib_str}"
        session_info = database.create_chat_session(user_id, session_title)
        active_session_id = session_info.get("session_id") if session_info else None

        if active_session_id:
            # Simpan prompt pemantauan sebagai pesan pengguna
            database.add_chat_message(
                session_id=active_session_id,
                role="user",
                content=prompt,
            )

        # Ambil role otentik pemilik tugas dari basis data untuk penegakan RBAC yang ketat
        user_roles = database.get_user_roles(user_id) if hasattr(database, "get_user_roles") else ["user"]
        if not user_roles:
            user_roles = ["user"]

        req = ChatRequest(
            message=prompt,
            history=[],
            session_id=active_session_id,
            selected_server="all",
        )

        resp = await process_chat(req, user_role=user_roles, username=user_id)
        result_text = resp.reply if hasattr(resp, "reply") else (resp.message if hasattr(resp, "message") else str(resp))

        # Simpan respons asisten ke dalam sesi chat yang baru dibuat
        if active_session_id:
            sources_str = json.dumps([s.model_dump() for s in resp.sources]) if getattr(resp, "sources", None) else ""
            artifacts_str = json.dumps([a.model_dump() for a in resp.artifacts]) if getattr(resp, "artifacts", None) else ""
            database.add_chat_message(
                session_id=active_session_id,
                role="ai",
                content=result_text,
                sources=sources_str,
                artifacts=artifacts_str,
            )

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

                    now_wib_str = datetime.now(WIB_TZ).strftime('%d %B %Y, %H:%M WIB')
                    full_html = build_monitoring_email_html(title, result_text, now_wib_str)

                    mail_res = await mcp_manager.call_tool(
                        server_name="email",
                        tool_name="send_email",
                        arguments={
                            "to": to_str,
                            "subject": f"[SAP AI Monitoring] {title}",
                            "body": full_html,
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
