import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Paperclip, CornerDownLeft, Database } from 'lucide-react';

const ChatInput = ({ onSendMessage, isLoading, isLimitReached, onPromptLimitHit }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLimitReached) {
      if (onPromptLimitHit) onPromptLimitHit();
      return;
    }

    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 sm:pb-6">
      {/* Floating Island Container with Glassmorphism and Glow on Focus */}
      <form 
        onSubmit={handleSubmit}
        className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/60 p-2 sm:p-2.5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/80"
      >
        <div className="flex items-end gap-2">
          
          {/* Subtle Feature Badge/Icon */}
          <div className="pl-3 pb-2.5 hidden sm:flex items-center text-slate-400 dark:text-slate-500">
            <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
          </div>

          {/* Dynamic Auto-Expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLimitReached ? "Batas limit tercapai. Silakan login untuk melanjutkan..." : "Tanyakan seputar SAP PO, Stock Material, Sales Order, Vendor..."}
            className="flex-1 max-h-[180px] py-2 px-2 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none resize-none leading-relaxed"
            disabled={isLoading}
          />

          {/* Action Send Button */}
          <div className="flex items-center gap-1.5 pb-1">
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${
                input.trim() && !isLoading
                  ? 'bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-500 text-white shadow-md shadow-indigo-500/30 hover:scale-105 active:scale-95'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
              title="Kirim pesan (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating helper shortcuts footer */}
        <div className="flex items-center justify-between px-3 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline font-mono">Shift + Enter untuk baris baru</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Agent v1.0 • Connected</span>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;