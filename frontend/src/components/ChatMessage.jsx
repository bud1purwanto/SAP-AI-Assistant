import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Code2, Database, Info, Bot, User, Copy, Check } from 'lucide-react';

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
      <div className="flex justify-end items-start gap-3 my-2">
        <div className="flex flex-col items-end max-w-[80%]">
          {/* Label Pengirim User */}
          <div className="flex items-center gap-1.5 mb-1 mr-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            <span>Anda (Pertanyaan)</span>
          </div>

          {/* Bubble Pesan User */}
          <div className="relative px-4 py-3 rounded-2xl shadow-md text-[15px] leading-relaxed bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-tr-none border border-blue-500/30">
            <p className="whitespace-pre-wrap font-normal">{message.content}</p>
          </div>
        </div>

        {/* Avatar User */}
        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 my-4">
      {/* Avatar AI */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        <Bot className="w-4 h-4" />
      </div>
      
      <div className="flex flex-col gap-1 max-w-[88%] min-w-0">
        {/* Label Pengirim AI Assistant */}
        <div className="flex items-center gap-1.5 mb-1 ml-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
          <span>SAP AI Assistant (Jawaban)</span>
        </div>

        {/* Bubble Jawaban AI */}
        <div className="relative px-5 py-4 rounded-2xl shadow-sm text-[15px] leading-relaxed bg-white dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 rounded-tl-none group">
          <div className="text-slate-700 dark:text-slate-200 prose prose-sm max-w-none space-y-2">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-700 dark:text-slate-200">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed text-slate-700 dark:text-slate-200">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
                code: ({ inline, className, children, ...props }) => {
                  return inline ? (
                    <code className="bg-slate-100 dark:bg-slate-900/90 text-blue-700 dark:text-blue-400 font-mono text-xs px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 inline-block" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-slate-900 dark:bg-slate-950 text-slate-100 font-mono text-xs p-3 rounded-lg overflow-x-auto my-2 border border-slate-800 dark:border-slate-800" {...props}>
                      {children}
                    </code>
                  );
                },
                h1: ({ children }) => <h1 className="text-lg font-bold text-slate-900 dark:text-white mt-3 mb-1">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold text-slate-900 dark:text-white mt-2.5 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2 mb-1">{children}</h3>,
                table: ({ children }) => <div className="overflow-x-auto my-2"><table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 text-xs">{children}</table></div>,
                th: ({ children }) => <th className="bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-left font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">{children}</th>,
                td: ({ children }) => <td className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">{children}</td>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          
          {/* Action Footer */}
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between opacity-70 group-hover:opacity-100 transition-opacity">
            {message.sources && message.sources.length > 0 ? (
              <button 
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-1 rounded-md transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                {showSources ? 'Hide Source' : 'View Source'}
              </button>
            ) : (
              <div></div>
            )}
            
            <div className="flex items-center gap-1">
              <button 
                onClick={handleCopy}
                className="p-1.5 rounded-md text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Copy jawaban"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setFeedback('up')}
                className={`p-1.5 rounded-md transition-colors ${feedback === 'up' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60' : 'text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Good response"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setFeedback('down')}
                className={`p-1.5 rounded-md transition-colors ${feedback === 'down' ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60' : 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                title="Bad response"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Agentic Traceability Sources */}
        {showSources && message.sources && (
          <div className="ml-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            {message.sources.map((src, idx) => (
              <div key={idx} className="bg-slate-800 dark:bg-slate-900 rounded-xl p-3 shadow-lg border border-slate-700 dark:border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                <div className="flex items-center gap-2 mb-2">
                  {src.type === 'MCP' ? (
                    <Database className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Info className="w-4 h-4 text-purple-400" />
                  )}
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{src.type}</span>
                  <span className="text-xs text-slate-400 font-medium truncate">• {src.name}</span>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/50 p-2 rounded-lg overflow-x-auto border border-slate-700/50">
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