import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, ChevronDown, ChevronUp, Copy, Database, Download, FileSpreadsheet, FileText, FileType, Image as ImageIcon, Info, Pencil, RefreshCw, Sparkles, Terminal, ThumbsDown, ThumbsUp, User, X } from 'lucide-react';
import { api, fetchArtifactBlob, fetchAttachmentBlob } from '../lib/api';
import MermaidDiagram from './MermaidDiagram';
import UsagePill from './UsagePill';

const ARTIFACT_ICON = {
  xlsx: <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />,
  csv: <FileText className="w-4 h-4" aria-hidden="true" />,
  docx: <FileType className="w-4 h-4" aria-hidden="true" />,
};

const ARTIFACT_LABEL = {
  xlsx: 'Excel',
  csv: 'CSV',
  docx: 'Word',
};

const formatSize = (bytes) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Unduh berkas lewat fetch, bukan tautan langsung.
 *
 * Endpointnya memerlukan header Authorization, sementara navigasi <a href>
 * tidak dapat menyertakan header tersebut.
 */
const downloadArtifact = async (file) => {
  try {
    const blob = await fetchArtifactBlob(file.artifact_id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Gagal mengunduh berkas:', err);
    alert(err.message || 'Berkas gagal diunduh.');
  }
};

/** Terjemahkan nama tool internal menjadi keterangan yang dapat dipahami pengguna. */
const describeSource = (src) => {
  const name = (src.name || '').toLowerCase();
  if (name.includes('read_table')) return 'Pembacaan tabel data SAP';
  if (name.includes('program') || name.includes('abap')) return 'Pembacaan program ABAP';
  if (name.includes('function')) return 'Pemanggilan fungsi SAP';
  if (name.includes('search')) return 'Pencarian pada dokumen internal';
  return src.type === 'MCP' ? 'Pembacaan data SAP' : 'Rujukan dokumen';
};

const formatTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Lampiran pada pesan pengguna. Gambar ditampilkan sebagai pratinjau kecil;
 * karena endpointnya memerlukan token, berkasnya diambil sebagai blob.
 */
const AttachmentChip = ({ item }) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (item.kind !== 'image') return undefined;
    let objectUrl;
    let cancelled = false;

    fetchAttachmentBlob(item.upload_id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => { /* pratinjau gagal; tetap tampilkan namanya */ });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.upload_id, item.kind]);

  if (item.kind === 'image' && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={item.filename}
        className="max-h-40 w-auto max-w-full sm:max-w-[12rem] rounded-2xl border border-line object-cover"
      />
    );
  }

  return (
    <span className="flex min-w-0 max-w-full items-center gap-2 px-3 py-2.5 bg-surface-raised border border-line rounded-2xl text-xs">
      {item.kind === 'image'
        ? <ImageIcon className="w-3.5 h-3.5 text-content-muted" aria-hidden="true" />
        : <FileText className="w-3.5 h-3.5 text-content-muted" aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate text-content font-medium">{item.filename}</span>
    </span>
  );
};

/**
 * Salin teks ke clipboard secara universal (mendukung HTTPS, HTTP, iOS Safari, dan PWA).
 */
const copyToClipboard = async (text) => {
  if (!text) return false;

  // 1. Coba Modern Clipboard API jika tersedia & konteks aman
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Modern navigator.clipboard gagal, beralih ke fallback execCommand:', err);
    }
  }

  // 2. Fallback untuk non-HTTPS / Safari iOS / PWA / browser lama
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    // Khusus iOS Safari
    if (navigator.userAgent.match(/ipad|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus();
      textArea.select();
    }

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback execCommand copy gagal:', err);
    return false;
  }
};

/**
 * Komponen blok kode dengan tombol salin mandiri.
 */
const CodeBlock = ({ codeString, ...props }) => {
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(codeString);
    if (ok) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-slate-800 shadow-md">
      {/* Code block terminal top bar */}
      <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-slate-400 font-medium flex items-center gap-1">
            <Terminal className="w-3 h-3 text-slate-400" /> ABAP / Source Code
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-[11px] cursor-pointer"
          title="Salin potongan kode"
          aria-label="Salin potongan kode"
        >
          {codeCopied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-sans font-medium">Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans font-medium">Salin</span>
            </>
          )}
        </button>
      </div>
      <pre className="block bg-slate-900 text-slate-100 font-mono text-xs p-4 overflow-x-auto leading-relaxed">
        <code {...props}>{codeString}</code>
      </pre>
    </div>
  );
};

/**
 * Pembungkus tabel yang bisa digeser.
 *
 * Petunjuk "geser" hanya ditampilkan bila tabelnya memang lebih lebar dari
 * layar — kalau tidak, petunjuk itu justru mengganggu.
 */
const ScrollableTable = ({ children }) => {
  const scrollRef = useRef(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();

    // Lebar berubah saat layar diputar atau sidebar dibuka.
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="my-3">
      <div
        ref={scrollRef}
        className="overflow-x-auto overscroll-x-contain rounded-xl border border-line shadow-sm"
      >
        <table className="w-max min-w-full divide-y divide-line text-xs">{children}</table>
      </div>
      {overflows && (
        <p className="mt-1.5 px-2 text-[11px] text-content-subtle">
          Geser tabel ke samping untuk melihat kolom lainnya
        </p>
      )}
    </div>
  );
};

/**
 * Peta komponen untuk ReactMarkdown.
 *
 * WAJIB dibuat di luar render dan di-memo. Objek `components` yang dibuat
 * ulang setiap render membuat react-markdown memperlakukan komponennya
 * sebagai tipe baru, sehingga seluruh isi pesan DI-MOUNT ULANG pada setiap
 * perubahan state sekecil apa pun — termasuk saat membuka panel sumber data.
 * Akibatnya diagram Mermaid hilang lalu digambar ulang: tinggi isi menciut
 * lalu memuai, dan layar meloncat (terukur 976px) sekaligus terasa tersendat.
 */
const buatKomponenMarkdown = (isStreaming) => ({
              p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed text-content-secondary break-words [overflow-wrap:anywhere]">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 sm:pl-5 my-2.5 space-y-1 text-content-secondary break-words [overflow-wrap:anywhere]">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 sm:pl-5 my-2.5 space-y-1 text-content-secondary break-words [overflow-wrap:anywhere]">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed break-words [overflow-wrap:anywhere]">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-content">{children}</strong>,
              code: ({ inline, className: _className, children, ...props }) => {
                const codeString = String(children || '').replace(/\n$/, '');
                const isMultiLine = codeString.includes('\n');
                const isShort = !isMultiLine && codeString.length <= 60;

                // Blok ```mermaid digambar sebagai bagan, bukan ditampilkan
                // sebagai kode. Penanda bahasanya ada di className.
                if (!inline && /language-mermaid/.test(_className || '')) {
                  return <MermaidDiagram chart={codeString} isStreaming={isStreaming} />;
                }

                if (inline || isShort) {
                  return (
                    <code 
                      className="inline-flex items-center whitespace-nowrap font-mono text-[11.5px] sm:text-[12.5px] px-1.5 py-0.5 mx-0.5 rounded-lg bg-accent-soft text-accent-soft-fg border border-accent/25 font-semibold select-all" 
                      {...props}
                    >
                      {codeString}
                    </code>
                  );
                }

                return <CodeBlock codeString={codeString} {...props} />;
              },
              /* Ukuran heading dulu lebih KECIL daripada teks isinya: isi
                 gelembung 14px, sedangkan h3 hanya 12px dan h2 pas 14px.
                 Akibatnya judul bagian justru terbaca lebih lemah daripada
                 paragraf di bawahnya. Setiap tingkat kini lebih besar dari
                 teks isi dan berbeda jelas satu sama lain. */
              h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold text-content mt-5 mb-2 first:mt-0 font-display break-words [overflow-wrap:anywhere]">{children}</h1>,
              h2: ({ children }) => <h2 className="text-[17px] sm:text-lg font-bold text-content mt-5 mb-2 first:mt-0 font-display break-words [overflow-wrap:anywhere]">{children}</h2>,
              h3: ({ children }) => <h3 className="text-[15.5px] sm:text-base font-bold text-content mt-4 mb-1.5 first:mt-0 font-display break-words [overflow-wrap:anywhere]">{children}</h3>,
              h4: ({ children }) => <h4 className="text-[14.5px] sm:text-[15px] font-bold text-content-secondary mt-3.5 mb-1 first:mt-0 font-display break-words [overflow-wrap:anywhere]">{children}</h4>,
              // Tabel lebar harus MELUBER lalu digeser, bukan dipaksa menyusut.
              // `min-w-full` saja membuat kolom mengecil sampai teksnya pecah
              // satu huruf per baris di layar ponsel; `w-max` memberi tabel
              // lebar alaminya sehingga scroll horizontal yang bekerja.
              table: ({ children }) => <ScrollableTable>{children}</ScrollableTable>,
              // Header tidak boleh pernah terpotong: itu kunci membaca kolomnya.
              th: ({ children }) => (
                <th className="bg-surface-sunken px-3 py-2 text-left font-semibold text-content whitespace-nowrap">
                  {children}
                </th>
              ),
              // Sel diberi lebar minimum agar tidak menyempit menjadi satu
              // huruf, dan lebar maksimum agar kalimat panjang tetap membungkus
              // secara wajar alih-alih membuat tabel sangat lebar.
              td: ({ children }) => (
                <td className="px-3 py-2 border-t border-line text-content-secondary tabular-nums align-top min-w-[5rem] max-w-[16rem]">
                  {children}
                </td>
              ),
});

const ChatMessage = ({ message, isStreaming = false, onRegenerate, onEdit }) => {
  const isUser = message.role === 'user' || message.sender === 'user';
  const [showSources, setShowSources] = useState(false);
  const [openDetail, setOpenDetail] = useState(null);
  const [feedback, setFeedback] = useState(message.feedback || null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const editRef = useRef(null);

  // Hanya dibuat ulang saat status mengalir berubah — bukan pada tiap render.
  const markdownComponents = useMemo(
    () => buatKomponenMarkdown(isStreaming),
    [isStreaming],
  );

  useEffect(() => {
    if (!isEditing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    // Kursor diletakkan di akhir teks, bukan menyeleksi semuanya: pengguna
    // umumnya ingin menyunting, bukan mengetik ulang dari nol.
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [isEditing]);

  useEffect(() => {
    if (message.feedback !== undefined) {
      setFeedback(message.feedback);
    }
  }, [message.feedback]);

  const timeLabel = formatTime(message.created_at);

  const handleCopy = async () => {
    const ok = await copyToClipboard(message.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const startEditing = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const submitEdit = async () => {
    const cleaned = draft.trim();
    setIsEditing(false);
    if (!cleaned || cleaned === message.content) return;
    await onEdit(cleaned);
  };

  const handleRegenerateClick = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleToggleFeedback = async (val) => {
    const nextFeedback = feedback === val ? null : val;
    setFeedback(nextFeedback);
    if (message.id) {
      try {
        await api.setMessageFeedback(message.id, nextFeedback);
      } catch (err) {
        console.error('Gagal menyimpan feedback rating:', err);
      }
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-2.5 sm:gap-3 my-4 group max-w-full overflow-hidden">
        <div className="flex flex-col items-end max-w-[88%] sm:max-w-[75%] min-w-0">
          {/* Label Header */}
          <div className="flex items-center gap-2 mb-1.5 mr-1 text-xs text-content-muted">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 py-0.5 px-1.5 rounded-md text-content-subtle hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-all cursor-pointer"
              title="Salin pesan"
              aria-label="Salin pesan"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-medium">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[10px] hidden group-hover:inline">Salin</span>
                </>
              )}
            </button>
            {onEdit && !isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="flex items-center gap-1 py-0.5 px-1.5 rounded-md text-content-subtle hover:text-content hover:bg-surface-hover active:bg-surface-sunken transition-all cursor-pointer"
                title="Ubah pertanyaan ini"
                aria-label="Ubah pertanyaan ini"
              >
                <Pencil className="w-3 h-3" aria-hidden="true" />
                <span className="text-[10px] font-medium">Edit</span>
              </button>
            )}
            <span className="font-semibold text-content-secondary">Anda</span>
            {timeLabel && <span>{timeLabel}</span>}
          </div>

          {/* Lampiran yang disertakan pengguna */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2 justify-end mb-2">
              {message.attachments.map((item) => (
                <AttachmentChip key={item.upload_id} item={item} />
              ))}
            </div>
          )}

          {/* User Message Bubble with Indigo Gradient & Soft Shadow */}
          {isEditing ? (
            <div className="w-full min-w-0 rounded-3xl rounded-tr-sm border border-accent bg-surface-raised p-2.5 shadow-sm">
              <textarea
                ref={editRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
                rows={1}
                aria-label="Ubah pertanyaan"
                className="max-h-60 w-full resize-none bg-transparent px-2 py-1 text-sm text-content outline-none"
              />
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-content-muted hover:bg-surface-hover"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={!draft.trim() || draft.trim() === message.content}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg shadow-xs transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Kirim ulang
                </button>
              </div>
              <p className="px-2 pt-1 text-[10px] text-content-subtle">
                Jawaban setelah pertanyaan ini akan digantikan.
              </p>
            </div>
          ) : (
          <div className="relative group/userbubble px-4 sm:px-5 py-3 sm:py-3.5 rounded-3xl rounded-tr-sm text-[14px] sm:text-[14.5px] leading-relaxed bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 text-white shadow-md shadow-indigo-500/15 border border-indigo-400/20 selection:bg-white/20 select-text break-words [overflow-wrap:anywhere] max-w-full overflow-hidden">
            <p className="whitespace-pre-wrap font-normal select-text break-words [overflow-wrap:anywhere] max-w-full">{message.content}</p>
          </div>
          )}
        </div>

        {/* User Avatar Circle */}
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-800 text-white flex items-center justify-center shrink-0 shadow-sm mt-1 border border-slate-600/30">
          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 sm:gap-3.5 my-4 sm:my-5 group max-w-full overflow-hidden">
      {/* AI Avatar with Glowing Gradient Ring */}
      <div className="relative mt-1 shrink-0">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-teal-500 via-emerald-500 to-indigo-500 p-[1.5px] shadow-sm shadow-emerald-500/20">
          <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center text-emerald-400">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1.5 max-w-[88%] sm:max-w-[85%] min-w-0 flex-1 overflow-hidden">
        {/* Label Header */}
        <div className="flex items-center gap-2 mb-1.5 ml-1">
          <span className="text-xs font-semibold text-content-secondary">Asisten SAP</span>
          {timeLabel && <span className="text-xs text-content-subtle">{timeLabel}</span>}
        </div>

        {/* AI Card Bubble with Subtle Glass Effect & Left Border Accent */}
        <div className="relative px-4 sm:px-6 py-4 sm:py-5 rounded-3xl rounded-tl-sm text-[14px] sm:text-[14.5px] leading-relaxed bg-surface-raised border border-line text-content shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 select-text break-words [overflow-wrap:anywhere] max-w-full overflow-hidden">
          
          <div className="prose prose-sm max-w-none text-content-secondary select-text break-words [overflow-wrap:anywhere] min-w-0 max-w-full">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          
          {isStreaming && (
            <span
              className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full bg-accent"
              aria-hidden="true"
            />
          )}

          {/* Action Footer Bar — belum relevan selagi jawaban masih ditulis. */}
          {!isStreaming && (
          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
            {message.sources && message.sources.length > 0 ? (
              <button 
                type="button"
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:brightness-110 bg-accent-soft px-3 py-1.5 rounded-xl transition-all border border-accent/20 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {showSources ? 'Sembunyikan sumber' : `Lihat sumber data (${message.sources.length})`}
                </span>
                {showSources ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
            ) : (
              <div />
            )}
            
            <div className="flex items-center gap-1 bg-surface-sunken p-0.5 rounded-xl border border-line">
              {onRegenerate && (
                <button
                  type="button"
                  onClick={handleRegenerateClick}
                  disabled={isRegenerating}
                  className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-raised transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  title="Buat ulang jawaban"
                  aria-label="Buat ulang jawaban"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button 
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-raised transition-all cursor-pointer"
                title={copied ? 'Tersalin!' : 'Salin jawaban'}
                aria-label="Salin jawaban"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                type="button"
                onClick={() => handleToggleFeedback('like')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  feedback === 'like' || feedback === 'up'
                    ? 'text-teal-600 dark:text-teal-400 bg-surface-raised shadow-xs'
                    : 'text-content-muted hover:text-teal-600 dark:hover:text-teal-400 hover:bg-surface-raised'
                }`}
                title={feedback === 'like' || feedback === 'up' ? 'Batal beri nilai' : 'Jawaban membantu'}
                aria-label="Beri nilai jawaban membantu"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button 
                type="button"
                onClick={() => handleToggleFeedback('dislike')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  feedback === 'dislike' || feedback === 'down'
                    ? 'text-rose-600 dark:text-rose-400 bg-surface-raised shadow-xs'
                    : 'text-content-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-surface-raised'
                }`}
                title={feedback === 'dislike' || feedback === 'down' ? 'Batal beri nilai' : 'Jawaban kurang sesuai'}
                aria-label="Beri nilai jawaban kurang sesuai"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Biaya dan kecepatan permintaan ini — hanya untuk jawaban yang sudah selesai. */}
        {!isStreaming && <UsagePill usage={message.usage} />}

        {/* Berkas hasil (Excel/CSV) yang dibuat asisten */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-2">
            {message.artifacts.map((file) => (
              <button
                key={file.artifact_id}
                onClick={() => downloadArtifact(file)}
                className="flex w-full min-w-0 max-w-full sm:w-auto sm:max-w-sm items-center gap-2.5 px-3.5 py-2.5 bg-surface-raised border border-line rounded-2xl hover:border-accent transition-colors text-left group"
              >
                <span className="p-2 rounded-xl bg-accent-soft text-accent-soft-fg shrink-0">
                  {ARTIFACT_ICON[file.type] || <FileText className="w-4 h-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-content truncate">{file.filename}</span>
                  <span className="block truncate text-[11px] text-content-muted">
                    {ARTIFACT_LABEL[file.type] || file.type.toUpperCase()} • {formatSize(file.size)} • klik untuk unduh
                  </span>
                </span>
                <Download className="w-4 h-4 text-content-subtle group-hover:text-accent shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {/* Sumber data — ditulis dalam bahasa kerja, detail teknis disembunyikan.
            Panel ini gunanya membangun kepercayaan pada angka yang ditampilkan,
            sehingga tidak boleh tampil seperti keluaran terminal. */}
        {showSources && message.sources && (
          <div className="mt-1.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {message.sources.map((src, idx) => {
              const isLive = src.type === 'MCP';
              return (
                <div key={idx} className="bg-surface-raised border border-line rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <span className={`p-1.5 rounded-lg shrink-0 ${isLive ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-sunken text-content-muted'}`}>
                      {isLive
                        ? <Database className="w-3.5 h-3.5" aria-hidden="true" />
                        : <Info className="w-3.5 h-3.5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-content">
                        {isLive ? 'Data langsung dari sistem SAP' : 'Dokumen panduan internal'}
                      </span>
                      <span className="block text-xs text-content-muted truncate">
                        {describeSource(src)}
                      </span>
                    </span>
                    <button
                      onClick={() => setOpenDetail(openDetail === idx ? null : idx)}
                      className="text-xs font-medium text-content-muted hover:text-content px-2 py-1 rounded-lg hover:bg-surface-hover transition-colors shrink-0"
                      aria-expanded={openDetail === idx}
                    >
                      {openDetail === idx ? 'Tutup detail' : 'Detail teknis'}
                    </button>
                  </div>

                  {openDetail === idx && (
                    <div className="border-t border-line bg-surface-sunken px-4 py-3">
                      <div className="text-xs text-content-muted mb-1.5">
                        Sumber: <span className="font-mono">{src.name}</span>
                      </div>
                      <pre className="text-xs font-mono text-content-secondary bg-surface-raised border border-line p-3 rounded-xl overflow-x-auto leading-relaxed max-h-64">
                        {src.content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;