import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';

const ChatInput = ({ onSendMessage, isLoading }) => {
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
        className="relative bg-surface-raised backdrop-blur-xl rounded-3xl border border-line shadow-xl p-2 sm:p-2.5 transition-all focus-within:border-accent"
      >
        <div className="flex items-end gap-2">
          
          {/* Subtle Feature Badge/Icon */}
          <div className="pl-3 pb-2.5 hidden sm:flex items-center text-content-subtle">
            <Sparkles className="w-4 h-4 text-accent animate-pulse" aria-hidden="true" />
          </div>

          {/* Dynamic Auto-Expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanyakan sesuatu, atau minta saya menyusun laporan…"
            aria-label="Tulis pertanyaan Anda"
            className="flex-1 max-h-[180px] py-2.5 px-2 bg-transparent text-content placeholder:text-content-subtle text-[15px] focus:outline-none resize-none leading-relaxed"
            disabled={isLoading}
          />

          {/* Action Send Button */}
          <div className="flex items-center gap-1.5 pb-1">
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${
                input.trim() && !isLoading
                  ? 'bg-accent text-accent-fg shadow-md hover:brightness-110 active:scale-95'
                  : 'bg-surface-sunken text-content-subtle cursor-not-allowed'
              }`}
              title="Kirim pesan (Enter)"
              aria-label="Kirim pesan"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Petunjuk singkat. Status versi/koneksi agen dihapus: itu informasi
            operasional yang tidak dapat ditindaklanjuti pengguna. */}
        <div className="px-3 pt-1 text-xs text-content-subtle">
          <span className="hidden sm:inline">Tekan Enter untuk mengirim, Shift + Enter untuk baris baru</span>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;