import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { BookOpen, Check, ChevronDown, ChevronUp, Columns2, Copy, Database, Download, FileSpreadsheet, FileText, FileType, Image as ImageIcon, Info, Mail, Pencil, RefreshCw, Server, Sparkles, Terminal, ThumbsDown, ThumbsUp, User, X } from 'lucide-react';
import { api, fetchArtifactBlob, fetchAttachmentBlob } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { useLanguage } from '../hooks/useLanguage';
import MermaidDiagram from './MermaidDiagram';
import UsagePill from './UsagePill';
import { ABAP_TOKEN_CLASS, isAbapLanguage, tokenizeAbap } from '../lib/abapHighlight';

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
const downloadArtifact = async (file, t) => {
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
  }
};

/** Dapatkan informasi metadata sumber (tipe, judul, deskripsi, icon, badge). */
const getSourceMeta = (src, t) => {
  const type = (src.type || '').toUpperCase();
  const name = (src.name || '').toLowerCase();

  // 1. SQL Database
  if (type === 'SQL' || type === 'MCP_SQL' || name.includes('sql')) {
    let desc = t('chat.sourceDefaultSql');
    if (name.includes('query')) desc = t('chat.sourceSqlQuery');
    else if (name.includes('table') || name.includes('schema') || name.includes('describe')) desc = t('chat.sourceSqlTable');
    return {
      title: t('chat.sourceTitleSql'),
      description: desc,
      icon: <Server className="w-3.5 h-3.5" aria-hidden="true" />,
      badgeClass: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
    };
  }

  // 2. Email Service
  if (type === 'EMAIL' || type === 'MCP_EMAIL' || name.includes('email') || name.includes('mail') || name.includes('outlook')) {
    let desc = t('chat.sourceDefaultEmail');
    if (name.includes('search') || name.includes('find')) desc = t('chat.sourceEmailSearch');
    else if (name.includes('read') || name.includes('get')) desc = t('chat.sourceEmailRead');
    else if (name.includes('send') || name.includes('dispatch') || name.includes('draft')) desc = t('chat.sourceEmailSend');
    return {
      title: t('chat.sourceTitleEmail'),
      description: desc,
      icon: <Mail className="w-3.5 h-3.5" aria-hidden="true" />,
      badgeClass: 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
    };
  }

  // 3. RAG / Internal Knowledge Document
  if (type === 'RAG' || type === 'DOC' || type === 'DOCUMENT' || name.includes('rag_') || name.includes('knowledge')) {
    let desc = t('chat.sourceDefaultDoc');
    if (name.includes('search') || name.includes('query')) desc = t('chat.sourceSearch');
    return {
      title: t('chat.sourceTitleRag'),
      description: desc,
      icon: <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />,
      badgeClass: 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
    };
  }

  // 4. SAP Live System (Default untuk MCP SAP)
  let desc = t('chat.sourceDefaultSap');
  if (name.includes('read_table')) desc = t('chat.sourceReadTable');
  else if (name.includes('program') || name.includes('abap')) desc = t('chat.sourceAbap');
  else if (name.includes('function') || name.includes('bapi') || name.includes('rfc')) desc = t('chat.sourceFunction');
  else if (name.includes('document') || name.includes('get_sap')) desc = t('chat.sourceDocument');
  else if (name.includes('search')) desc = t('chat.sourceSearch');

  return {
    title: t('chat.sourceTitleSap'),
    description: desc,
    icon: <Database className="w-3.5 h-3.5" aria-hidden="true" />,
    badgeClass: 'bg-accent-soft text-accent-soft-fg border border-accent/20'
  };
};

const formatTime = (value, language) => {
  if (!value) return '';
  const d = new Date(value);
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
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
 * Komponen blok kode dengan tombol salin mandiri.
 */
const CodeBlock = ({ codeString, language, onBukaPanel, ...props }) => {
  const { t } = useLanguage();
  // Kode pendek cukup dibaca di tempat; panel baru berguna untuk yang panjang.
  const layakDipanel = onBukaPanel && codeString.split('\n').length > 12;
  const [codeCopied, setCodeCopied] = useState(false);

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(codeString);
    if (ok) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-line shadow-md">
      {/* Code block terminal top bar */}
      <div className="bg-surface-sunken px-4 py-2 flex items-center justify-between border-b border-line text-[11px] font-mono text-content-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          <span className="ml-2 text-content-muted font-medium flex items-center gap-1">
            <Terminal className="w-3 h-3 text-content-muted" /> {t('chat.codeTerminal')}
          </span>
        </div>
        <div className="flex items-center gap-1">
        {layakDipanel && (
          <button
            type="button"
            onClick={() => onBukaPanel({
              judul: 'Source Code',
              keterangan: `${codeString.split('\n').length} lines`,
              teks: codeString,
              namaBerkas: 'code.abap',
            })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-content-muted hover:text-content hover:bg-surface-hover transition-colors text-[11px] cursor-pointer"
            title={t('chat.openInPanel')}
            aria-label={t('chat.openInPanel')}
          >
            <Columns2 className="w-3 h-3" aria-hidden="true" />
            <span className="hidden sm:inline">Panel</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-content-muted hover:text-content hover:bg-surface-hover transition-colors text-[11px] cursor-pointer"
          title={t('chat.copyCode')}
          aria-label={t('chat.copyCode')}
        >
          {codeCopied ? (
            <>
              <Check className="w-3 h-3 text-success" />
              <span className="text-success font-sans font-medium">{t('chat.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans font-medium">{t('chat.copy')}</span>
            </>
          )}
        </button>
        </div>
      </div>
      <pre className="block bg-surface-raised text-content font-mono text-xs p-4 overflow-x-auto leading-relaxed">
        <code {...props}>
          {isAbapLanguage(language)
            ? tokenizeAbap(codeString).map((tok, i) => (
                tok.type
                  ? <span key={i} className={ABAP_TOKEN_CLASS[tok.type]}>{tok.text}</span>
                  : tok.text
              ))
            : codeString}
        </code>
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
  const { t } = useLanguage();
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
        <p className="mt-1 text-[10px] text-content-subtle sm:hidden">
          {t('chat.scrollTableHint')}
        </p>
      )}
    </div>
  );
};

const ChatMessage = ({
  message,
  onBukaPanel,
  onEditMessage,
  onRegenerate,
  isStreaming = false,
  isRegenerating = false,
}) => {
  const { t, language } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [openDetail, setOpenDetail] = useState(null);
  const [feedback, setFeedback] = useState(message.feedback || null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isUser = message.role === 'user';
  const timeLabel = formatTime(message.timestamp, language);

  useEffect(() => {
    setFeedback(message.feedback || null);
  }, [message.feedback]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(message.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const startEdit = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const submitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    onEditMessage?.(message.id, trimmed);
  };

  const handleToggleFeedback = async (kind) => {
    if (!message.id) return;
    const next = feedback === kind ? null : kind;
    setFeedback(next);
    try {
      if (next === 'like' || next === 'up') {
        await api.likeMessage(message.id);
      } else if (next === 'dislike' || next === 'down') {
        await api.dislikeMessage(message.id);
      } else {
        await api.removeFeedback(message.id);
      }
    } catch (err) {
      console.error('Gagal mengirim feedback:', err);
    }
  };

  const handleRegenerateClick = () => {
    if (onRegenerate && !isRegenerating) {
      onRegenerate(message.id);
    }
  };

  const markdownComponents = useMemo(() => ({
    code({ node, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      // react-markdown v10 tidak lagi mengirim prop `inline`, jadi keputusan
      // memakai aturan asli dari commit 3fb954d: potongan kode pendek satu baris
      // tampil sebagai badge inline, sisanya baru jadi panel Source Code.
      const isMultiLine = codeString.includes('\n');
      const isBlock = isMultiLine || codeString.length > 60;

      if (match && match[1] === 'mermaid') {
        return <MermaidDiagram chart={codeString} isStreaming={isStreaming} />;
      }

      if (isBlock) {
        return (
          <CodeBlock
            codeString={codeString}
            language={match ? match[1] : ''}
            onBukaPanel={onBukaPanel}
            {...props}
          />
        );
      }
      return (
        <code className="inline bg-accent-soft border border-accent/40 text-accent-soft-fg font-mono text-[12.5px] px-1.5 py-0.5 mx-0.5 rounded-lg font-semibold shadow-2xs select-all break-words [overflow-wrap:anywhere]" {...props}>
          {codeString}
        </code>
      );
    },
    table({ children }) {
      return <ScrollableTable>{children}</ScrollableTable>;
    },
    th({ children }) {
      return (
        <th className="bg-surface-sunken px-3.5 py-2 text-left font-semibold text-content border-b border-line whitespace-nowrap">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="px-3.5 py-2 text-content-secondary border-b border-line align-top min-w-[5rem]">
          {children}
        </td>
      );
    },
    a({ href, children }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:brightness-110 font-medium"
        >
          {children}
        </a>
      );
    },
    ul({ children }) {
      return <ul className="my-2 list-disc pl-5 space-y-1 text-content-secondary break-words [overflow-wrap:anywhere]">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="my-2 list-decimal pl-5 space-y-1 text-content-secondary break-words [overflow-wrap:anywhere]">{children}</ol>;
    },
    li({ children }) {
      return <li className="leading-relaxed break-words [overflow-wrap:anywhere]">{children}</li>;
    },
    p({ children }) {
      return <p className="mb-3 last:mb-0 leading-relaxed break-words [overflow-wrap:anywhere]">{children}</p>;
    },
    h1({ children }) {
      return <h1 className="text-lg font-bold text-content mt-4 mb-2 first:mt-0 font-display">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-base font-bold text-content mt-3.5 mb-1.5 first:mt-0 font-display">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-sm font-bold text-content mt-3 mb-1 first:mt-0 font-display">{children}</h3>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="my-2.5 border-l-2 border-accent pl-3.5 italic text-content-muted bg-surface-sunken py-1 rounded-r-xl">
          {children}
        </blockquote>
      );
    },
  }), [isStreaming, onBukaPanel]);

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-2.5 sm:gap-3.5 my-4 sm:my-5 group max-w-full overflow-hidden">
        <div className="flex flex-col items-end gap-1.5 max-w-[88%] sm:max-w-[80%] min-w-0">
          {/* Label Header */}
          <div className="flex items-center gap-2 mb-1 mr-1">
            {timeLabel && <span className="text-xs text-content-subtle">{timeLabel}</span>}
            <span className="text-xs font-semibold text-content-secondary">{t('chat.you')}</span>

            {/* Tombol aksi untuk bubble pengguna (selalu tampil di HP / touch, muncul saat hover di desktop) */}
            {!isEditing && (
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {onEditMessage && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="p-1 sm:p-1.5 rounded-lg text-content-muted hover:text-content bg-surface-raised/70 sm:bg-transparent hover:bg-surface-raised transition-colors cursor-pointer"
                    title={t('chat.editQuestion')}
                    aria-label={t('chat.editQuestion')}
                  >
                    <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 sm:p-1.5 rounded-lg text-content-muted hover:text-content bg-surface-raised/70 sm:bg-transparent hover:bg-surface-raised transition-colors cursor-pointer"
                  title={copied ? t('chat.copied') : t('chat.copy')}
                  aria-label={t('chat.copy')}
                >
                  {copied ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500" /> : <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Lampiran berkas di atas bubble pesan */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 mb-1 max-w-full">
              {message.attachments.map((item) => (
                <AttachmentChip key={item.upload_id} item={item} />
              ))}
            </div>
          )}

          {/* User Bubble Gradient */}
          {isEditing ? (
            <div className="w-full min-w-[16rem] rounded-2xl border border-line bg-surface-raised p-3 shadow-md">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={t('chat.editDraft')}
                rows={Math.min(6, Math.max(2, draft.split('\n').length))}
                className="max-h-60 w-full resize-none bg-transparent px-2 py-1 text-sm text-content outline-none"
              />
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-content-muted hover:bg-surface-hover cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('chat.cancel')}
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={!draft.trim() || draft.trim() === message.content}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg shadow-xs transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {t('chat.resend')}
                </button>
              </div>
              <p className="px-2 pt-1 text-[10px] text-content-subtle">
                {t('chat.editNote')}
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
          <span className="text-xs font-semibold text-content-secondary">{t('chat.assistantName')}</span>
          {timeLabel && <span className="text-xs text-content-subtle">{timeLabel}</span>}
        </div>

        {/* AI Card Bubble with Subtle Glass Effect & Left Border Accent */}
        <div className="relative px-4 sm:px-6 py-4 sm:py-5 rounded-3xl rounded-tl-sm text-[14px] sm:text-[14.5px] leading-relaxed bg-surface-raised border border-line text-content shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80 select-text break-words [overflow-wrap:anywhere] max-w-full overflow-hidden">
          
          <div className="prose prose-sm max-w-none text-content-secondary select-text break-words [overflow-wrap:anywhere] min-w-0 max-w-full">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
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
                  {showSources ? t('chat.hideSources') : t('chat.showSources', { count: message.sources.length })}
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
                  title={t('chat.regenerate')}
                  aria-label={t('chat.regenerate')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button 
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-raised transition-all cursor-pointer"
                title={copied ? t('chat.copied') : t('chat.copy')}
                aria-label={t('chat.copy')}
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
                title={t('chat.helpful')}
                aria-label={t('chat.helpful')}
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
                title={t('chat.notHelpful')}
                aria-label={t('chat.notHelpful')}
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
                onClick={() => downloadArtifact(file, t)}
                className="flex w-full min-w-0 max-w-full sm:w-auto sm:max-w-sm items-center gap-2.5 px-3.5 py-2.5 bg-surface-raised border border-line rounded-2xl hover:border-accent transition-colors text-left group cursor-pointer"
              >
                <span className="p-2 rounded-xl bg-accent-soft text-accent-soft-fg shrink-0">
                  {ARTIFACT_ICON[file.type] || <FileText className="w-4 h-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-content truncate">{file.filename}</span>
                  <span className="block truncate text-[11px] text-content-muted">
                    {ARTIFACT_LABEL[file.type] || file.type.toUpperCase()} • {formatSize(file.size)} • {t('chat.clickToDownload')}
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
              const meta = getSourceMeta(src, t);
              return (
                <div key={idx} className="bg-surface-raised border border-line rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <span className={`p-1.5 rounded-lg shrink-0 ${meta.badgeClass}`}>
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-content">
                        {meta.title}
                      </span>
                      <span className="block text-xs text-content-muted truncate">
                        {meta.description}
                      </span>
                    </span>
                    <button
                      onClick={() => setOpenDetail(openDetail === idx ? null : idx)}
                      className="text-xs font-medium text-content-muted hover:text-content px-2 py-1 rounded-lg hover:bg-surface-hover transition-colors shrink-0 cursor-pointer"
                      aria-expanded={openDetail === idx}
                    >
                      {openDetail === idx ? t('chat.closeDetails') : t('chat.technicalDetails')}
                    </button>
                  </div>

                  {openDetail === idx && (
                    <div className="border-t border-line bg-surface-sunken px-4 py-3">
                      <div className="text-xs text-content-muted mb-1.5">
                        {t('chat.sourceLabel')} <span className="font-mono">{src.name}</span>
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