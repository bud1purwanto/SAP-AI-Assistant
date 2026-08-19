import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, ChevronDown, ChevronUp, Copy, Database, Download, FileSpreadsheet, FileText, Info, Sparkles, Terminal, ThumbsDown, ThumbsUp, User } from 'lucide-react';
import { fetchArtifactBlob } from '../lib/api';

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

const ChatMessage = ({ message }) => {
  const isUser = message.role === 'user' || message.sender === 'user';
  const [showSources, setShowSources] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(false);

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
          <div className="flex items-center gap-1.5 mb-1.5 mr-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 tracking-wider">
            <span>You</span>
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
        <div className="flex items-center gap-2 mb-1 ml-1">
          <span className="text-[11px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-indigo-600 dark:from-teal-400 dark:to-indigo-400 uppercase tracking-wider">
            SAP AI Assistant
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
            ECC 6.0 & RAG
          </span>
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
                td: ({ children }) => <td className="px-3.5 py-2 border-t border-line text-content-secondary font-mono">{children}</td>,
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
                className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100/60 px-2.5 py-1 rounded-lg transition-all border border-teal-200/50 dark:border-teal-800/40"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{showSources ? 'Hide Data Trace' : 'View Data Trace'}</span>
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
                  {file.type === 'csv'
                    ? <FileText className="w-4 h-4" aria-hidden="true" />
                    : <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-content truncate max-w-[16rem]">{file.filename}</span>
                  <span className="block text-[11px] text-content-muted">
                    {file.type.toUpperCase()} • {formatSize(file.size)} • klik untuk unduh
                  </span>
                </span>
                <Download className="w-4 h-4 text-content-subtle group-hover:text-accent shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {/* Traceability Sources Accordion */}
        {showSources && message.sources && (
          <div className="mt-1 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {message.sources.map((src, idx) => (
              <div key={idx} className="bg-slate-900 rounded-2xl p-3.5 shadow-md border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-teal-500 to-indigo-500"></div>
                <div className="flex items-center gap-2 mb-2 pl-1">
                  {src.type === 'MCP' ? (
                    <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                  )}
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{src.type} Source</span>
                  <span className="text-[11px] text-slate-400 font-mono truncate">• {src.name}</span>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded-xl overflow-x-auto border border-slate-800/80 leading-relaxed">
                  {src.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;