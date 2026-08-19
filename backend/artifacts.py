"""Pembuatan berkas (Excel / CSV) dari jawaban asisten.

Model tidak dapat menulis berkas biner. Sebagai gantinya model mengeluarkan
satu blok berpagar ```sap-artifact berisi JSON, lalu modul ini yang merender
berkas sungguhan dan menyimpannya untuk diunduh pengguna.
"""
import csv
import io
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# Instruksi yang disisipkan ke system prompt.
ARTIFACT_PROMPT = """## MEMBUAT BERKAS (EXCEL / CSV)
Bila pengguna meminta hasil dalam bentuk berkas Excel/spreadsheet/CSV, sertakan
SATU blok berikut di akhir jawaban (selain penjelasan singkat dalam teks biasa):

```sap-artifact
{
  "type": "xlsx",
  "filename": "stok-material.xlsx",
  "sheets": [
    {
      "name": "Stok",
      "columns": ["Material", "Plant", "Qty", "Satuan"],
      "rows": [["SRRPAI", "1000", 250, "PC"]]
    }
  ]
}
```

Aturan:
- `type` boleh "xlsx" atau "csv". Untuk "csv" gunakan tepat satu sheet.
- Isi `rows` dengan data sebenarnya yang Anda peroleh — jangan mengarang isi.
- Angka ditulis sebagai angka (250), bukan teks ("250"), agar dapat dihitung di Excel.
- Jangan menampilkan blok ini bila pengguna tidak meminta berkas.
- Tetap tampilkan ringkasan datanya sebagai tabel markdown supaya pengguna dapat
  membacanya langsung tanpa mengunduh.
"""

ARTIFACT_BLOCK_RE = re.compile(r"```sap-artifact\s*(\{.*?\})\s*```", re.DOTALL)

MAX_ROWS = 5000
MAX_COLS = 100
ARTIFACT_TTL = timedelta(hours=6)

# Penyimpanan sementara dalam memori: {artifact_id: {...}}.
# Cukup untuk unduhan sekali pakai berumur pendek; bila backend dijalankan
# dengan banyak worker, pindahkan ke penyimpanan bersama (Redis / tabel DB).
_STORE: dict[str, dict] = {}


def _prune():
    now = datetime.now(timezone.utc)
    for key in [k for k, v in _STORE.items() if v["expires_at"] < now]:
        _STORE.pop(key, None)


def _safe_filename(name: str, default_ext: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", (name or "").strip()).strip("-._")
    if not base:
        base = "hasil"
    if not base.lower().endswith(f".{default_ext}"):
        base = f"{base.rsplit('.', 1)[0]}.{default_ext}"
    return base[:80]


def _normalize_cell(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _build_xlsx(spec: dict) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="4F46E5")

    for sheet in spec["sheets"]:
        ws = wb.create_sheet(title=(sheet.get("name") or "Sheet1")[:31])
        columns = sheet.get("columns") or []
        rows = sheet.get("rows") or []

        if columns:
            ws.append([_normalize_cell(c) for c in columns])
            for cell in ws[1]:
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.freeze_panes = "A2"

        for row in rows:
            ws.append([_normalize_cell(c) for c in row])

        # Lebar kolom mengikuti isi terpanjang agar langsung terbaca.
        for idx in range(1, (len(columns) or (len(rows[0]) if rows else 1)) + 1):
            longest = len(str(columns[idx - 1])) if idx <= len(columns) else 0
            for row in rows[:200]:
                if idx <= len(row):
                    longest = max(longest, len(str(row[idx - 1])))
            ws.column_dimensions[get_column_letter(idx)].width = min(max(longest + 2, 10), 50)

        if columns and rows:
            ws.auto_filter.ref = f"A1:{get_column_letter(len(columns))}{len(rows) + 1}"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_csv(spec: dict) -> bytes:
    sheet = spec["sheets"][0]
    buf = io.StringIO()
    writer = csv.writer(buf)
    if sheet.get("columns"):
        writer.writerow(sheet["columns"])
    for row in sheet.get("rows") or []:
        writer.writerow([_normalize_cell(c) for c in row])
    # BOM agar Excel di Windows membaca UTF-8 dengan benar.
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


def _validate(spec: dict) -> tuple[bool, str]:
    if not isinstance(spec, dict):
        return False, "Spesifikasi berkas bukan objek JSON."

    kind = (spec.get("type") or "xlsx").lower()
    if kind not in ("xlsx", "csv"):
        return False, f"Tipe berkas '{kind}' tidak didukung."

    sheets = spec.get("sheets")
    if not isinstance(sheets, list) or not sheets:
        return False, "Tidak ada sheet dalam spesifikasi berkas."
    if kind == "csv" and len(sheets) > 1:
        # Berkas CSV hanya menampung satu tabel; ambil sheet pertama.
        spec["sheets"] = sheets[:1]

    total_rows = 0
    for sheet in spec["sheets"]:
        if not isinstance(sheet, dict):
            return False, "Format sheet tidak valid."
        rows = sheet.get("rows") or []
        columns = sheet.get("columns") or []
        if not isinstance(rows, list) or not isinstance(columns, list):
            return False, "Kolom atau baris sheet tidak valid."
        if len(columns) > MAX_COLS:
            return False, f"Jumlah kolom melebihi batas {MAX_COLS}."
        total_rows += len(rows)
    if total_rows > MAX_ROWS:
        return False, f"Jumlah baris ({total_rows}) melebihi batas {MAX_ROWS}."

    return True, ""


def extract_and_build(reply_text: str, owner: str) -> tuple[str, list[dict]]:
    """Ambil blok artifact dari jawaban, render berkasnya, kembalikan teks bersih.

    Mengembalikan (teks_tanpa_blok, daftar_metadata_artifact).
    """
    matches = list(ARTIFACT_BLOCK_RE.finditer(reply_text or ""))
    if not matches:
        return reply_text, []

    _prune()
    artifacts = []
    notes = []

    for match in matches:
        try:
            spec = json.loads(match.group(1))
        except json.JSONDecodeError as e:
            logger.warning(f"Blok sap-artifact bukan JSON valid: {e}")
            notes.append("_Berkas gagal dibuat: format data dari asisten tidak valid._")
            continue

        valid, reason = _validate(spec)
        if not valid:
            logger.warning(f"Spesifikasi artifact ditolak: {reason}")
            notes.append(f"_Berkas gagal dibuat: {reason}_")
            continue

        kind = (spec.get("type") or "xlsx").lower()
        try:
            data = _build_xlsx(spec) if kind == "xlsx" else _build_csv(spec)
        except Exception as e:
            logger.error(f"Gagal membangun berkas {kind}: {e}")
            notes.append("_Berkas gagal dibuat karena kesalahan internal._")
            continue

        artifact_id = uuid.uuid4().hex
        filename = _safe_filename(spec.get("filename"), kind)
        _STORE[artifact_id] = {
            "data": data,
            "filename": filename,
            "owner": owner,
            "content_type": (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                if kind == "xlsx" else "text/csv; charset=utf-8"
            ),
            "expires_at": datetime.now(timezone.utc) + ARTIFACT_TTL,
        }
        artifacts.append({
            "artifact_id": artifact_id,
            "filename": filename,
            "type": kind,
            "size": len(data),
        })

    cleaned = ARTIFACT_BLOCK_RE.sub("", reply_text).strip()
    if notes:
        cleaned = f"{cleaned}\n\n" + "\n".join(notes)
    return cleaned, artifacts


def get_artifact(artifact_id: str, owner: str):
    """Ambil berkas milik user tertentu. None bila tidak ada / kedaluwarsa / bukan miliknya."""
    _prune()
    item = _STORE.get(artifact_id)
    if not item:
        return None
    # Berkas dapat memuat data SAP; hanya pemiliknya yang boleh mengunduh.
    if (item["owner"] or "").lower() != (owner or "").lower():
        return None
    return item
