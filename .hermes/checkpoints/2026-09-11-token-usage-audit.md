# Checkpoint — Audit pemakaian token (2026-09-11)

## Ruang lingkup
Audit read-only alur token provider → agent → response per request → agregasi kuota harian per user → tampilan frontend.

## Hasil verifikasi
- Tes: `backend/venv/bin/pytest tests/test_streaming_agent.py tests/test_kuota_token.py -q` lulus, exit code 0 (22 tes).
- Runtime hari ini (Asia/Jakarta): 2 user, 8 request, prompt 899041, completion 23254, total 922295, estimated_users 0, invariant total=prompt+completion valid untuk semua baris.
- TRST-BUDI: 5 request, 622258 token; jumlah pesan AI hari ini 5.
- TRSTDEV: 3 request, 300037 token; jumlah pesan AI hari ini 2.
- Tidak ada duplikasi baris username akibat perbedaan kapitalisasi.
- Model runtime 9Router dan OpenRouter memiliki `stream_usage=None`; karena custom base URL, LangChain tidak otomatis meminta streaming usage. Provider masih dapat mengirim metadata sendiri, tetapi tidak dijamin konsisten.

## Temuan
1. Statistik live per request menjumlahkan metadata semua `call_model` yang melaporkan usage, termasuk iterasi/review/fallback.
2. Jika satu panggilan melaporkan usage tetapi panggilan lain dalam request yang sama tidak, request dianggap exact (`estimated=False`) dan panggilan yang diam hilang dari hitungan.
3. Jika seluruh provider diam, fallback estimasi hanya menghitung message + history + final reply; system prompt, tool results, retries, evidence gate, dan review cycles tidak dihitung. Untuk mode Deep/Boost ini dapat undercount besar; estimasi memakai history sebelum trim sehingga juga dapat overcount bagian history.
4. `usage.model` selalu nama model primary/alias, meskipun fallback yang menjawab atau router memilih model lain.
5. Metadata usage tidak disimpan di `chat_messages`; UsagePill hanya valid pada response langsung dan hilang setelah reload. Tidak ada ledger token per chat/message untuk rekonsiliasi.
6. Agregasi per-user harian (`token_usage`) konsisten secara aritmetika dan atomic upsert, reset mengikuti Asia/Jakarta, tetapi akurasinya bergantung pada masalah sumber di atas.
7. Ada satu request TRSTDEV yang tercatat token tetapi tidak memiliki pesan AI tersimpan hari ini; agregat kuota dan riwayat chat tidak sepenuhnya dapat direkonsiliasi.

## Kesimpulan
Per-user harian valid secara mekanis tetapi belum reliable sebagai angka billing/audit. Per-chat hanya valid sementara jika seluruh model-call dalam request melaporkan metadata; belum persisten dan belum dapat diaudit setelah reload.
