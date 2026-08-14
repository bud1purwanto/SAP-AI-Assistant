import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Code2, Database, Info, Bot } from 'lucide-react';

const ChatMessage = ({ message }) => {
  const isUser = message.role === 'user';
  const [showSources, setShowSources] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] relative px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed bg-blue-600 text-white rounded-br-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0 mt-1">
        <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      
      <div className="flex flex-col gap-2 max-w-[85%]">
        <div className="relative px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 rounded-bl-sm group">
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
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity">
            {message.sources && message.sources.length > 0 ? (
              <button 
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 px-2 py-1 rounded-md transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                {showSources ? 'Hide Source' : 'View Source'}
              </button>
            ) : (
              <div></div>
            )}
            
            <div className="flex items-center gap-1">
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