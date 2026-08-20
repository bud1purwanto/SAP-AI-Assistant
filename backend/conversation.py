"""Pengelolaan riwayat percakapan agar hemat token.

Sebelumnya seluruh isi percakapan dikirim ulang ke model pada setiap giliran,
sehingga biayanya tumbuh kuadratik terhadap panjang sesi. Modul ini memangkas
riwayat berdasarkan **anggaran token**, bukan jumlah pesan: satu jawaban
bertabel besar bisa setara puluhan pesan pendek, sehingga membatasi per jumlah
pesan memotong bagian yang salah.

Giliran terakhir selalu dipertahankan apa adanya. Yang dipadatkan hanya
giliran lama, dan pemadatannya menjaga angka tetap terbaca — ringkasan yang
mengaburkan angka berbahaya untuk data ERP.
"""
import re

# Perkiraan kasar; cukup untuk penganggaran, bukan untuk penagihan.
# Rasio ~4 karakter per token berlaku wajar untuk campuran Indonesia/Inggris.
CHARS_PER_TOKEN = 4

TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
CODE_FENCE_RE = re.compile(r"^\s*```")


def estimate_tokens(text: str) -> int:
    """Perkiraan jumlah token sebuah teks."""
    if not text:
        return 0
    return max(1, len(text) // CHARS_PER_TOKEN)


def estimate_history_tokens(history: list) -> int:
    return sum(estimate_tokens(m.get("content", "")) for m in history if isinstance(m, dict))


def compact_tables(text: str, keep_rows: int = 2) -> str:
    """Pangkas tabel markdown panjang, sisakan header dan beberapa baris awal.

    Isi tabel biasanya bagian terbesar jawaban SAP, sementara untuk konteks
    percakapan berikutnya yang dibutuhkan hanya bentuk dan sebagian isinya.
    """
    lines = text.split("\n")
    output = []
    block = []

    def flush():
        if not block:
            return
        # Baris pemisah markdown (|---|---|) tidak dihitung sebagai baris data.
        separators = [ln for ln in block if set(ln.replace("|", "").replace(" ", "")) <= {"-", ":"}]
        data_rows = [ln for ln in block if ln not in separators]

        if len(data_rows) <= keep_rows + 1:
            output.extend(block)
        else:
            header = data_rows[0]
            output.append(header)
            output.extend(separators[:1])
            output.extend(data_rows[1 : keep_rows + 1])
            output.append(f"_… {len(data_rows) - 1 - keep_rows} baris lainnya tidak ditampilkan_")
        block.clear()

    for line in lines:
        if TABLE_ROW_RE.match(line):
            block.append(line)
        else:
            flush()
            output.append(line)
    flush()

    return "\n".join(output)


def compact_code_blocks(text: str, keep_lines: int = 8) -> str:
    """Pendekkan blok kode panjang pada giliran lama."""
    lines = text.split("\n")
    output = []
    inside = False
    buffer = []

    for line in lines:
        if CODE_FENCE_RE.match(line):
            if inside:
                if len(buffer) > keep_lines:
                    output.extend(buffer[:keep_lines])
                    output.append(f"… {len(buffer) - keep_lines} baris kode lainnya dipangkas")
                else:
                    output.extend(buffer)
                buffer = []
                output.append(line)
                inside = False
            else:
                output.append(line)
                inside = True
            continue

        (buffer if inside else output).append(line)

    output.extend(buffer)
    return "\n".join(output)


def compact_message(content: str, max_chars: int = 900) -> str:
    """Padatkan satu pesan lama: tabel, blok kode, lalu batas panjang."""
    if not content:
        return ""

    compacted = compact_code_blocks(compact_tables(content))
    if len(compacted) > max_chars:
        compacted = compacted[:max_chars].rstrip() + "\n_… (bagian selanjutnya dipangkas)_"
    return compacted


def trim_history(history: list, token_budget: int, verbatim_turns: int = 3) -> tuple[list, dict]:
    """Pangkas riwayat agar muat dalam anggaran token.

    Urutan tindakan:
      1. `verbatim_turns` giliran terakhir dipertahankan apa adanya.
      2. Pesan yang lebih lama dipadatkan (tabel & blok kode dipangkas).
      3. Bila masih melebihi anggaran, pesan tertua dibuang satu per satu.

    Mengembalikan (riwayat_terpangkas, statistik).
    """
    clean = [
        m for m in (history or [])
        if isinstance(m, dict) and (m.get("content") or "").strip()
    ]
    before = estimate_history_tokens(clean)

    if not clean:
        return [], {"before": 0, "after": 0, "dropped": 0, "compacted": 0}

    # Satu giliran = pasangan user + assistant.
    keep_verbatim = min(len(clean), max(0, verbatim_turns) * 2)
    recent = clean[len(clean) - keep_verbatim:] if keep_verbatim else []
    older = clean[: len(clean) - keep_verbatim] if keep_verbatim else list(clean)

    compacted_count = 0
    compacted_older = []
    for message in older:
        content = message.get("content", "")
        shorter = compact_message(content)
        if shorter != content:
            compacted_count += 1
        compacted_older.append({**message, "content": shorter})

    result = compacted_older + recent
    dropped = 0

    # Buang dari yang tertua sampai muat. Giliran terakhir tidak pernah dibuang
    # supaya pertanyaan lanjutan tetap punya konteks langsungnya.
    while estimate_history_tokens(result) > token_budget and len(result) > keep_verbatim:
        result.pop(0)
        dropped += 1

    # Bila giliran terakhir sendiri sudah melebihi anggaran, padatkan juga —
    # lebih baik konteks berkurang daripada permintaan ditolak provider.
    if estimate_history_tokens(result) > token_budget:
        result = [{**m, "content": compact_message(m.get("content", ""), max_chars=600)} for m in result]

    return result, {
        "before": before,
        "after": estimate_history_tokens(result),
        "dropped": dropped,
        "compacted": compacted_count,
    }
