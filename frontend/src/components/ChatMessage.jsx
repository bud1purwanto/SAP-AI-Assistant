import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, ChevronDown, ChevronUp, Copy, Database, Download, FileSpreadsheet, FileText, FileType, Info, Sparkles, Terminal, ThumbsDown, ThumbsUp, User } from 'lucide-react';
import { fetchArtifactBlob } from '../lib/api';

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

const ChatMessage = ({ message }) => {
  const isUser = message.role === 'user' || message.sender === 'user';
  const [showSources, setShowSources] = useState(false);
  const [openDetail, setOpenDetail] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(false);

  const timeLabel = formatTime(message.created_at);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-3 my-4 group">
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
          {/* Label Header */}
          <div className="flex items-center gap-2 mb-1.5 mr-1 text-xs text-content-muted">
            <span className="font-semibold text-content-secondary">Anda</span>
            {timeLabel && <span>{timeLabel}</span>}
          </div>

          {/* User Message Bubble with Indigo Gradient & Soft Shadow */}
          <div className="relative px-5 py-3.5 rounded-3xl rounded-tr-sm text-[14.5px] leading-relaxed bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 text-white shadow-md shadow-indigo-500/15 border border-indigo-400/20 selection:bg-white/20">
            <p className="whitespace-pre-wrap font-normal">{message.content}</p>
          </div>
        </div>

        {/* User Avatar Circle */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-800 text-white flex items-center justify-center shrink-0 shadow-sm mt-1 border border-slate-600/30">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3.5 my-5 group">
      {/* AI Avatar with Glowing Gradient Ring */}
      <div className="relative mt-1 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 via-emerald-500 to-indigo-500 p-[1.5px] shadow-sm shadow-emerald-500/20">
          <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-1.5 max-w-[90%] sm:max-w-[85%] min-w-0 flex-1">
        {/* Label Header */}
        <div className="flex items-center gap-2 mb-1.5 ml-1">
          <span className="text-xs font-semibold text-content-secondary">Asisten SAP</span>
          {timeLabel && <span className="text-xs text-content-subtle">{timeLabel}</span>}
        </div>

        {/* AI Card Bubble with Subtle Glass Effect & Left Border Accent */}
        <div className="relative px-6 py-5 rounded-3xl rounded-tl-sm text-[14.5px] leading-relaxed bg-surface-raised border border-line text-content shadow-sm transition-all hover:border-slate-300 dark:hover:border-slate-700/80">
          
          <div className="prose prose-sm max-w-none text-content-secondary">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed text-content-secondary">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-2.5 space-y-1 text-content-secondary">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-2.5 space-y-1 text-content-secondary">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-content">{children}</strong>,
                // className sengaja diambil terpisah agar tidak ikut tersebar ke ...props
                code: ({ inline, className: _className, children, ...props }) => {
                  const codeString = String(children || '').replace(/\n$/, '');
                  const isMultiLine = codeString.includes('\n');
                  const isShort = !isMultiLine && codeString.length <= 60;

                  if (inline || isShort) {
                    return (
                      <code 
                        className="inline-flex items-center font-mono text-[12.5px] px-2 py-0.5 mx-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60 font-semibold shadow-2xs select-all" 
                        {...props}
                      >
                        {codeString}
                      </code>
                    );
                  }

                  return (
                    <div className="my-3 rounded-2xl overflow-hidden border border-slate-800 shadow-md">
                      {/* Code block terminal top bar */}
                      <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800 text-[11px] font-mono text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                          <span className="ml-2 text-slate-400 font-medium flex items-center gap-1">
                            <Terminal className="w-3 h-3 text-slate-400" /> ABAP / Source Code
                          </span>
                        </div>
                      </div>
                      <pre className="block bg-slate-900 text-slate-100 font-mono text-xs p-4 overflow-x-auto leading-relaxed">
                        <code {...props}>{codeString}</code>
                      </pre>
                    </div>
                  );
                },
                h1: ({ children }) => <h1 className="text-lg font-bold text-content mt-4 mb-2 font-display">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold text-content mt-3 mb-1.5 font-display">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold text-content mt-2.5 mb-1 font-display">{children}</h3>,
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-xl border border-line shadow-sm">
                    <table className="min-w-full divide-y divide-line text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => <th className="bg-surface-sunken px-3.5 py-2 text-left font-semibold text-content">{children}</th>,
                td: ({ children }) => (
                  <td className="px-3.5 py-2 border-t border-line text-content-secondary tabular-nums">{children}</td>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          
          {/* Action Footer Bar */}
          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
            {message.sources && message.sources.length > 0 ? (
              <button 
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:brightness-110 bg-accent-soft px-3 py-1.5 rounded-xl transition-all border border-accent/20"
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {showSources ? 'Sembunyikan sumber' : `Lihat sumber data (${message.sources.length})`}
                </span>
                {showSources ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
              </button>
            ) : (
              <div></div>
            )}
            
            <div className="flex items-center gap-1 bg-surface-sunken p-0.5 rounded-xl border border-line">
              <button 
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white  transition-all"
                title="Salin jawaban"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setFeedback('up')}
                className={`p-1.5 rounded-lg transition-all ${feedback === 'up' ? 'text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-700 shadow-xs' : 'text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white '}`}
                title="Jawaban membantu"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setFeedback('down')}
                className={`p-1.5 rounded-lg transition-all ${feedback === 'down' ? 'text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-700 shadow-xs' : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white '}`}
                title="Jawaban kurang sesuai"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Berkas hasil (Excel/CSV) yang dibuat asisten */}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.artifacts.map((file) => (
              <button
                key={file.artifact_id}
                onClick={() => downloadArtifact(file)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 bg-surface-raised border border-line rounded-2xl hover:border-accent transition-colors text-left group"
              >
                <span className="p-2 rounded-xl bg-accent-soft text-accent-soft-fg shrink-0">
                  {ARTIFACT_ICON[file.type] || <FileText className="w-4 h-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-content truncate max-w-[16rem]">{file.filename}</span>
                  <span className="block text-[11px] text-content-muted">
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