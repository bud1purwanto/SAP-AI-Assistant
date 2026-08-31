"""Penganggaran riwayat percakapan dan pemadatan jawaban lama."""
import pytest

from conversation import (
    compact_message,
    compact_tables,
    estimate_history_tokens,
    trim_history,
)

TABEL_BESAR = """Berikut rekap stoknya.

| Material | Pabrik | Jumlah |
|---|---|---|
| A-001 | 1000 | 250 |
| A-002 | 1000 | 128 |
| A-003 | 2000 | 47 |
| A-004 | 2000 | 91 |
| A-005 | 3000 | 12 |
| A-006 | 3000 | 88 |

Total 616 PC."""


def _percakapan(giliran):
    """Bangun riwayat berisi `giliran` pasang tanya-jawab bertabel."""
    history = []
    for i in range(giliran):
        history.append({"role": "user", "content": f"Cek stok batch {i}"})
        history.append({"role": "assistant", "content": TABEL_BESAR})
    return history


# --- Pemadatan ---

def test_large_table_is_summarised_not_deleted():
    hasil = compact_tables(TABEL_BESAR, keep_rows=2)

    assert "| Material | Pabrik | Jumlah |" in hasil, "header tabel harus dipertahankan"
    assert "A-001" in hasil and "A-002" in hasil, "baris awal tetap ada"
    assert "A-006" not in hasil
    assert "baris lainnya tidak ditampilkan" in hasil
    assert "Total 616 PC." in hasil, "teks di luar tabel tidak boleh ikut terpotong"


def test_small_table_is_left_alone():
    kecil = "| A | B |\n|---|---|\n| 1 | 2 |"
    assert compact_tables(kecil) == kecil


def test_long_code_block_is_shortened():
    kode = "Contoh program:\n\n```abap\n" + "\n".join(f"WRITE: baris-{i}." for i in range(30)) + "\n```"
    hasil = compact_message(kode)

    assert "baris-0" in hasil
    assert "dipangkas" in hasil
    assert "baris-29" not in hasil


def test_compaction_reduces_size_substantially():
    assert len(compact_message(TABEL_BESAR)) < len(TABEL_BESAR)


# --- Penganggaran ---

def test_recent_turns_are_never_compacted():
    """Pertanyaan lanjutan bergantung pada giliran terakhir yang utuh."""
    history = _percakapan(8)
    hasil, _ = trim_history(history, token_budget=100_000, verbatim_turns=3)

    assert hasil[-1]["content"] == TABEL_BESAR
    assert hasil[-3]["content"] == TABEL_BESAR


def test_older_turns_are_compacted_when_budget_allows():
    history = _percakapan(8)
    hasil, stats = trim_history(history, token_budget=100_000, verbatim_turns=3)

    assert stats["compacted"] > 0
    assert stats["after"] < stats["before"]
    assert hasil[1]["content"] != TABEL_BESAR, "giliran lama seharusnya dipadatkan"


def test_history_is_trimmed_to_budget():
    history = _percakapan(40)
    hasil, stats = trim_history(history, token_budget=800, verbatim_turns=3)

    assert stats["after"] <= 800, stats
    assert stats["dropped"] > 0
    assert len(hasil) < len(history)


def test_last_turn_survives_even_on_a_tiny_budget():
    history = _percakapan(20)
    hasil, _ = trim_history(history, token_budget=50, verbatim_turns=1)

    assert len(hasil) >= 2, "giliran terakhir tidak boleh hilang seluruhnya"
    assert "Cek stok batch 19" in hasil[-2]["content"]


def test_empty_and_blank_messages_are_dropped():
    history = [
        {"role": "user", "content": "  "},
        {"role": "assistant", "content": ""},
        {"role": "user", "content": "Halo"},
    ]
    hasil, _ = trim_history(history, token_budget=1000)
    assert len(hasil) == 1 and hasil[0]["content"] == "Halo"


def test_cost_stops_growing_with_conversation_length():
    """Inti perubahannya: biaya per giliran berhenti tumbuh.

    Sebelumnya seluruh riwayat dikirim ulang setiap giliran, sehingga biaya
    kumulatifnya kuadratik terhadap panjang sesi.
    """
    BUDGET = 1500
    hasil = {}
    for giliran in (5, 20, 50, 100):
        _, stats = trim_history(_percakapan(giliran), token_budget=BUDGET, verbatim_turns=3)
        hasil[giliran] = stats

    # Tanpa pemangkasan, ukurannya tumbuh sebanding panjang percakapan.
    assert hasil[100]["before"] > 10 * hasil[5]["before"]

    # Dengan pemangkasan, yang dikirim ke model tetap di bawah anggaran.
    for giliran, stats in hasil.items():
        assert stats["after"] <= BUDGET, (giliran, stats)

    # Sifat yang sesungguhnya dituju: konsumsi token MENDATAR. Percakapan dua
    # kali lebih panjang tidak mengirim dua kali lebih banyak token.
    assert hasil[100]["after"] <= hasil[50]["after"] * 1.1, hasil

    # Penghematan pun membesar seiring panjangnya sesi.
    hemat = {g: 1 - s["after"] / s["before"] for g, s in hasil.items()}
    assert hemat[100] > hemat[50] > hemat[20] > hemat[5], hemat


def test_history_within_budget_is_untouched():
    history = [
        {"role": "user", "content": "Halo"},
        {"role": "assistant", "content": "Halo juga, ada yang bisa dibantu?"},
    ]
    hasil, stats = trim_history(history, token_budget=3000)

    assert hasil == history
    assert stats["dropped"] == 0 and stats["compacted"] == 0
